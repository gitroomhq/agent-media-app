// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v2/selfie
 *
 * Public REST entry for the v2 Selfie product.
 *   1. Auth (bearer token via authMiddleware on the parent router)
 *   2. Validate input with @agentmedia/schema/v2 → SelfieSchema
 *   3. Create generation_jobs row (operation='selfie', status='submitted')
 *   4. Deduct credits via deduct_credits RPC
 *   5. Dispatch to media-worker-v2 POST /v2/selfie (HTTP for now)
 *   6. Return 201 + job_id + credits_deducted
 *
 * The worker handles A/B/C/D + callbacks. Webhook updates the
 * generation_jobs row on completion / failure (refund on failure)
 * via the existing webhook-provider edge function.
 *
 * Pricing comes from V2_GENERATORS so dashboard + CLI quoting + this
 * route all agree.
 */

import type { Request, Response } from 'express';
import {
  SelfieSchema,
  V2_GENERATORS,
  quoteV2Credits,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';
import { getOrchestratorEngine } from '../../orchestrator/temporal/config.js';
import { dispatchSelfieWorkflow } from '../../orchestrator/temporal/dispatch.js';
import type { SelfieDispatchPayload } from '../../orchestrator/temporal/types.js';
import { dispatchSelfieToHttpWorker } from './dispatch-http.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const DISPATCH_FAILED_PENDING_REFUND = 'DISPATCH_FAILED_PENDING_REFUND';
const DISPATCH_FAILED_FINAL = 'DISPATCH_FAILED';

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

async function markDispatchFailureAndRefund(
  jobId: string,
  userId: string,
  creditCost: number,
  message: string,
): Promise<void> {
  const { data: claimedRows, error: updateErr } = await supabase
    .from('generation_jobs')
    .update({
      status: 'failed',
      error_code: DISPATCH_FAILED_PENDING_REFUND,
      error_message: message,
      webhook_checkpoint: 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .eq('webhook_checkpoint', 'none')
    .select('id');
  if (updateErr) {
    console.error(`[v2 selfie] dispatch failure state update failed for ${jobId}: ${updateErr.message}`);
    return;
  }
  if (!claimedRows || claimedRows.length === 0) {
    console.warn(
      `[v2 selfie] dispatch failure update skipped for ${jobId} (job already advanced/settled); refund skipped`,
    );
    return;
  }

  const { error } = await supabase.rpc('refund_credits', { p_job_id: jobId });
  if (error) {
    if (/ALREADY_REFUNDED/i.test(error.message)) {
      console.warn(`[v2 selfie] refund already settled for ${jobId}; finalizing dispatch error state`);
    } else {
      console.error(
        `[v2 selfie] refund_credits failed after dispatch error (${jobId}, ${creditCost} credits): ${error.message}`,
      );
      console.error(
        `[v2 selfie] job ${jobId} left in ${DISPATCH_FAILED_PENDING_REFUND} for reconciler retry`,
      );
      return;
    }
  }

  const { error: finalizeErr } = await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_FINAL })
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_PENDING_REFUND);
  if (finalizeErr) {
    console.error(
      `[v2 selfie] refund settled but failed to finalize dispatch error code for ${jobId}: ${finalizeErr.message}`,
    );
  }
}

