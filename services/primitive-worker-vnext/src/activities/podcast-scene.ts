// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * make_podcast step 1 — the MASTER two-shot scene.
 *
 * Composites BOTH saved actors into ONE photoreal image: two people recording a
 * podcast side-by-side at the same desk, each with a microphone, in one shared
 * room. This is the single source of truth for the shared set (desk, mics,
 * lighting, background) — the reframe step then crops it into a locked per-actor
 * close-up, so every cut of the podcast lives in the identical room.
 *
 * gpt-image-2 multi-reference edit: reference image 1 = actor A, image 2 = actor
 * B (via the referencePngs array added to the openai client). No credits are
 * charged for this internal image step (like the character sheet inside a video).
 */

import { ApplicationFailure, Context } from '@temporalio/activity';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { generateImageWithFallback, classifyOpenAIError } from '../client/openai.js';
import { r2UploadVnext } from '../client/r2.js';
import { sanitizeImagePrompt } from '../lib/sanitize-prompt.js';
import { withHeartbeat } from '../lib/heartbeat.js';

export interface PodcastSceneActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  /** R2 reference image of actor A (a clean portrait is preferred, else the sheet). */
  a_ref_url: string;
  /** R2 reference image of actor B. */
  b_ref_url: string;
  /** Optional studio description; a warm modern podcast studio by default. */
  room?: string;
}

export interface PodcastSceneActivityResult {
  primitive_run_id: string;
  master_url: string;
  provider: 'gpt-image-2';
  artifact_id: string;
}

const DEFAULT_ROOM =
  'a warm, softly-lit modern podcast studio with acoustic wall panels and subtle ambient accent lighting';

