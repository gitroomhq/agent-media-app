// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { SimpleSelfieToolInputSchema } from '@agentmedia/schema';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { r2UploadVnext } from '../client/r2.js';
import { buildSimpleSelfiePrompt } from '../client/anthropic.js';
import { generateSimpleSelfieEvolink } from '../client/evolink.js';
import { withHeartbeat } from '../lib/heartbeat.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

export interface SimpleSelfieActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  /** Optional voice timbre reference (R2 .mp3). When set, Seedance speaks the
   *  script in this voice (@Audio1) — used by broll_talking_head to carry take
   *  1's native voice into take 2+ so the voice stays consistent across cuts. */
  voice_ref_audio_url?: string;
  /** Optional clean close-up portrait (R2 image) of the SAME person as the
   *  character sheet. Passed as a second identity reference so Seedance locks
   *  likeness from a clean face plus the sheet's poses (higher-fidelity faces). */
  portrait_url?: string;
  /** Optional continuity frame (R2 image). When set it's passed as a second
   *  image reference and prompted as the EXACT first frame, so this take starts
   *  where the previous take ended (no jump-cut). Identity still comes from the
   *  primary character_sheet image, so this is one hop — no generational decay.
   *  Used only as a FALLBACK when continuation_video_url is unavailable. */
  first_frame_url?: string;
  /** Optional continuity VIDEO (R2 mp4 — the tail of the previous take). When
   *  set, Seedance 2.0 continues from it (@video1) preserving motion, lighting
   *  and micro-expression across the cut — far more seamless than a still frame.
   *  Identity stays anchored to the character sheet (@image1). Preferred over
   *  first_frame_url. */
  continuation_video_url?: string;
  /** Optional fixed seed forwarded to Seedance. The broll workflow derives ONE
   *  seed per render and passes the SAME value to every take so the look (face,
   *  framing, wardrobe) stays consistent across cuts instead of rerolling on
   *  each independent generation. */
  seed?: number;
  /** When true, do NOT instruct the model to stretch speech to fill the whole
   *  clip. Short lines otherwise get padded with gibberish to reach the 5/10/15s
   *  length; a podcast turn should be spoken at a natural pace, then the host
   *  simply pauses/listens. Opt-in — other skills keep the fill-the-duration
   *  behavior. */
  natural_pacing?: boolean;
  input: unknown;
}

export interface SimpleSelfieActivityResult {
  primitive_run_id: string;
  video_url: string;
  provider: 'seedance-2-0';
  credits_actual_usd: number;
  artifact_id: string;
  duration_seconds: 5 | 10 | 15;
}

const PER_DURATION_USD: Record<5 | 10 | 15, number> = {
  5: 0.6,
  10: 1.2,
  15: 1.8,
};

