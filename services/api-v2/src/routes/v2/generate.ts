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
  V2_MODEL_AUTO,
  V2_MODELS,
  deriveVideoMode,
  pickAuto,
  quoteGenerate,
  resolveVideoRequest,
  type AutoPick,
  type GenerateKind,
  type GenerateVideoInput,
  type ModelStatsMap,
  type QuoteExtras,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';
import { requestIdentity, replayResponse, type GenerationRequest } from '../../generation/request-identity.js';
import { MAX_CONCURRENT_RENDERS } from '../../concurrency.js';
import { loadModelStats } from '../v1/models.js';

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

async function markDispatchFailureAndRefund(jobId: string, userId: string, message: string): Promise<{ status: string; refund_status: string }> {
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
    return { status: 'unknown', refund_status: 'unconfirmed' };
  }
  if (!claimedRows || claimedRows.length === 0) return { status: 'unknown', refund_status: 'unconfirmed' };

  const { data, error } = await supabase.rpc('refund_credits', { p_job_id: jobId });
  if ((error && !/ALREADY_REFUNDED/i.test(error.message)) || (!error && data?.success !== true)) {
    console.error(`[v2 generate] refund failed for ${jobId}: ${error?.message ?? 'unconfirmed result'}`);
    return { status: 'failed', refund_status: 'unconfirmed' };
  }
  await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_FINAL })
    .eq('id', jobId)
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_PENDING_REFUND);
  return { status: 'failed', refund_status: 'refunded' };
}

/**
 * Durations of reference clips, measured by the worker (ffprobe on the
 * URL). The provider bills reference video seconds like output seconds,
 * so the quote and the debit need them BEFORE anything is spent. A clip
 * that cannot be read is a 400, never a guess. Exported for tests
 * (injectable fetcher).
 */
export async function probeVideoRefs(
  urls: string[],
  probe: (urls: string[]) => Promise<Record<string, number | null>> = workerProbe,
): Promise<{ ok: true; seconds: number } | { ok: false; unreadable: string[] }> {
  if (!urls.length) return { ok: true, seconds: 0 };
  const durations = await probe(urls);
  const unreadable = urls.filter((u) => !durations[u]);
  if (unreadable.length) return { ok: false, unreadable };
  return { ok: true, seconds: urls.reduce((sum, u) => sum + (durations[u] ?? 0), 0) };
}

