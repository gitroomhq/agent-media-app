// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Step 1 + Step 2 of the 3-step character_video pipeline.
 *
 *  POST /v1/character/sheet-generate
 *    body: { description?: string, actor_slug?: string, reference_image_url?: string }
 *    returns: { character_sheet_url, source: 'actor'|'reference'|'description' }
 *    cost: 20 credits ($0.20) for actor/reference (1 gpt-image-2 call, 75% margin),
 *          35 credits ($0.35) for description (2 gpt-image-2 calls, 71% margin)
 *
 *  POST /v1/character/storyboard-generate
 *    body: { character_sheet_url: string, beats: string[],
 *            ratio?: '9:16'|'16:9'|'1:1' }
 *    returns: { storyboard_url, beats_used }
 *    cost: 20 credits ($0.20) — 75% margin on $0.05 cost
 *
 * Both proxy to the worker's synchronous endpoints
 * (/character-sheet-generate and /character-storyboard-generate)
 * which do the gpt-image-2 call and R2 upload.
 */

import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { supabase } from '../server.js';
import { USE_DURABLE_QUEUE, enqueueDispatch, type DispatchTarget } from '../queue.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL || 'http://localhost:3002';
const WORKER_SECRET = process.env.WORKER_SECRET || '';

// Pricing follows the 70% margin rule (1 credit = $0.01 retail).
// gpt-image-2 medium direct from OpenAI costs ~$0.05 per call.
//   - Describe mode = 2 calls (paint portrait, then sheet) → ~$0.10 cost
//   - Pick/Upload    = 1 call (sheet only)                  → ~$0.05 cost
// At 70% margin: retail = cost / 0.30. 35 credits ($0.35) covers
// describe with 71% margin; 20 credits ($0.20) covers ref-image with
// 75% margin (rounded up from $0.167 for clean math).
const SHEET_CREDIT_COST_DESCRIBE = 35;
const SHEET_CREDIT_COST_REF = 20;
const STORYBOARD_CREDIT_COST = 20; // 1 gpt-image-2 call, 75% margin

// gpt-image-2 takes 2–5+ minutes per call (observed 2m20s–5m13s). Sheet
// and storyboard generation are now ASYNC — this route inserts a job row,
// charges credits, dispatches to the worker queue, and returns 202 with
// a job_id. Clients poll GET /v1/videos/:jobId for the result.
const SHEET_EXPECTED_SECONDS = 180;
const STORYBOARD_EXPECTED_SECONDS = 180;

async function safeRefund(
  userId: string,
  amount: number,
  jobId: string,
  description: string,
): Promise<void> {
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_job_id: jobId,
      p_description: description,
    });
  } catch (err) {
    console.error(`[refund] failed for job ${jobId}:`, err);
  }
}

