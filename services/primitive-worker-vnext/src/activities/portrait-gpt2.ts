// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { ApplicationFailure, Context } from '@temporalio/activity';
import { PortraitGpt2ToolInputSchema } from '@agentmedia/schema';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { generateImageWithFallback, classifyOpenAIError } from '../client/openai.js';
import { r2UploadVnext } from '../client/r2.js';
import { buildPortraitPrompt } from '../client/anthropic.js';
import { sanitizeImagePrompt } from '../lib/sanitize-prompt.js';
import { withHeartbeat } from '../lib/heartbeat.js';
import { deductPrimitiveCredits, refundPrimitiveCredits } from '../client/credits.js';

export interface PortraitGpt2ActivityInput {
  /** UUID minted by the API before workflow start. */
  primitive_run_id: string;
  /** Authenticated user id (matches existing users table). */
  user_id: string;
  /** Optional skill run id this primitive belongs to. */
  skill_run_id?: string;
  /** Idempotency key — uniq per (user_id, primitive_id). */
  idempotency_key?: string;
  /** Validated portrait_gpt2 input. */
  input: unknown;
}

export interface PortraitGpt2ActivityResult {
  primitive_run_id: string;
  portrait_url: string;
  provider: 'gpt-image-2';
  credits_actual_usd: number;
  artifact_id: string;
}

/**
 * Run one portrait_gpt2 primitive end-to-end.
 *
 * Pipeline:
 *   1. validate input (defense-in-depth — API already validated)
 *   2. insert primitive_runs row (status=submitted)
 *   3. enforce per-primitive + per-day USD caps
 *   4. call OpenAI gpt-image-2 (or stub if SIMULATE_OPENAI=true)
 *   5. upload PNG to R2 under vnext/primitive-runs/<run_id>/portrait.png
 *   6. insert primitive_artifacts row
 *   7. update primitive_runs to status=succeeded with actual credits
 *
 * Temporal handles retries, timeouts, durability. Non-retryable failures
 * (validation, budget cap) are raised as ApplicationFailure(nonRetryable).
 */
