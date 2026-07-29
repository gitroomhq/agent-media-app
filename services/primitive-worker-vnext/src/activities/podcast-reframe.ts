// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * make_podcast step 2 — the LOCKED per-actor close-up.
 *
 * Reframes the master two-shot (podcast-scene) into a single-person vertical
 * 9:16 close-up of ONE side, keeping the exact same desk, microphone, background
 * and lighting. A multi-reference edit re-locks the face from that actor's OWN
 * reference (image 2) so the close-up can't drift from the two-shot crop.
 *
 * This frame is reused as the appearance target for EVERY talking turn of that
 * actor, which is what guarantees identical seat / desk / mic / position across
 * all of the podcast's cuts. No credits are charged (a free internal image step).
 */

import { ApplicationFailure, Context } from '@temporalio/activity';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { generateImageWithFallback, classifyOpenAIError } from '../client/openai.js';
import { r2UploadVnext } from '../client/r2.js';
import { sanitizeImagePrompt } from '../lib/sanitize-prompt.js';
import { withHeartbeat } from '../lib/heartbeat.js';
import { fetchImageRef } from './podcast-scene.js';

export interface PodcastReframeActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  /** R2 URL of the master two-shot (from podcastScene). */
  master_url: string;
  /** R2 reference image of THIS actor (re-locks the face during the crop). */
  actor_ref_url: string;
  /** Which seat in the master to crop to. */
  side: 'left' | 'right';
}

export interface PodcastReframeActivityResult {
  primitive_run_id: string;
  frame_url: string;
  provider: 'gpt-image-2';
  artifact_id: string;
}

export function makePodcastReframeActivity(cfg: WorkerConfig) {
  return async function podcastReframe(
    activityInput: PodcastReframeActivityInput,
  ): Promise<PodcastReframeActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    // Retry-safety: a completed run early-returns its banked frame.
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
        frame_url: art.url,
        provider: 'gpt-image-2',
        artifact_id: art.id,
      };
    }

    // SSRF guard: master + actor reference must be on our R2 public prefix.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    for (const [label, url] of [
      ['master_url', activityInput.master_url],
      ['actor_ref_url', activityInput.actor_ref_url],
    ] as const) {
      if (!url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `${label} must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
    }

    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'podcast_reframe',
        status: 'submitted',
        input: { master_url: activityInput.master_url, actor_ref_url: activityInput.actor_ref_url, side: activityInput.side },
        estimated_credits_usd: 0,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(`primitive_runs upsert failed: ${upsertErr.message}`);

    const masterBytes = await fetchImageRef(activityInput.master_url, 'master_url');
    const actorBytes = await fetchImageRef(activityInput.actor_ref_url, 'actor_ref_url');
    Context.current().heartbeat({ stage: 'references_fetched' });

    const sideWord = activityInput.side === 'left' ? 'LEFT' : 'RIGHT';
    // Each host is shot looking ACROSS the set at the other person, not at the
    // camera: the left seat looks to frame-right, the right seat looks to frame-left.
    const gaze =
      activityInput.side === 'left'
        ? 'turned to their RIGHT and looking toward the other host seated across from them (their gaze goes off to the RIGHT side of the frame)'
        : 'turned to their LEFT and looking toward the other host seated across from them (their gaze goes off to the LEFT side of the frame)';
    const prompt = sanitizeImagePrompt(
      `Reframe this podcast scene (reference image 1) into a single-person vertical 9:16 close-up of the ${sideWord} person ONLY. ` +
        `Keep them in the exact same seat and set, with the same microphone near them and the same background, lighting and ` +
        `wardrobe — do not change the room, the seating, the mic or the outfit. ` +
        `Show them in three-quarter profile, ${gaze}, engaged and mid-conversation as if talking with someone across from them — ` +
        `they must NEVER look straight into the camera. ` +
        `The person must look exactly like reference image 2 (identical face, hair, skin and features). ` +
        `Waist-up framing, relaxed conversational posture, steady locked-off single-camera shot. ` +
        `Photorealistic, sharp focus, realistic natural skin texture, no text, no captions, no watermark. Vertical 9:16 composition.`,
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
            // image 1 = the shared set (master); image 2 = this actor's face lock.
            referencePngs: [masterBytes, actorBytes],
            size: '1024x1536',
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
      `podcast-frame-${activityInput.side}.png`,
      bytes,
      'image/png',
    );
    Context.current().heartbeat({ stage: 'r2_uploaded' });

    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: activityInput.primitive_run_id,
        kind: 'podcast_frame',
        url: publicUrl,
        bytes: bytes.byteLength,
        mime: 'image/png',
        metadata: {
          provider: 'gpt-image-2',
          model: cfg.openai.imageModel,
          simulated: cfg.openai.simulate,
          side: activityInput.side,
          master_url: activityInput.master_url,
          actor_ref_url: activityInput.actor_ref_url,
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
      frame_url: publicUrl,
      provider: 'gpt-image-2',
      artifact_id: artifact.id as string,
    };
  };
}

function makeStubPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
