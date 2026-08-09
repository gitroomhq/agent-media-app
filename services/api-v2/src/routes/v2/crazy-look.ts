// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v2/crazy-look
 *
 * Public REST entry for the v2 Crazy Look generator — silent extreme
 * close-up reaction clip with a static caption overlay.
 *   1. Auth (bearer token via authMiddleware on the parent router)
 *   2. Validate input with @agentmedia/schema/v2 → CrazyLookSchema
 *   3. Create generation_jobs row (operation='crazy_look', status='submitted')
 *   4. Deduct credits via deduct_credits RPC
 *   5. Dispatch to media-worker-v2 POST /v2/crazy-look (HTTP)
 *   6. Return 201 + job_id + credits_deducted
 *
 * HTTP-only dispatch (no Temporal path) — the pipeline has no
 * orchestrator LLM stage and nothing to resume mid-flight; if the
 * dispatch fails we mark the job failed and refund, same contract as
 * the selfie route's HTTP branch.
 *
 * Pricing comes from V2_GENERATORS so dashboard + CLI quoting + this
 * route all agree.
 */

import type { Request, Response } from 'express';
import {
  CrazyLookSchema,
  V2_GENERATORS,
  quoteV2Credits,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const DISPATCH_TIMEOUT_MS = 30_000;
const DISPATCH_FAILED_PENDING_REFUND = 'DISPATCH_FAILED_PENDING_REFUND';
const DISPATCH_FAILED_FINAL = 'DISPATCH_FAILED';

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

async function markDispatchFailureAndRefund(
  jobId: string,
  userId: string,
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
    console.error(`[v2 crazy-look] dispatch failure state update failed for ${jobId}: ${updateErr.message}`);
    return;
  }
  if (!claimedRows || claimedRows.length === 0) {
    console.warn(
      `[v2 crazy-look] dispatch failure update skipped for ${jobId} (job already advanced/settled); refund skipped`,
    );
    return;
  }

  const { error } = await supabase.rpc('refund_credits', { p_job_id: jobId });
  if (error && !/ALREADY_REFUNDED/i.test(error.message)) {
    console.error(`[v2 crazy-look] refund failed for ${jobId}: ${error.message}`);
    return;
  }
  const { error: finalizeErr } = await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_FINAL })
    .eq('id', jobId)
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_PENDING_REFUND);
  if (finalizeErr) {
    console.error(
      `[v2 crazy-look] refund settled but failed to finalize dispatch error code for ${jobId}: ${finalizeErr.message}`,
    );
  }
}

export async function crazyLookRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  // ── 1. Validate ────────────────────────────────────────────────────
  const parsed = CrazyLookSchema.safeParse(req.body);
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
  const duration = input.duration ?? 5;

  // ── 2. Quote credits ──────────────────────────────────────────────
  const creditCost = quoteV2Credits('crazy_look', { durationSeconds: duration });

  // ── 3. Worker preflight ───────────────────────────────────────────
  if (!WORKER_V2_URL || !WORKER_SECRET) {
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
    model_slug: 'seedance-2.0-selfie', // same underlying model; operation='crazy_look' distinguishes the product. FK requires an existing models row.
    operation: 'crazy_look',
    status: 'submitted',
    prompt: input.caption,
    credit_cost: creditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: {
      ...(input.character_id ? { character_id: input.character_id } : {}),
      ...(input.photo_url ? { photo_url: input.photo_url } : {}),
      ...(input.description ? { description: input.description } : {}),
      caption: input.caption,
      ...(input.look ? { look: input.look } : {}),
      duration,
      ...(input.chaos !== undefined ? { chaos: input.chaos } : {}),
      ...(input.framing ? { framing: input.framing } : {}),
      ...(input.polish ? { polish: input.polish } : {}),
    },
  });
  if (jobErr) {
    console.error('[v2 crazy-look] job insert failed:', jobErr.message);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
    return;
  }

  // ── 5. Deduct credits (refund-on-fail handled by webhook) ─────────
  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `Crazy Look · ${duration}s`,
  });
  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg)
      ? 'INSUFFICIENT_CREDITS'
      : 'CREDIT_DEDUCTION_FAILED';
    res.status(code === 'INSUFFICIENT_CREDITS' ? 402 : 500).json({
      error: { code, message: msg || 'Credit deduction failed' },
    });
    return;
  }

  // ── 6. Dispatch to worker ─────────────────────────────────────────
  try {
    const resp = await fetch(`${WORKER_V2_URL}/v2/crazy-look`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: JSON.stringify({
        job_id: jobId,
        user_id: userId,
        ...(input.character_id ? { character_id: input.character_id } : {}),
        ...(input.photo_url ? { photo_url: input.photo_url } : {}),
        ...(input.description ? { description: input.description } : {}),
        caption: input.caption,
        ...(input.look ? { look: input.look } : {}),
        duration,
        ...(input.chaos !== undefined ? { chaos: input.chaos } : {}),
        ...(input.framing ? { framing: input.framing } : {}),
        ...(input.polish ? { polish: input.polish } : {}),
        callback_url: buildCallbackUrl(jobId),
      }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`media-worker-v2 dispatch failed (${resp.status}): ${body.slice(0, 500)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[v2 crazy-look] worker dispatch failed: ${msg}`);
    await markDispatchFailureAndRefund(jobId, userId, `Worker dispatch failed: ${msg}`);
    res.status(503).json({
      error: {
        code: 'ORCHESTRATOR_UNAVAILABLE',
        message: 'Crazy Look worker is currently unavailable. Credits were refunded.',
      },
    });
    return;
  }

  // ── 7. Respond ────────────────────────────────────────────────────
  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    credits_deducted: creditCost,
    generator: V2_GENERATORS.crazy_look.id,
  });
}