export function makePortraitGpt2Activity(cfg: WorkerConfig) {
  return async function portraitGpt2(
    activityInput: PortraitGpt2ActivityInput,
  ): Promise<PortraitGpt2ActivityResult> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);

    const parsed = PortraitGpt2ToolInputSchema.safeParse(activityInput.input);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(
        `portrait_gpt2 input invalid: ${parsed.error.message}`,
        'INVALID_INPUT',
      );
    }
    const input = parsed.data;

    // ── Retry-safety: if this primitive_run already succeeded, return the
    // existing artifact without re-running the provider or re-uploading.
    // Without this, a transient failure in the artifact-insert path would
    // cause Temporal to retry the whole Activity and we would double-spend
    // on OpenAI.
    const { data: existing, error: existingErr } = await db
      .from('primitive_runs')
      .select('status, actual_credits_usd, primitive_artifacts(id, url)')
      .eq('id', activityInput.primitive_run_id)
      .maybeSingle();
    if (existingErr) {
      throw new Error(`primitive_runs lookup failed: ${existingErr.message}`);
    }
    if (existing && existing.status === 'succeeded') {
      const art = (existing.primitive_artifacts as Array<{ id: string; url: string }> | null)?.[0];
      if (!art) {
        throw new Error(
          `inconsistent state: primitive_run ${activityInput.primitive_run_id} is succeeded but has no artifact`,
        );
      }
      return {
        primitive_run_id: activityInput.primitive_run_id,
        portrait_url: art.url,
        provider: 'gpt-image-2',
        credits_actual_usd: Number(existing.actual_credits_usd ?? 0),
        artifact_id: art.id,
      };
    }

    // ── SSRF guard: reference_photo_url MUST come from our own R2 public
    // URL prefix. The schema's isPublicHttpsUrl check is not enough —
    // it does not survive DNS rebinding and does not block redirects.
    if (input.reference_photo_url) {
      const allowedPrefix = cfg.r2.publicUrl.replace(/\/+$/, '') + '/';
      if (!input.reference_photo_url.startsWith(allowedPrefix)) {
        throw ApplicationFailure.nonRetryable(
          `reference_photo_url must be hosted on the configured R2 public URL (${allowedPrefix})`,
          'REFERENCE_URL_NOT_ALLOWED',
        );
      }
    }

    // Per-primitive estimated debit. Real reconciliation comes when OpenAI
    // exposes per-image usage; for now a flat estimate is the actual.
    const ESTIMATED_USD = 0.2;
    if (ESTIMATED_USD > cfg.caps.primitiveUsd) {
      throw ApplicationFailure.nonRetryable(
        `estimated $${ESTIMATED_USD} exceeds per-primitive cap $${cfg.caps.primitiveUsd}`,
        'BUDGET_CAP_PRIMITIVE',
      );
    }

    // Per-day cap: sum actual_credits_usd for this user_id over today (UTC).
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data: dayRows, error: dayErr } = await db
      .from('primitive_runs')
      .select('actual_credits_usd')
      .eq('user_id', activityInput.user_id)
      .gte('created_at', since.toISOString())
      .not('actual_credits_usd', 'is', null);
    if (dayErr) {
      throw new Error(`day-cap query failed: ${dayErr.message}`);
    }
    const dayUsed = (dayRows ?? []).reduce(
      (s, r) => s + Number(r.actual_credits_usd ?? 0),
      0,
    );
    if (dayUsed + ESTIMATED_USD > cfg.caps.dayUsd) {
      throw ApplicationFailure.nonRetryable(
        `day budget exceeded: used $${dayUsed.toFixed(2)} + estimate $${ESTIMATED_USD} > cap $${cfg.caps.dayUsd}`,
        'BUDGET_CAP_DAY',
      );
    }

    // Upsert the primitive_runs row (idempotent on primitive_run_id PK).
    const { error: upsertErr } = await db.from('primitive_runs').upsert(
      {
        id: activityInput.primitive_run_id,
        user_id: activityInput.user_id,
        skill_run_id: activityInput.skill_run_id ?? null,
        primitive_id: 'portrait_gpt2',
        status: 'submitted',
        input: input,
        idempotency_key: activityInput.idempotency_key ?? null,
        estimated_credits_usd: ESTIMATED_USD,
        started_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(`primitive_runs upsert failed: ${upsertErr.message}`);

    // Deduct user credits via the agent-media ledger BEFORE any provider
    // call. Insufficient balance => non-retryable INSUFFICIENT_CREDITS.
    await deductPrimitiveCredits({
      db,
      userId: activityInput.user_id,
      primitiveRunId: activityInput.primitive_run_id,
      primitive: 'portrait_gpt2',
      description: 'vNext portrait_gpt2',
    });

    try {

    // Fetch reference photo bytes if provided. Allowlist + no redirects.
    let referencePng: Buffer | undefined;
    if (input.reference_photo_url) {
      const resp = await fetch(input.reference_photo_url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status >= 500) {
        // Transient — let Temporal retry.
        throw new Error(`reference_photo_url fetch transient ${resp.status}`);
      }
      if (!resp.ok) {
        throw ApplicationFailure.nonRetryable(
          `reference_photo_url fetch failed (${resp.status})`,
          'REFERENCE_FETCH_FAILED',
        );
      }
      const ct = resp.headers.get('content-type') ?? '';
      if (!ct.startsWith('image/')) {
        throw ApplicationFailure.nonRetryable(
          `reference_photo_url is not an image (content-type=${ct})`,
          'REFERENCE_NOT_IMAGE',
        );
      }
      referencePng = Buffer.from(await resp.arrayBuffer());
      Context.current().heartbeat({ stage: 'reference_fetched' });
    }

    // Step 1: synthesize the image prompt via Claude Haiku.
    // We persist the generated prompt back into primitive_runs.input so the
    // exact text sent to OpenAI is auditable per run.
    const prompt = sanitizeImagePrompt(
      await buildPortraitPrompt(cfg.anthropic.apiKey, input, cfg.anthropic.model),
    );
    Context.current().heartbeat({ stage: 'prompt_built' });
    {
      const { error: pErr } = await db
        .from('primitive_runs')
        .update({ input: { ...input, generated_prompt: prompt } })
        .eq('id', activityInput.primitive_run_id);
      if (pErr) {
        // Non-fatal — log via heartbeat detail and move on.
        Context.current().heartbeat({ stage: 'prompt_persist_warning', error: pErr.message });
      }
    }

    // Step 2: OpenAI gpt-image-2 generation (or simulate).
    let bytes: Buffer;
    if (cfg.openai.simulate) {
      bytes = makeStubPng();
    } else {
      const aspect = input.aspect_ratio;
      const size = aspect === '9:16' ? '1024x1536' : '1024x1024';
      try {
        // Heartbeat every 15s DURING the provider call. gpt-image holds the
        // request ~50s (and an internal retry/fallback can push past 90s) with
        // no data in between; without this the activity tripped the 90s
        // heartbeatTimeout, got killed + retried from scratch, and the run
        // ballooned to minutes or got stuck (the "timed out" users saw).
        const out = await withHeartbeat('provider_working', () =>
          generateImageWithFallback(cfg.openai, {
            model: cfg.openai.imageModel,
            prompt,
            referencePng,
            size,
          }),
        );
        bytes = out.bytes;
      } catch (err) {
        // Classify before re-throwing — 4xx is the caller's fault and must
        // not be retried (each retry costs money).
        const classified = classifyOpenAIError(err);
        if (classified.retryable) {
          throw err instanceof Error ? err : new Error(String(err));
        }
        // Content/safety rejections (4xx) → a friendly, actionable message the
        // user actually sees, instead of the raw "openai 400: rejected by the
        // safety system". The code is kept for classification/grouping.
        const friendly = /^OPENAI_(400|403|422|451)$/.test(classified.code)
          ? 'Your description was flagged by the image safety filter — please rephrase it (avoid sexual, violent, or real-person/celebrity wording) and try again.'
          : classified.message;
        throw ApplicationFailure.nonRetryable(friendly, classified.code);
      }
    }
    Context.current().heartbeat({ stage: 'provider_done', bytes: bytes.byteLength });

    // Upload to R2.
    const { publicUrl } = await r2UploadVnext(
      cfg.r2,
      activityInput.primitive_run_id,
      'portrait.png',
      bytes,
      'image/png',
    );
    Context.current().heartbeat({ stage: 'r2_uploaded' });

    // Insert artifact + finalize run.
    const { data: artifact, error: artErr } = await db
      .from('primitive_artifacts')
      .insert({
        primitive_run_id: activityInput.primitive_run_id,
        kind: 'portrait',
        url: publicUrl,
        bytes: bytes.byteLength,
        mime: 'image/png',
        metadata: {
          provider: 'gpt-image-2',
          model: cfg.openai.imageModel,
          simulated: cfg.openai.simulate,
          aspect_ratio: input.aspect_ratio,
          realism_target: input.realism_target,
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
        actual_credits_usd: ESTIMATED_USD,
        finished_at: new Date().toISOString(),
      })
      .eq('id', activityInput.primitive_run_id);
    if (finErr) throw new Error(`primitive_runs finalize failed: ${finErr.message}`);

    return {
      primitive_run_id: activityInput.primitive_run_id,
      portrait_url: publicUrl,
      provider: 'gpt-image-2',
      credits_actual_usd: ESTIMATED_USD,
      artifact_id: artifact.id as string,
    };
    } catch (err) {
      if (err instanceof ApplicationFailure && err.nonRetryable) {
        // Terminal failure: record a user-facing reason on the run (so the UI
        // shows WHY, e.g. the friendly safety-filter message — not just
        // "failed"), then refund. Best-effort; never mask the original error.
        const { error: failErr } = await db
          .from('primitive_runs')
          .update({
            status: 'failed',
            error_code: err.type ?? 'FAILED',
            error_message: err.message.slice(0, 500),
            finished_at: new Date().toISOString(),
          })
          .eq('id', activityInput.primitive_run_id);
        void failErr;
        await refundPrimitiveCredits(db, activityInput.primitive_run_id);
      }
      throw err;
    }
  };
}

/** 1x1 transparent PNG for SIMULATE_OPENAI=true smoke tests. */
function makeStubPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}