export async function selfieRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  // ── 1. Validate ────────────────────────────────────────────────────
  const parsed = SelfieSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        issues: parsed.error.issues,
      },
    });
    return;
  }
  const input = parsed.data;
  const duration = input.duration ?? 10;

  // ── 2. Quote credits ──────────────────────────────────────────────
  const creditCost = quoteV2Credits('selfie', { durationSeconds: duration });
  const engine = getOrchestratorEngine();

  // ── 3. Worker preflight (HTTP engine only) ────────────────────────
  if (engine === 'http' && (!WORKER_V2_URL || !WORKER_SECRET)) {
    res.status(503).json({
      error: { code: 'WORKER_NOT_CONFIGURED', message: 'Video generation service is not configured.' },
    });
    return;
  }

  // ── 4. Insert job row ─────────────────────────────────────────────
  const jobId = crypto.randomUUID();
  const { error: jobErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: 'seedance-2.0-selfie',
    operation: 'selfie',
    status: 'submitted',
    prompt: input.script ?? input.scene_action ?? '(no script — non-speech clip)',
    credit_cost: creditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: {
      ...(input.character_id ? { character_id: input.character_id } : {}),
      ...(input.photo_url ? { photo_url: input.photo_url } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.script ? { script: input.script } : {}),
      ...(input.scene_action ? { scene_action: input.scene_action } : {}),
      ...(input.background_music !== undefined ? { background_music: input.background_music } : {}),
      duration,
      subtitles: input.subtitles,
      ...(input.shot_preset ? { shot_preset: input.shot_preset } : {}),
      ...(input.vibe ? { vibe: input.vibe } : {}),
      ...(input.camera_locked !== undefined ? { camera_locked: input.camera_locked } : {}),
      ...(input.phone_in_frame ? { phone_in_frame: input.phone_in_frame } : {}),
      ...(input.polish ? { polish: input.polish } : {}),
    },
  });

  if (jobErr) {
    console.error(`[v2 selfie] job insert failed:`, jobErr.message);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
    return;
  }

  // ── 5. Deduct credits (refund-on-fail handled by webhook) ─────────
  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `Selfie · ${duration}s`,
  });

  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg)
      ? 'INSUFFICIENT_CREDITS'
      : 'CREDIT_DEDUCTION_FAILED';
    const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
    res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
    return;
  }

  // ── 6. Dispatch to worker / temporal workflow ────────────────────
  const payload: SelfieDispatchPayload = {
    job_id: jobId,
    user_id: userId,
    ...(input.character_id ? { character_id: input.character_id } : {}),
    ...(input.photo_url ? { photo_url: input.photo_url } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.script ? { script: input.script } : {}),
    ...(input.scene_action ? { scene_action: input.scene_action } : {}),
    ...(input.background_music !== undefined ? { background_music: input.background_music } : {}),
    duration,
    subtitles: input.subtitles,
    ...(input.shot_preset ? { shot_preset: input.shot_preset } : {}),
    ...(input.vibe ? { vibe: input.vibe } : {}),
    ...(input.camera_locked !== undefined ? { camera_locked: input.camera_locked } : {}),
    ...(input.phone_in_frame ? { phone_in_frame: input.phone_in_frame } : {}),
    ...(input.polish ? { polish: input.polish } : {}),
    callback_url: buildCallbackUrl(jobId),
  };

  if (engine === 'temporal') {
    const result = await dispatchSelfieWorkflow(payload);
    if (!result.ok) {
      console.error(`[v2 selfie] temporal dispatch failed (${result.code}): ${result.message}`);
      await markDispatchFailureAndRefund(
        jobId,
        userId,
        creditCost,
        `Temporal dispatch failed (${result.code}): ${result.message}`,
      );
      res.status(503).json({
        error: {
          code: 'ORCHESTRATOR_UNAVAILABLE',
          message: 'Selfie orchestrator is currently unavailable. Credits were refunded.',
        },
      });
      return;
    }
    if (result.alreadyRunning) {
      console.warn(`[v2 selfie] temporal workflow already exists for ${jobId}; continuing`);
    }
  } else {
    const workerV2Url = WORKER_V2_URL as string;
    const workerSecret = WORKER_SECRET as string;
    try {
      await dispatchSelfieToHttpWorker(workerV2Url, workerSecret, payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[v2 selfie] worker dispatch failed: ${msg}`);
      await markDispatchFailureAndRefund(jobId, userId, creditCost, `Worker dispatch failed: ${msg}`);
      res.status(503).json({
        error: {
          code: 'ORCHESTRATOR_UNAVAILABLE',
          message: 'Selfie worker is currently unavailable. Credits were refunded.',
        },
      });
      return;
    }
  }

  // ── 7. Respond ────────────────────────────────────────────────────
  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    credits_deducted: creditCost,
    generator: V2_GENERATORS.selfie.id,
  });
}