async function workerProbe(urls: string[]): Promise<Record<string, number | null>> {
  if (!WORKER_V2_URL || !WORKER_SECRET) throw new Error('worker not configured');
  const resp = await fetch(`${WORKER_V2_URL}/v2/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`probe failed (${resp.status})`);
  const body = (await resp.json()) as { durations?: Record<string, number | null> };
  return body.durations ?? {};
}

/**
 * Validate + resolve `auto` + price. Pure given `stats` and `extras`; both
 * routes call it with the cached model_stats. For video the result also
 * carries the resolved cell (mode, provider model, aspect, quality) that
 * the worker will run, so the quote, the job row and the provider call
 * cannot disagree. Exported for tests.
 */
export function validateAndQuote(kind: GenerateKind, body: unknown, stats: ModelStatsMap = {}, extras: QuoteExtras = {}):
  | {
      ok: true;
      input: Record<string, unknown>;
      credits: number;
      model: string;
      breakdown: string;
      auto: AutoPick | null;
      video: { mode: string; provider_model: string; aspect: string; quality: string; timeout_minutes: number } | null;
    }
  | { ok: false; issues: unknown[] } {
  const schema = schemaFor(kind);
  let parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  let data = parsed.data as Record<string, unknown> & { model?: string };
  let auto: AutoPick | null = null;
  if (data.model === V2_MODEL_AUTO) {
    auto = pickAuto(kind, stats, kind === 'video' ? deriveVideoMode(data as GenerateVideoInput) : undefined);
    // Re-validate against the picked model: its limits may differ.
    parsed = schema.safeParse({ ...(body as object), model: auto.model });
    if (!parsed.success) return { ok: false, issues: parsed.error.issues };
    data = parsed.data as Record<string, unknown> & { model?: string };
  }
  const q = quoteGenerate(kind as 'video', data as never, extras);
  let video: { mode: string; provider_model: string; aspect: string; quality: string; timeout_minutes: number } | null = null;
  if (kind === 'video') {
    const r = resolveVideoRequest(data as GenerateVideoInput);
    video = { mode: r.mode, provider_model: r.providerModel, aspect: r.aspect, quality: r.quality, timeout_minutes: V2_MODELS[r.model]?.video?.timeoutMinutes ?? 30 };
  }
  return { ok: true, input: data, credits: q.credits, model: q.model, breakdown: q.breakdown, auto, video };
}

/** Video only: measure reference clips first so the quote is the debit. */
async function extrasFor(kind: GenerateKind, body: unknown): Promise<{ ok: true; extras: QuoteExtras } | { ok: false; unreadable: string[] }> {
  const refs = kind === 'video' && body && typeof body === 'object' ? (body as { video_refs?: unknown }).video_refs : undefined;
  const urls = Array.isArray(refs) ? refs.filter((u): u is string => typeof u === 'string') : [];
  if (!urls.length) return { ok: true, extras: {} };
  const p = await probeVideoRefs(urls);
  return p.ok ? { ok: true, extras: { inputVideoSeconds: p.seconds } } : p;
}

function unreadableResponse(res: Response, unreadable: string[]): void {
  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      issues: [{ path: ['video_refs'], message: `could not read the duration of: ${unreadable.join(', ')}. Reference clips must be public https mp4/mov files.` }],
    },
  });
}

export async function quoteRoute(req: Request, res: Response): Promise<void> {
  const kind = kindFrom(req);
  if (!kind) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'kind must be image, video or audio' } });
    return;
  }
  const ex = await extrasFor(kind, req.body);
  if (!ex.ok) return unreadableResponse(res, ex.unreadable);
  const v = validateAndQuote(kind, req.body, await loadModelStats(), ex.extras);
  if (!v.ok) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: v.issues } });
    return;
  }
  res.json({
    kind,
    model: v.model,
    credits: v.credits,
    usd: Number((v.credits * 0.01).toFixed(2)),
    breakdown: v.breakdown,
    ...(v.video ? { mode: v.video.mode, quality: v.video.quality, aspect: v.video.aspect } : {}),
    ...(v.auto ? { auto: v.auto } : {}),
  });
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

  // ── 1+2. Validate, resolve auto, quote ────────────────────────────
  const ex = await extrasFor(kind, req.body);
  if (!ex.ok) return unreadableResponse(res, ex.unreadable);
  const v = validateAndQuote(kind, req.body, await loadModelStats(), ex.extras);
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

  // Job and debit commit atomically; a concurrent replay gets the winner's receipt.
  const identity = (req as GenerationRequest).generationIdentity ?? requestIdentity(userId, kind, req.body);
  const jobId = crypto.randomUUID();
  const receipt = {
    job_id: jobId, status: 'submitted', kind, model,
    request_id: identity.requestId, credits_deducted: creditCost, breakdown: v.breakdown,
    ...(v.video ? { mode: v.video.mode, quality: v.video.quality, aspect: v.video.aspect } : {}),
    ...(v.auto ? { auto: v.auto } : {}), status_url: `/v1/videos/${jobId}`,
  };
  const { data: submission, error: submitErr } = await supabase.rpc('submit_generation_request', {
    p_job_id: jobId, p_user_id: userId, p_idempotency_key: identity.key,
    p_request_hash: identity.hash, p_model: model, p_kind: kind,
    p_prompt: String(input.prompt ?? input.text ?? ''), p_credit_cost: creditCost,
    p_input_params: { ...input, model, ...(v.video ?? {}) }, p_response: receipt,
    p_max_concurrent: MAX_CONCURRENT_RENDERS,
  });
  if (submitErr) {
    const message = submitErr.message ?? '';
    const insufficient = /INSUFFICIENT_CREDITS/.test(message);
    const conflict = /IDEMPOTENCY_CONFLICT/.test(message);
    const capacity = message.match(/TOO_MANY_ACTIVE_RENDERS:(\d+):(\d+)/);
    res.status(insufficient ? 402 : conflict ? 409 : capacity ? 429 : 503).json({ error: {
      code: insufficient ? 'INSUFFICIENT_CREDITS' : conflict ? 'IDEMPOTENCY_CONFLICT' : capacity ? 'TOO_MANY_ACTIVE_RENDERS' : 'SUBMISSION_UNCONFIRMED',
      message: insufficient ? message : conflict ? 'This request identity was already used with different inputs.' :
        capacity ? `You already have ${capacity[1]} generations running. Wait for one to finish, then try again. (Limit ${capacity[2]}.)` :
        'The submission result could not be confirmed. Retry the same inputs with the same Idempotency-Key to recover the job; do not create a new request.',
      request_id: identity.requestId,
      ...(capacity ? { active: Number(capacity[1]), limit: Number(capacity[2]) } : {}),
    } });
    return;
  }
  if (!submission || typeof submission.created !== 'boolean' || !submission.response?.job_id) {
    res.status(503).json({ error: { code: 'SUBMISSION_UNCONFIRMED', message: 'Retry with the same Idempotency-Key to recover the submission.', request_id: identity.requestId } });
    return;
  }
  if (!submission.created) {
    res.status(200).json(replayResponse(submission.response, submission.status));
    return;
  }

  // ── 6. Dispatch ───────────────────────────────────────────────────
  try {
    const resp = await fetch(`${WORKER_V2_URL}/v2/generate/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: JSON.stringify({ job_id: jobId, user_id: userId, ...input, model, ...(v.video ?? {}), callback_url: buildCallbackUrl(jobId) }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      // Only explicit pre-acceptance rejections are safe to fail/refund here.
      // A timeout/5xx may have lost an acknowledgement after the worker queued it.
      if ([400, 401, 403, 404, 413, 422].includes(resp.status)) {
        const outcome = await markDispatchFailureAndRefund(jobId, userId, `Worker rejected dispatch (${resp.status}).`);
        res.status(503).json({
          ...receipt, ...outcome, dispatch_status: 'rejected',
          error: { code: 'DISPATCH_REJECTED', message: outcome.refund_status === 'refunded' ?
            'The worker rejected this job. Credits were refunded. Keep this job id to check its status.' :
            'The worker rejected this job. Refund confirmation is pending; check this job id before taking further action.' },
        });
        return;
      }
      throw new Error(`Worker acknowledgement unavailable (${resp.status}).`);
    }
  } catch (err) {
    console.error(`[v2 generate] dispatch acknowledgement unknown for ${jobId}:`, err instanceof Error ? err.message : String(err));
    res.status(202).json({ ...receipt, dispatch_status: 'unknown',
      message: 'Your job is saved, but worker acceptance is not yet confirmed. Check this job id; do not submit another generation. Stalled jobs are reconciled separately.' });
    return;
  }
  res.status(201).json(receipt);
}

