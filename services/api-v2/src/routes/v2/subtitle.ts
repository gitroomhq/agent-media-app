// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /v2/subtitle
 *
 * Public REST entry for the v2 subtitle generator.
 *   1. Auth (bearer token via parent router middleware)
 *   2. Validate input with @agentmedia/schema/v2 → SubtitleSchema
 *   3. Create generation_jobs row (operation='subtitle')
 *   4. Deduct credits via deduct_credits RPC
 *   5. Dispatch to media-worker-v2 POST /v2/subtitle
 *   6. Return 201 + job_id + credits_deducted
 *
 * Pricing is per-second so the credit cost depends on the source
 * video length. We don't know the length here (we'd have to HEAD +
 * ffprobe the URL first), so we charge a placeholder duration of
 * 30s up front and reconcile via webhook once the worker probes
 * the real duration. That's the same pattern api-v2 already uses
 * for legacy subtitle jobs.
 */

import type { Request, Response } from 'express';
import {
  SubtitleSchema,
  V2_GENERATORS,
  quoteV2Credits,
} from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';

const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

// Placeholder duration we quote up-front. Real reconciliation happens
// in the webhook handler when the worker reports actual seconds.
const QUOTED_DURATION_S = 30;

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

export async function subtitleRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  const parsed = SubtitleSchema.safeParse(req.body);
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
  const creditCost = quoteV2Credits('subtitle', { durationSeconds: QUOTED_DURATION_S });

  if (!WORKER_V2_URL || !WORKER_SECRET) {
    res.status(503).json({
      error: { code: 'WORKER_NOT_CONFIGURED', message: 'Subtitle service is not configured.' },
    });
    return;
  }

  const jobId = crypto.randomUUID();
  const { error: jobErr } = await supabase.from('generation_jobs').insert({
    id: jobId,
    user_id: userId,
    model_slug: 'whisper+ass+ffmpeg',
    operation: 'subtitle',
    status: 'submitted',
    prompt: input.transcript ?? null,
    credit_cost: creditCost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: {
      video_url: input.video_url,
      style: input.style,
      ...(input.transcript ? { transcript: input.transcript } : {}),
      ...(input.language ? { language: input.language } : {}),
    },
  });
  if (jobErr) {
    console.error('[v2 subtitle] job insert failed:', jobErr.message);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to create job' } });
    return;
  }

  const { error: creditErr } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `Subtitle · ${input.style}`,
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

  fetch(`${WORKER_V2_URL}/v2/subtitle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': WORKER_SECRET },
    body: JSON.stringify({
      job_id: jobId,
      user_id: userId,
      video_url: input.video_url,
      style: input.style,
      ...(input.transcript ? { transcript: input.transcript } : {}),
      ...(input.language ? { language: input.language } : {}),
      callback_url: buildCallbackUrl(jobId),
    }),
  }).catch((err: Error) =>
    console.error(`[v2 subtitle] worker dispatch failed: ${err.message}`),
  );

  res.status(201).json({
    job_id: jobId,
    status: 'submitted',
    credits_deducted: creditCost,
    generator: V2_GENERATORS.subtitle.id,
  });
}
