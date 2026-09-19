// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../server.js';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
export function requestIdentity(userId: string, kind: string, body: unknown, requestId: string = randomUUID()) {
  return {
    requestId,
    key: `loose:${userId}:${createHash('sha256').update(requestId).digest('hex')}`,
    hash: createHash('sha256').update(canonicalJson({ kind, input: body })).digest('hex'),
  };
}
export type GenerationRequest = Request & { generationIdentity?: ReturnType<typeof requestIdentity> };
export function replayResponse(response: Record<string, unknown>, status: string) {
  return { ...response, status, replayed: true, original_credits_deducted: response.credits_deducted, credits_deducted: 0 };
}

/** Before concurrency admission and probing: a retry retrieves the saved job. */
export async function generationReplay(req: GenerationRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId || !['image', 'video', 'audio'].includes(String(req.params.kind))) { next(); return; }
  const supplied = req.get('Idempotency-Key');
  if (supplied !== undefined && !REQUEST_ID_PATTERN.test(supplied)) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST_ID', message: 'Idempotency-Key must contain 1–128 letters, numbers, dots, underscores, colons or hyphens.' } });
    return;
  }
  const identity = requestIdentity(userId, String(req.params.kind), req.body, supplied);
  req.generationIdentity = identity;
  res.setHeader('Idempotency-Key', identity.requestId);
  const { data, error } = await supabase.rpc('get_generation_request', { p_user_id: userId, p_idempotency_key: identity.key });
  if (error) {
    res.status(503).json({ error: { code: 'SUBMISSION_LOOKUP_UNAVAILABLE', message: 'Could not check this request. Retry with the same Idempotency-Key.', request_id: identity.requestId } });
    return;
  }
  if (data) {
    if (data.request_hash !== identity.hash || !data.response) {
      res.status(409).json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'This request identity was already used with different inputs. Recover the original job, or use a new identity for an intentionally new generation.' } });
      return;
    }
    res.status(200).json(replayResponse(data.response, data.status));
    return;
  }
  next();
}