// ── POST /v1/character/sheet-generate ─────────────────────────────────
export async function characterSheetGenerateRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing user id' } });
    return;
  }

  const body = (req.body ?? {}) as {
    actor_slug?: string;
    /** Public HTTPS URL fed to gpt-image-2 as image_urls[0]. */
    reference_image_url?: string;
    /** Optional extra context appended to the prompt (e.g. role, vibe). */
    description?: string;
    /** Wizard session uuid — links sheet/storyboard/video so a refresh
     *  can rehydrate via /api/dashboard/wizard-session/:sid. Optional;
     *  CLI/SDK callers may omit. */
    session_id?: string;
  };
  const hasActor = typeof body.actor_slug === 'string' && body.actor_slug.trim().length > 0;
  const hasRefUrl = typeof body.reference_image_url === 'string' && body.reference_image_url.trim().length > 0;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const hasDescription = description.length >= 3;
  const sessionId = typeof body.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.session_id) ? body.session_id : null;

  // Three input modes:
  //  1) Pick from actors:   actor_slug only
  //  2) Upload your own:    reference_image_url only
  //  3) Describe:           description only (worker generates portrait first)
  // Exactly one of (actor_slug, reference_image_url, description-only) must be set.
  const modes = [hasActor, hasRefUrl, hasDescription && !hasActor && !hasRefUrl].filter(Boolean).length;
  if (modes !== 1) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide exactly one of actor_slug, reference_image_url, or description',
      },
    });
    return;
  }
  if (description.length > 400) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'description must be ≤400 chars' },
    });
    return;
  }

  let referenceImageUrl: string | null = null;
  let actorSlug: string | null = null;
  let actorName: string | null = null;

  if (hasActor) {
    const { data, error } = await supabase
      .from('actors')
      .select('slug, name, portrait_url')
      .eq('slug', body.actor_slug)
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Actor lookup failed' } });
      return;
    }
    if (!data || !data.portrait_url) {
      res.status(404).json({
        error: { code: 'ACTOR_NOT_FOUND', message: `Actor '${body.actor_slug}' not found or has no portrait` },
      });
      return;
    }
    referenceImageUrl = data.portrait_url;
    actorSlug = data.slug;
    actorName = data.name;
  } else if (hasRefUrl) {
    referenceImageUrl = (body.reference_image_url as string).trim();
    if (!/^https:\/\//i.test(referenceImageUrl)) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'reference_image_url must be an https URL' },
      });
      return;
    }
  }
  // hasDescription-only: referenceImageUrl stays null, worker generates it.

  // Cost depends on whether the worker has to paint the portrait first
  // (description-only = 2 gpt-image-2 calls) or can edit an existing
  // image (actor/reference = 1 call).
  const sheetCreditCost = (hasActor || hasRefUrl)
    ? SHEET_CREDIT_COST_REF
    : SHEET_CREDIT_COST_DESCRIBE;

  // Idempotent submit: if a session_id is provided and a row already
  // exists for (user, session_id, operation='character_sheet'), return
  // it instead of inserting a duplicate. Two-tab races into the same
  // wizard step would otherwise double-charge.
  if (sessionId) {
    const { data: existing } = await supabase
      .from('generation_jobs')
      .select('id, status, credit_cost')
      .eq('user_id', userId)
      .eq('operation', 'character_sheet')
      .eq('input_params->>session_id', sessionId)
      .maybeSingle();
    if (existing) {
      res.status(202).json({
        job_id: existing.id,
        status: existing.status,
        operation: 'character_sheet',
        credits_deducted: existing.credit_cost ?? sheetCreditCost,
        poll_url: `/v1/videos/${existing.id}`,
        expected_seconds: SHEET_EXPECTED_SECONDS,
        idempotent: true,
      });
      return;
    }
  }

  const jobId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: 'character-sheet',
    operation: 'character_sheet',
    status: 'submitted',
    prompt: description || `[from ${actorSlug ?? 'reference image'}]`,
    credit_cost: sheetCreditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: {
      ...(referenceImageUrl ? { reference_image_url: referenceImageUrl } : {}),
      ...(actorSlug ? { actor_slug: actorSlug } : {}),
      ...(description ? { description } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    },
  });
  if (insertErr) {
    // Race-loser path: another tab inserted the same (user, session, op)
    // first. Look up and return that row instead of failing.
    if (sessionId && /duplicate key|unique constraint/i.test(insertErr.message)) {
      const { data: winner } = await supabase
        .from('generation_jobs')
        .select('id, status, credit_cost')
        .eq('user_id', userId)
        .eq('operation', 'character_sheet')
        .eq('input_params->>session_id', sessionId)
        .maybeSingle();
      if (winner) {
        res.status(202).json({
          job_id: winner.id,
          status: winner.status,
          operation: 'character_sheet',
          credits_deducted: winner.credit_cost ?? sheetCreditCost,
          poll_url: `/v1/videos/${winner.id}`,
          expected_seconds: SHEET_EXPECTED_SECONDS,
          idempotent: true,
        });
        return;
      }
    }
    console.error(`[character-sheet] job insert failed: ${insertErr.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: `Failed to create job: ${insertErr.message}` } });
    return;
  }

  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: sheetCreditCost,
    p_job_id: jobId,
    p_description: `Character sheet — ${actorSlug ?? (description.slice(0, 40) || 'from ref image')}`,
  });
  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
    const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
    res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
    return;
  }

  const workerPayload: Record<string, unknown> = {
    job_id: jobId,
    user_id: userId,
    ...(referenceImageUrl ? { reference_image_url: referenceImageUrl } : {}),
    ...(description ? { description } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
  };

  const enqueued = USE_DURABLE_QUEUE
    ? await enqueueDispatch({
        job_id: jobId,
        target: 'character-sheet-generate' as DispatchTarget,
        generator_id: 'character_sheet',
        body: workerPayload,
        enqueued_at: new Date().toISOString(),
      })
    : null;

  if (!enqueued) {
    // Fallback: fire-and-forget HTTP. The worker route ack-fast-returns 202
    // and runs in the background; we don't await the result.
    fetch(`${WORKER_V2_URL}/character-sheet-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: JSON.stringify(workerPayload),
    }).catch(async (err: Error) => {
      console.error(`[character-sheet] worker dispatch failed: ${err.message}`);
      await safeRefund(userId, sheetCreditCost, jobId, 'Refund: dispatch failed');
      await supabase.from('generation_jobs').update({ status: 'failed', error_message: 'Worker dispatch failed' }).eq('id', jobId);
    });
  }

  res.status(202).json({
    job_id: jobId,
    status: 'submitted',
    operation: 'character_sheet',
    credits_deducted: sheetCreditCost,
    poll_url: `/v1/videos/${jobId}`,
    expected_seconds: SHEET_EXPECTED_SECONDS,
    source: actorSlug ? 'actor' : referenceImageUrl ? 'reference' : 'description',
    ...(actorSlug ? { actor_slug: actorSlug, actor_name: actorName } : {}),
    ...(referenceImageUrl ? { reference_image_url: referenceImageUrl } : {}),
    ...(description ? { description } : {}),
  });
}

