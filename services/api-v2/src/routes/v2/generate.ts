// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v2/generate/:kind   (kind = image | video | audio)
 * POST /v2/quote/:kind      (no job, no credits: just the price)
 *
 * The loose surface. One route body for three primitives, so the contract
 * is one contract:
 *   1. Validate with @agentmedia/schema/v2 → GenerateImage/Video/AudioSchema
 *      (live-catalog model check included; a candidate id is a 400 that
 *      names the live options)
 *   2. Quote with quoteGenerate() — the same function /v2/quote returns
 *   3. Insert generation_jobs row (operation='generate_<kind>',
 *      model_slug = the catalog id; public.models carries a row per live id)
 *   4. deduct_credits
 *   5. Dispatch to media-worker-v2 POST /v2/generate/:kind
 *   6. 201 + job_id + credits_deducted + the quote breakdown
 *
 * Failure contract is the crazy-look one: dispatch failure → job failed +
 * refund; provider failure later → webhook refund.
 */

import type { Request, Response } from 'express';
import {
  GenerateAudioSchema,
  GenerateImageSchema,
  GenerateVideoSchema,
  V2_DEFAULT_MODEL,
  quoteGenerate,
  type GenerateKind,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;
const DISPATCH_TIMEOUT_MS = 30_000;
const DISPATCH_FAILED_PENDING_REFUND = 'DISPATCH_FAILED_PENDING_REFUND';
const DISPATCH_FAILED_FINAL = 'DISPATCH_FAILED';

export const GENERATE_KINDS: readonly GenerateKind[] = ['image', 'video', 'audio'] as const;

function schemaFor(kind: GenerateKind) {
  return kind === 'image' ? GenerateImageSchema : kind === 'video' ? GenerateVideoSchema : GenerateAudioSchema;
}

function kindFrom(req: Request): GenerateKind | null {
  const k = String(req.params.kind ?? '');
  return (GENERATE_KINDS as readonly string[]).includes(k) ? (k as GenerateKind) : null;
}

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

async function markDispatchFailureAndRefund(jobId: string, userId: string, message: string): Promise<void> {
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
    console.error(`[v2 generate] dispatch failure state update failed for ${jobId}: ${updateErr.message}`);
    return;
  }
  if (!claimedRows || claimedRows.length === 0) return;

  const { error } = await supabase.rpc('refund_credits', { p_job_id: jobId });
  if (error && !/ALREADY_REFUNDED/i.test(error.message)) {
    console.error(`[v2 generate] refund failed for ${jobId}: ${error.message}`);
    return;
  }
  await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_FINAL })
    .eq('id', jobId)
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_PENDING_REFUND);
}

/** Validate + price. Shared by both routes and exported for the MCP tools' tests. */
export function validateAndQuote(kind: GenerateKind, body: unknown):
  | { ok: true; input: Record<string, unknown>; credits: number; model: string; breakdown: string }
  | { ok: false; issues: unknown[] } {
  const parsed = schemaFor(kind).safeParse(body);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  const q = quoteGenerate(kind as 'image', parsed.data as never);
  return { ok: true, input: parsed.data as Record<string, unknown>, credits: q.credits, model: q.model, breakdown: q.breakdown };
}

export async function quoteRoute(req: Request, res: Response): Promise<void> {
  const kind = kindFrom(req);
  if (!kind) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'kind must be image, video or audio' } });
    return;
  }
  const v = validateAndQuote(kind, req.body);
  if (!v.ok) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: v.issues } });
    return;
  }
  res.json({ kind, model: v.model, credits: v.credits, usd: Number((v.credits * 0.01).toFixed(2)), breakdown: v.breakdown });
}

export async function generateRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const kind = kindFrom(req);
  if (!kind) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'kind must be image, video or audio' } });
    return;
  }

  // ── 1+2. Validate and quote ───────────────────────────────────────
  const v = validateAndQuote(kind, req.body);
  if (!v.ok) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: v.issues } });
    return;
  }
  const input = v.input;
  const model = v.model ?? V2_DEFAULT_MODEL[kind];
  const creditCost = v.credits;

  // ── 3. Worker preflight ───────────────────────────────────────────
  if (!WORKER_V2_URL || !WORKER_SECRET) {
    res.status(503).json({ error: { code: 'WORKER_NOT_CONFIGURED', message: 'Generation service is not configured.' } });
    return;
  }

  // ── 4. Insert job row ─────────────────────────────────────────────
  const jobId = crypto.randomUUID();
  const promptText = String(input.prompt ?? input.text ?? '');
  const { error: jobErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: model, // catalog id; public.models has a row per live id (migration 20260905120000)
    operation: `generate_${kind}`,
    status: 'submitted',
    prompt: promptText,
    credit_cost: creditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: { ...input, model },
  });
  if (jobErr) {
    console.error('[v2 generate] job insert failed:', jobErr.message);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
    return;
  }

  // ── 5. Deduct credits ─────────────────────────────────────────────
  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `generate_${kind} · ${v.breakdown}`,
  });
  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
    res.status(code === 'INSUFFICIENT_CREDITS' ? 402 : 500).json({ error: { code, message: msg || 'Credit deduction failed' } });
    return;
  }

  // ── 6. Dispatch ───────────────────────────────────────────────────
  try {
    const resp = await fetch(`${WORKER_V2_URL}/v2/generate/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: JSON.stringify({ job_id: jobId, user_id: userId, ...input, model, callback_url: buildCallbackUrl(jobId) }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`media-worker-v2 dispatch failed (${resp.status}): ${body.slice(0, 500)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[v2 generate] worker dispatch failed: ${msg}`);
    await markDispatchFailureAndRefund(jobId, userId, `Worker dispatch failed: ${msg}`);
    res.status(503).json({
      error: { code: 'ORCHESTRATOR_UNAVAILABLE', message: 'Generation worker is currently unavailable. Credits were refunded.' },
    });
    return;
  }

  // ── 7. Respond ────────────────────────────────────────────────────
  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    kind,
    model,
    credits_deducted: creditCost,
    breakdown: v.breakdown,
    status_url: `/v1/videos/${jobId}`,
  });
}