// ── POST /v1/runs/:jobId/rate — the human half of the quality loop ──────
//
// The auto-judge scores every job; this is where an agent (or the user
// through it) says what it actually thought. 1..5 plus an optional note,
// upserted onto the job's generation_quality row. Only the job's owner,
// only loose-surface jobs, only once the job is terminal.

const RATE_MIN = 1;
const RATE_MAX = 5;

export async function rateRunRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }
  const jobId = String(req.params.jobId ?? '');
  const body = (req.body ?? {}) as { score?: unknown; note?: unknown };
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < RATE_MIN || score > RATE_MAX) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `score must be an integer ${RATE_MIN}..${RATE_MAX}` } });
    return;
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : null;

  const { data: job, error: jobErr } = await supabase
    .from('generation_jobs')
    .select('id, user_id, operation, model_slug, status')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (jobErr) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: jobErr.message } });
    return;
  }
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such run on this account' } });
    return;
  }
  const op = String(job.operation ?? '');
  if (!op.startsWith('generate_')) {
    res.status(400).json({ error: { code: 'NOT_RATEABLE', message: 'Only generate_video / generate_image / generate_audio runs can be rated' } });
    return;
  }
  if (!['completed', 'failed'].includes(String(job.status))) {
    res.status(409).json({ error: { code: 'NOT_FINISHED', message: `Run is ${job.status}; rate it once it is completed` } });
    return;
  }
  const kind = op.replace('generate_', '');
  const model = String(job.model_slug ?? V2_DEFAULT_MODEL[kind as GenerateKind] ?? '');
  const now = new Date().toISOString();
  const { error: upErr } = await supabase.from('generation_quality').upsert(
    {
      job_id: jobId,
      user_id: userId,
      operation: op,
      model_slug: V2_MODELS[model] ? model : V2_DEFAULT_MODEL[kind as GenerateKind],
      kind,
      user_score: score,
      user_note: note,
      rated_at: now,
      updated_at: now,
    },
    { onConflict: 'job_id' },
  );
  if (upErr) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: upErr.message } });
    return;
  }
  res.json({ job_id: jobId, model, score, note, recorded_at: now });
}