// ── POST /v1/character/storyboard-generate ────────────────────────────
export async function characterStoryboardGenerateRoute(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing user id' } });
    return;
  }

  const body = (req.body ?? {}) as {
    character_sheet_url?: string;
    beats?: unknown;
    /** Free-form script — gpt-image-2 splits into panels itself. */
    script?: unknown;
    ratio?: '9:16' | '16:9' | '1:1';
    session_id?: string;
  };
  const sessionId = typeof body.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.session_id) ? body.session_id : null;
  const scriptText = typeof body.script === 'string' ? body.script.trim() : '';

  if (!body.character_sheet_url || typeof body.character_sheet_url !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'character_sheet_url is required' } });
    return;
  }
  if (!/^https:\/\//i.test(body.character_sheet_url)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'character_sheet_url must be HTTPS' } });
    return;
  }

  // Caller must provide EITHER beats[] OR script. Script wins if both
  // are sent.
  let beats: string[] = [];
  let useScript = false;
  if (scriptText.length >= 10) {
    useScript = true;
    if (scriptText.length > 2000) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'script must be ≤2000 chars' } });
      return;
    }
  } else if (Array.isArray(body.beats)) {
    beats = body.beats.filter(
      (b): b is string => typeof b === 'string' && b.trim().length >= 3 && b.trim().length <= 200,
    );
    if (beats.length < 3 || beats.length > 10) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'beats must be 3-10 strings of 3-200 chars each' },
      });
      return;
    }
  } else {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'provide beats[] or script (≥10 chars)' } });
    return;
  }

  const ratio = body.ratio ?? '9:16';
  if (!['9:16', '16:9', '1:1'].includes(ratio)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'ratio must be one of 9:16, 16:9, 1:1' },
    });
    return;
  }

  // Idempotent submit (see sheet route).
  if (sessionId) {
    const { data: existing } = await supabase
      .from('generation_jobs')
      .select('id, status, credit_cost')
      .eq('user_id', userId)
      .eq('operation', 'character_storyboard')
      .eq('input_params->>session_id', sessionId)
      .maybeSingle();
    if (existing) {
      res.status(202).json({
        job_id: existing.id,
        status: existing.status,
        operation: 'character_storyboard',
        credits_deducted: existing.credit_cost ?? STORYBOARD_CREDIT_COST,
        poll_url: `/v1/videos/${existing.id}`,
        expected_seconds: STORYBOARD_EXPECTED_SECONDS,
        beats_used: beats,
        idempotent: true,
      });
      return;
    }
  }

  // Resolve the parent character_id from the session's sheet job, so
  // every storyboard ties back to a durable user_characters row.
  let characterId: string | null = null;
  if (sessionId) {
    const { data: sheetJob } = await supabase
      .from('generation_jobs')
      .select('character_id')
      .eq('user_id', userId)
      .eq('operation', 'character_sheet')
      .eq('input_params->>session_id', sessionId)
      .maybeSingle();
    characterId = (sheetJob?.character_id as string | null) ?? null;
  }

  const jobId = crypto.randomUUID();
  const promptForDb = useScript ? scriptText.slice(0, 500) : beats.join(' / ');
  const { error: insertErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: 'character-storyboard',
    operation: 'character_storyboard',
    status: 'submitted',
    prompt: promptForDb,
    credit_cost: STORYBOARD_CREDIT_COST,
    provider_slug: 'railway',
    provider_job_id: jobId,
    ...(characterId ? { character_id: characterId } : {}),
    input_params: {
      character_sheet_url: body.character_sheet_url,
      ...(useScript ? { script: scriptText } : { beats }),
      ratio,
      ...(sessionId ? { session_id: sessionId } : {}),
    },
  });
  if (insertErr) {
    if (sessionId && /duplicate key|unique constraint/i.test(insertErr.message)) {
      const { data: winner } = await supabase
        .from('generation_jobs')
        .select('id, status, credit_cost')
        .eq('user_id', userId)
        .eq('operation', 'character_storyboard')
        .eq('input_params->>session_id', sessionId)
        .maybeSingle();
      if (winner) {
        res.status(202).json({
          job_id: winner.id,
          status: winner.status,
          operation: 'character_storyboard',
          credits_deducted: winner.credit_cost ?? STORYBOARD_CREDIT_COST,
          poll_url: `/v1/videos/${winner.id}`,
          expected_seconds: STORYBOARD_EXPECTED_SECONDS,
          beats_used: beats,
          idempotent: true,
        });
        return;
      }
    }
    console.error(`[character-storyboard] job insert failed: ${insertErr.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: `Failed to create job: ${insertErr.message}` } });
    return;
  }

  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: STORYBOARD_CREDIT_COST,
    p_job_id: jobId,
    p_description: useScript ? 'Storyboard — script' : `Storyboard — ${beats.length} panels`,
  });
  if (creditErr) {
    await supabase.from('generation_jobs').delete().eq('id', jobId);
    const msg = creditErr.message || '';
    const code = /INSUFFICIENT_CREDITS/i.test(msg) ? 'INSUFFICIENT_CREDITS' : 'CREDIT_DEDUCTION_FAILED';
    const status = code === 'INSUFFICIENT_CREDITS' ? 402 : 500;
    res.status(status).json({ error: { code, message: msg || 'Credit deduction failed' } });
    return;
  }

  const workerPayload = {
    job_id: jobId,
    user_id: userId,
    character_sheet_url: body.character_sheet_url,
    ...(useScript ? { script: scriptText } : { beats }),
    ratio,
    ...(sessionId ? { session_id: sessionId } : {}),
  };

  const enqueued = USE_DURABLE_QUEUE
    ? await enqueueDispatch({
        job_id: jobId,
        target: 'character-storyboard-generate' as DispatchTarget,
        generator_id: 'character_storyboard',
        body: workerPayload,
        enqueued_at: new Date().toISOString(),
      })
    : null;

  if (!enqueued) {
    fetch(`${WORKER_V2_URL}/character-storyboard-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
      body: JSON.stringify(workerPayload),
    }).catch(async (err: Error) => {
      console.error(`[character-storyboard] worker dispatch failed: ${err.message}`);
      await safeRefund(userId, STORYBOARD_CREDIT_COST, jobId, 'Refund: dispatch failed');
      await supabase.from('generation_jobs').update({ status: 'failed', error_message: 'Worker dispatch failed' }).eq('id', jobId);
    });
  }

  res.status(202).json({
    job_id: jobId,
    status: 'submitted',
    operation: 'character_storyboard',
    credits_deducted: STORYBOARD_CREDIT_COST,
    poll_url: `/v1/videos/${jobId}`,
    expected_seconds: STORYBOARD_EXPECTED_SECONDS,
    beats_used: beats,
  });
}