export function makePodcastSceneActivity(cfg: WorkerConfig) {
  return async function podcastScene(
    activityInput: PodcastSceneActivityInput,
  ): Promise<PodcastSceneActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    // Retry-safety: a completed run early-returns its banked master so a workflow
    // retry never re-generates (and never re-pays the provider).
    const { data: existing, error: existingErr } = await db
      .from('primitive_runs')
      .select('status, primitive_artifacts(id, url)')
      .eq('id', activityInput.primitive_run_id)
      .maybeSingle();
    if (existingErr) throw new Error(`primitive_runs lookup failed: ${existingErr.message}`);
    if (existing && existing.status === 'succeeded') {
      const art = (existing.primitive_artifacts as Array<{ id: string; url: string }> | null)?.[0];
      if (!art) {
        throw new Error(
          `inconsistent state: primitive_run ${activityInput.primitive_run_id} is succeeded but has no artifact`,
        );
      }
      return {
        primitive_run_id: activityInput.primitive_run_id,
        master_url: art.url,
        provider: 'gpt-image-2',
        artifact_id: art.id,
      };
    }

    // SSRF guard: both references must live on our R2 public prefix.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    for (const [label, url] of [
      ['a_ref_url', activityInput.a_ref_url],
      ['b_ref_url', activityInput.b_ref_url],
    ] as const) {
      if (!url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `${label} must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
    }

    // Record the run BEFORE the provider call so a poll finds it (no credits — a
    // free internal image step, like the character sheet inside a video).
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'podcast_scene',
        status: 'submitted',
        input: { a_ref_url: activityInput.a_ref_url, b_ref_url: activityInput.b_ref_url, room: activityInput.room ?? null },
        estimated_credits_usd: 0,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(`primitive_runs upsert failed: ${upsertErr.message}`);

    const aBytes = await fetchImageRef(activityInput.a_ref_url, 'a_ref_url');
    const bBytes = await fetchImageRef(activityInput.b_ref_url, 'b_ref_url');
    Context.current().heartbeat({ stage: 'references_fetched' });

    const room = activityInput.room?.trim() || DEFAULT_ROOM;
    const prompt = sanitizeImagePrompt(
      `A photorealistic wide two-shot photograph of TWO different people recording a podcast together in ONE shared set: ${room}. ` +
        `They sit close together in the SAME space — either at one shared desk or on shared couch/lounge seating as the set implies — ` +
        `ANGLED TOWARD EACH OTHER in conversation: the person on the LEFT is turned to their right and the person on the RIGHT is ` +
        `turned to their left, so the two face EACH OTHER in three-quarter profile and are clearly looking at one another — ` +
        `NOT looking at the camera. ` +
        `The person on the LEFT looks exactly like reference image 1 (identical face, hair, skin and features). ` +
        `The person on the RIGHT looks exactly like reference image 2 (identical face, hair, skin and features). ` +
        `They are two distinct people, each matching their own reference photo — do not blend or swap them. ` +
        `Each has a podcast microphone near them, framed from the waist up, relaxed engaged posture, mid-conversation as if ` +
        `listening and responding to each other. ` +
        `Even, flattering studio lighting; sharp focus; realistic natural skin texture; candid documentary photography; ` +
        `no text, no logos, no captions, no watermark. Horizontal 16:9 composition.`,
    );

    let bytes: Buffer;
    if (cfg.openai.simulate) {
      bytes = makeStubPng();
    } else {
      try {
        const out = await withHeartbeat('provider_working', () =>
          generateImageWithFallback(cfg.openai, {
            model: cfg.openai.imageModel,
            prompt,
            // Two-shot master: BOTH actors composited into one shared set via the
            // multi-reference edit. Landscape so the two seats fit side by side.
            referencePngs: [aBytes, bBytes],
            size: '1536x1024',
          }),
        );
        bytes = out.bytes;
      } catch (err) {
        const classified = classifyOpenAIError(err);
        if (classified.retryable) throw err instanceof Error ? err : new Error(String(err));
        throw ApplicationFailure.nonRetryable(classified.message, classified.code);
      }
    }
    Context.current().heartbeat({ stage: 'provider_done', bytes: bytes.byteLength });

    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      activityInput.primitive_run_id,
      'podcast-scene.png',
      bytes,
      'image/png',
    );
    Context.current().heartbeat({ stage: 'r2_uploaded' });

    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: activityInput.primitive_run_id,
        kind: 'podcast_scene',
        url: publicUrl,
        bytes: bytes.byteLength,
        mime: 'image/png',
        metadata: {
          provider: 'gpt-image-2',
          model: cfg.openai.imageModel,
          simulated: cfg.openai.simulate,
          a_ref_url: activityInput.a_ref_url,
          b_ref_url: activityInput.b_ref_url,
        },
      })
      .select('id')
      .single();
    if (artErr || !artifact) {
      throw new Error(`primitive_artifacts insert failed: ${artErr?.message ?? 'no row'}`);
    }
    const { error: finErr } = await db
      .from('primitive_runs')
      .update({ status: 'succeeded', actual_credits_usd: 0, finished_at: new Date().toISOString() })
      .eq('id', activityInput.primitive_run_id);
    if (finErr) throw new Error(`primitive_runs finalize failed: ${finErr.message}`);

    return {
      primitive_run_id: activityInput.primitive_run_id,
      master_url: publicUrl,
      provider: 'gpt-image-2',
      artifact_id: artifact.id as string,
    };
  };
}

/** Fetch + validate an R2 image reference into bytes. 5xx = transient (retry);
 *  4xx / non-image = non-retryable (a bad reference never fixes itself). */
export async function fetchImageRef(url: string, label: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (resp.status >= 500) throw new Error(`${label} fetch transient ${resp.status}`);
  if (!resp.ok) {
    throw ApplicationFailure.nonRetryable(`${label} fetch failed (${resp.status})`, 'REFERENCE_FETCH_FAILED');
  }
  const ct = resp.headers.get('content-type') ?? '';
  if (!ct.startsWith('image/')) {
    throw ApplicationFailure.nonRetryable(`${label} is not an image (content-type=${ct})`, 'REFERENCE_NOT_IMAGE');
  }
  return Buffer.from(await resp.arrayBuffer());
}

function makeStubPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
