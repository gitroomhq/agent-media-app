// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { ProductInHandsToolInputSchema } from '@agentmedia/schema';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { r2UploadVnext } from '../client/r2.js';
import { buildProductInHandsPrompt } from '../client/anthropic.js';
import { generateSimpleSelfieEvolink } from '../client/evolink.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

export interface ProductInHandsActivityInput {
  primitive_run_id: string;
  user_id: string;
  skill_run_id?: string;
  idempotency_key?: string;
  input: unknown;
}

export interface ProductInHandsActivityResult {
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

export function makeProductInHandsActivity(cfg: WorkerConfig) {
  return async function productInHands(
    activityInput: ProductInHandsActivityInput,
  ): Promise<ProductInHandsActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = ProductInHandsToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `product_in_hands input invalid: ${parsed.error.message}`,
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

    // SSRF guard — both reference images must be on our R2 public URL.
    const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
    for (const [label, url] of [
      ['character_sheet_url', input.character_sheet_url],
      ['product_image_url', input.product_image_url],
    ] as const) {
      if (!url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `${label} must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
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
        primitive_id: 'product_in_hands',
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
      primitive: 'product_in_hands',
      duration: input.duration,
      description: `vNext product_in_hands ${input.duration}s`,
    });

    try {

    // Step 1: Haiku-built prompt (holds & shows the product from ref #2)
    const prompt = await buildProductInHandsPrompt(cfg.anthropic.apiKey, input, cfg.anthropic.model);
    Context.current().heartbeat({ stage: 'prompt_built' });
    {
      const { error: pErr } = await db
        .from('primitive_runs')
        .update({ input: { ...input, generated_prompt: prompt } })
        .eq('id', activityInput.primitive_run_id);
      if (pErr) Context.current().heartbeat({ stage: 'prompt_persist_warning', error: pErr.message });
    }

    // Step 2: Seedance video generation (simulate-aware). Two reference
    // images: [character sheet (identity), product (the held item)].
    let videoBytes: Buffer;
    let providerTaskId: string | null = null;
    let providerVideoUrl: string | null = null;
    if (cfg.openai.simulate) {
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
        const result = await generateSimpleSelfieEvolink({
          prompt,
          imageUrls: [input.character_sheet_url, input.product_image_url],
          duration: input.duration,
          aspectRatio: input.aspect_ratio === '1:1' ? '1:1' : '9:16',
          generateAudio: Boolean(input.script || input.background_music),
          quality: '720p',
        });
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
      const dlResp = await fetch(providerVideoUrl, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (!dlResp.ok) throw new Error(`byteplus video download ${dlResp.status}`);
      videoBytes = Buffer.from(await dlResp.arrayBuffer());
    }
    Context.current().heartbeat({ stage: 'video_downloaded', bytes: videoBytes.byteLength });

    // R2 upload
    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      activityInput.primitive_run_id,
      'product-in-hands.mp4',
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
        kind: 'product_video',
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
          source_product_image_url: input.product_image_url,
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