export function makeSimpleSelfieActivity(cfg: WorkerConfig) {
  return async function simpleSelfie(
    activityInput: SimpleSelfieActivityInput,
  ): Promise<SimpleSelfieActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = SimpleSelfieToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `simple_selfie input invalid: ${parsed.error.message}`,
        'INVALID_INPUT',
      );
    }
    const input = parsed.data;

    // Retry-safety
    const { data: existing, error: existingErr } = await db
      .from('primitive_runs')
      .select('status, actual_credits_usd, primitive_artifacts(id, url, metadata)')
      .eq('id', activityInput.primitive_run_id)
      .maybeSingle();
    if (existingErr) throw new Error(`primitive_runs lookup failed: ${existingErr.message}`);
    if (existing && existing.status === 'succeeded') {
      const art = (existing.primitive_artifacts as Array<{ id: string; url: string; metadata: any }> | null)?.[0];
      if (!art) {
        throw new Error(
          `inconsistent state: primitive_run ${activityInput.primitive_run_id} is succeeded but has no artifact`,
        );
      }
      return {
        primitive_run_id: activityInput.primitive_run_id,
        video_url: art.url,
        provider: 'seedance-2-0',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
        duration_seconds: input.duration,
      };
    }

    // SSRF guard
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    if (!input.character_sheet_url.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `character_sheet_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }

    // Budget
    const estimatedUsd = PER_DURATION_USD[input.duration];
    if (estimatedUsd > cfg.caps.primitiveUsd) {
      throw ApplicationFailure.nonRetryable(
        `estimated $${estimatedUsd} exceeds per-primitive cap $${cfg.caps.primitiveUsd}`,
        'BUDGET_CAP_PRIMITIVE',
      );
    }
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data: dayRows, error: dayErr } = await db
      .from('primitive_runs')
      .select('actual_credits_usd')
      .eq('user_id', activityInput.user_id)
      .gte('created_at', since.toISOString())
      .not('actual_credits_usd', 'is', null);
    if (dayErr) throw new Error(`day-cap query failed: ${dayErr.message}`);
    const dayUsed = (dayRows ?? []).reduce(
      (s, r) => s + Number(r.actual_credits_usd ?? 0),
      0,
    );
    if (dayUsed + estimatedUsd > cfg.caps.dayUsd) {
      throw ApplicationFailure.nonRetryable(
        `day budget exceeded: used $${dayUsed.toFixed(2)} + estimate $${estimatedUsd} > cap $${cfg.caps.dayUsd}`,
        'BUDGET_CAP_DAY',
      );
    }

    // Upsert run row
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'simple_selfie',
        status: 'submitted',
        input,
        idempotency_key: activityInput.idempotency_key ?? null,
        estimated_credits_usd: estimatedUsd,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(`primitive_runs upsert failed: ${upsertErr.message}`);

    await deductPrimitiveCredits({
      db,
      userId: activityInput.user_id,
      primitiveRunId: activityInput.primitive_run_id,
      primitive: 'simple_selfie',
      duration: input.duration,
      description: `vNext simple_selfie ${input.duration}s`,
    });

    try {

    // Step 1: Haiku-built prompt
    let prompt = await buildSimpleSelfiePrompt(cfg.anthropic.apiKey, input, cfg.anthropic.model);
    // Voice carry-over: when a timbre reference is supplied, instruct Seedance to
    // SPEAK THE SCRIPT in that voice (not lip-sync to the literal track). The
    // @Audio1 tag is how Seedance 2.0 binds the reference audio in the prompt.
    const voiceRef = activityInput.voice_ref_audio_url;
    if (voiceRef) {
      if (!voiceRef.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `voice_ref_audio_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
      prompt = `${prompt} The person speaks in the exact same voice, timbre, accent and delivery style as the reference audio @Audio1 — same speaker — not a different voice.`;
    }
    // Identity references: LEAD with the clean close-up portrait (the dominant,
    // clean-skin face prior) when available, then the character sheet (poses).
    // image_urls[0] is the primary appearance target, so a sharp clean portrait
    // there yields a cleaner, more consistent face than the busy pose grid alone.
    const portrait = activityInput.portrait_url;
    if (portrait && !portrait.startsWith(allowedPrefix)) {
      throw ApplicationFailure.nonRetryable(
        `portrait_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
        'REFERENCE_URL_NOT_ALLOWED',
      );
    }
    const identityImages: string[] = portrait
      ? [portrait, input.character_sheet_url]
      : [input.character_sheet_url];
    prompt = `${prompt} The person must look exactly like the reference photo${identityImages.length > 1 ? 's (same person in every one)' : ' (image 1)'} — identical face, hair, skin and features.`;
    // Skin-texture lock (always, identical wording on every take): independent
    // takes otherwise render slightly different skin (smooth on one, freckled/
    // grainy on the next) and the face looks like it "decays". Pin the skin to
    // image 1 so every take renders the same clean, even texture.
    prompt = `${prompt} Render clean, smooth, evenly-textured matte skin with the same fine natural texture as image 1 in every shot — identical skin, the same freckle and pore level, no added freckles, no grain, no blotchiness, no roughness and no compression artifacts.`;
    // Wardrobe lock (always): pin the outfit to the reference so it never drifts.
    prompt = `${prompt} The person wears the exact same outfit and clothing as in the reference image in every shot — identical garments, colours, layers and accessories; never change clothes.`;

    // NO frame/video conditioning between takes. The reference-to-video model is a
    // diffusion model: ANY image in image_urls (a prior take's last frame) or
    // video in video_urls (@video1 tail) is treated as an APPEARANCE target, not a
    // pose-only hint, so it bleeds that take's grain forward and the face decays
    // (empirically: clean early take → grainy later take through exactly that
    // path). Every take is therefore generated purely from the pristine references
    // above; continuity (no visible cut) is handled by a short cross-dissolve at
    // the compose step instead.
    const imageUrls = [...identityImages];
    // Verbatim, timed speech: the script reaches the prompt via Haiku, which can
    // reword it. Re-assert the EXACT words as the authoritative spoken line and
    // tie the pace to the take length so the actor says precisely what the user
    // wrote, filling the full clip (the "speak my script, by time" requirement).
    if (input.script && input.script.trim()) {
      // Pacing: by default we ask the model to fill the whole clip (good for a
      // single UGC take). For a podcast turn (natural_pacing) that padding turns
      // a short line into gibberish, so instead the host speaks the line and then
      // pauses/listens — no invented filler.
      const paceClause = activityInput.natural_pacing
        ? ` Speak it at a natural, conversational pace. If the line is short, finish speaking and then simply close your mouth, pause and listen — do NOT add any extra words, filler, mumbling, or vocal sounds to fill the remaining time; silence is correct.`
        : ` Speak it at a natural, unhurried pace that fills the full ${input.duration} seconds.`;
      prompt = `${prompt} The person says this line out loud, word for word exactly as written, with no additions, omissions, paraphrasing or reordering: "${input.script.trim()}".${paceClause}`;
    }
    Context.current().heartbeat({ stage: 'prompt_built' });
    {
      const { error: pErr } = await db
        .from('primitive_runs')
        .update({ input: { ...input, generated_prompt: prompt } })
        .eq('id', activityInput.primitive_run_id);
      if (pErr) Context.current().heartbeat({ stage: 'prompt_persist_warning', error: pErr.message });
    }

    // Step 2: Seedance video generation (simulate-aware)
    let videoBytes: Buffer;
    let providerTaskId: string | null = null;
    let providerVideoUrl: string | null = null;
    if (cfg.openai.simulate) {
      // Simulate: tiny 1-byte placeholder. Not playable but enough to wire up.
      videoBytes = Buffer.from('SIMULATED', 'utf8');
    } else {
      const evolinkKey = process.env.EVOLINK_API_KEY?.trim() || process.env.EVOLINK_API_KEYS?.trim();
      if (!evolinkKey) {
        throw ApplicationFailure.nonRetryable(
          'EVOLINK_API_KEY not configured on primitive-worker-vnext',
          'PROVIDER_UNCONFIGURED',
        );
      }
      try {
        const result = await withHeartbeat('seedance_working', () => generateSimpleSelfieEvolink({
          prompt,
          // Pristine identity references only (portrait-led + character sheet). No
          // video_urls / first-frame conditioning — that decayed the face.
          imageUrls,
          duration: input.duration,
          aspectRatio: input.aspect_ratio === '1:1' ? '1:1' : '9:16',
          // Audio on for speech (script) or when music is requested; off for a
          // silent action clip so Seedance doesn't invent dialogue.
          generateAudio: Boolean(input.script || input.background_music),
          quality: '720p',
          ...(voiceRef ? { audioUrls: [voiceRef] } : {}),
          // Same seed on every take (broll passes one render-wide seed) so the
          // look is pinned across cuts instead of rerolling each generation.
          ...(activityInput.seed != null ? { seed: activityInput.seed } : {}),
        }));
        providerTaskId = result.taskId;
        providerVideoUrl = result.videoUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = (err as any)?.status as number | undefined;
        // 429 (rate limit) and 402 (out of balance) are TRANSIENT — let them retry
        // with backoff instead of permanently killing the render (the "R&D 402s
        // broke prod" class). Only true 4xx caller faults are non-retryable.
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429 && status !== 402) {
          throw ApplicationFailure.nonRetryable(`evolink ${status}: ${msg}`, `EVOLINK_${status}`);
        }
        throw err instanceof Error ? err : new Error(msg);
      }
      Context.current().heartbeat({ stage: 'provider_done', taskId: providerTaskId });
      // Download bytes from BytePlus
      const dlResp = await fetch(providerVideoUrl, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (!dlResp.ok) throw new Error(`byteplus video download ${dlResp.status}`);
      videoBytes = Buffer.from(await dlResp.arrayBuffer());
    }
    Context.current().heartbeat({ stage: 'video_downloaded', bytes: videoBytes.byteLength });

    // R2 upload
    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      activityInput.primitive_run_id,
      'simple-selfie.mp4',
      videoBytes,
      'video/mp4',
    );
    Context.current().heartbeat({ stage: 'r2_uploaded' });

    // Provider task ledger row
    if (providerTaskId) {
      await db.from('provider_tasks').insert({
        primitive_run_id: activityInput.primitive_run_id,
        provider: 'seedance-2-0',
        external_task_id: providerTaskId,
        status: 'succeeded',
        raw_response: { provider_video_url: providerVideoUrl },
      });
    }

    // Artifact + finalize
    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: activityInput.primitive_run_id,
        kind: 'selfie_video',
        url: publicUrl,
        bytes: videoBytes.byteLength,
        mime: 'video/mp4',
        metadata: {
          provider: 'seedance-2-0',
          model: process.env.EVOLINK_SEEDANCE_MODEL || 'seedance-2.0-mini-reference-to-video',
          simulated: cfg.openai.simulate,
          aspect_ratio: input.aspect_ratio,
          duration_seconds: input.duration,
          source_character_sheet_url: input.character_sheet_url,
        },
      })
      .select('id')
      .single();
    if (artErr || !artifact) {
      throw new Error(`primitive_artifacts insert failed: ${artErr?.message ?? 'no row'}`);
    }
    const { error: finErr } = await db
      .from('primitive_runs')
      .update({
        status: 'succeeded',
        actual_credits_usd: estimatedUsd,
        finished_at: new Date().toISOString(),
        provider_task_id: providerTaskId,
      })
      .eq('id', activityInput.primitive_run_id);
    if (finErr) throw new Error(`primitive_runs finalize failed: ${finErr.message}`);

    return {
      primitive_run_id: activityInput.primitive_run_id,
      video_url: publicUrl,
      provider: 'seedance-2-0',
      credits_actual_usd: estimatedUsd,
      artifact_id: artifact.id as string,
      duration_seconds: input.duration,
    };
    } catch (err) {
      if (err instanceof ApplicationFailure && err.nonRetryable) {
        await refundPrimitiveCredits(db, activityInput.primitive_run_id);
      }
      throw err;
    }
  };
}
