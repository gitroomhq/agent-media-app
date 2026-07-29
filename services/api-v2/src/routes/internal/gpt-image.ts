// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Request, Response } from 'express';
import { generateImage, classifyOpenAIError } from '../../lib/openai-image.js';

/**
 * INTERNAL gpt-image generation endpoint.
 *
 * The primitive worker's egress to api.openai.com is broken (persistent
 * HeadersTimeout from the worker container only). api-v2's egress is healthy,
 * so the worker calls THIS endpoint over Railway's private network and api-v2
 * makes the OpenAI call on its behalf, returning the PNG bytes as base64.
 *
 * Security: requires the shared INTERNAL_API_SECRET in the x-internal-secret
 * header. NOT mounted behind the public authMiddleware — it is service-to-service
 * only and never exposed to end users. If INTERNAL_API_SECRET is unset the route
 * hard-fails closed (503) so it can never run unauthenticated.
 */

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface Body {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  reference_png_base64?: unknown;
  /** Multiple references for a multi-image edit (podcast two-shot master). */
  reference_pngs_base64?: unknown;
}

const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024', 'auto']);

export async function internalGptImageRoute(req: Request, res: Response): Promise<void> {
  if (!INTERNAL_API_SECRET) {
    res.status(503).json({ error: 'internal endpoint not configured' });
    return;
  }
  const provided = req.header('x-internal-secret');
  if (!provided || provided !== INTERNAL_API_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!OPENAI_API_KEY) {
    res.status(503).json({ error: 'OPENAI_API_KEY missing' });
    return;
  }

  const body = (req.body ?? {}) as Body;
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const model = typeof body.model === 'string' && body.model ? body.model : 'gpt-image-2';
  const size = typeof body.size === 'string' && VALID_SIZES.has(body.size) ? body.size : 'auto';
  if (!prompt) {
    res.status(400).json({ error: 'prompt required' });
    return;
  }

  let referencePng: Buffer | undefined;
  if (typeof body.reference_png_base64 === 'string' && body.reference_png_base64.length > 0) {
    try {
      referencePng = Buffer.from(body.reference_png_base64, 'base64');
    } catch {
      res.status(400).json({ error: 'reference_png_base64 decode failed' });
      return;
    }
  }

  // Multi-reference edit: decode every reference so the model composites them
  // (e.g. two distinct people into one podcast two-shot). Max 16 (gpt-image-2).
  let referencePngs: Buffer[] | undefined;
  if (Array.isArray(body.reference_pngs_base64) && body.reference_pngs_base64.length > 0) {
    if (body.reference_pngs_base64.length > 16) {
      res.status(400).json({ error: 'reference_pngs_base64 accepts at most 16 images' });
      return;
    }
    try {
      referencePngs = body.reference_pngs_base64.map((b) => {
        if (typeof b !== 'string' || b.length === 0) throw new Error('empty reference');
        return Buffer.from(b, 'base64');
      });
    } catch {
      res.status(400).json({ error: 'reference_pngs_base64 decode failed' });
      return;
    }
  }

  try {
    const out = await generateImage(OPENAI_API_KEY, {
      model,
      prompt,
      size: size as '1024x1024' | '1024x1536' | '1536x1024' | 'auto',
      referencePng,
      referencePngs,
    });
    res.status(200).json({
      b64_json: out.bytes.toString('base64'),
      bytes: out.bytes.byteLength,
      mime: out.mime,
    });
  } catch (err) {
    const c = classifyOpenAIError(err);
    // Surface the classification so the worker can map retryable vs non-retryable
    // exactly as it did when it called OpenAI directly.
    res.status(c.retryable ? 502 : 422).json({
      error: c.message,
      code: c.code,
      openai_status: c.status,
      retryable: c.retryable,
    });
  }
}
