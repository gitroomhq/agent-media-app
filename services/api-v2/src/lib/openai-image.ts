// Copyright 2026 agent-media contributors. Apache-2.0 license.

import OpenAI from 'openai';

/**
 * OpenAI image client for api-v2.
 *
 * Called only by the internal /internal/gpt-image route, which the primitive
 * worker invokes over Railway's private network (the worker's OWN OpenAI egress
 * is intermittently blackholed by Railway NAT; api-v2's egress is healthy).
 *
 * IMPORTANT: this uses the plain OpenAI SDK with Node's built-in fetch — we do
 * NOT pull in undici@8 here. api-v2 runs on an older Node whose undici lacks
 * `webidl.util.markAsUncloneable`, so importing undici@8 crashes the whole
 * service at boot. api-v2's egress is healthy, so the anycast IP-rotation the
 * worker needs is unnecessary on this side. The SDK's maxRetries handles
 * transient blips.
 */

let _client: OpenAI | null = null;

function getOpenAI(apiKey: string): OpenAI {
  if (!_client) {
    // The worker aborts this fallback call at 75s (generateImageViaApiV2).
    // The old 5 retries × 90s timeout guaranteed the abort fired first → every
    // fallback surfaced as "ProxyImageError: image proxy unreachable, aborted
    // due to timeout" (top Sentry issue). Fail FAST: one quick retry + 60s
    // timeout so the call resolves (success or a real error) inside the worker's
    // window; Temporal retries the whole activity for transient blips.
    _client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
  }
  return _client;
}

export interface GenerateImageParams {
  model: string;
  prompt: string;
  referencePng?: Buffer;
  /** MULTIPLE reference images for a multi-reference edit (gpt-image-2, up to 16).
   *  Takes precedence over referencePng — used for the podcast two-shot master. */
  referencePngs?: Buffer[];
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
}

export interface GenerateImageResult {
  bytes: Buffer;
  mime: 'image/png';
}

export interface OpenAIImageError {
  /** HTTP status if OpenAI returned a real API error (4xx/5xx), else 0. */
  status: number;
  code: string;
  message: string;
  /** 4xx caller faults are not retryable; everything else is. */
  retryable: boolean;
}

export function classifyOpenAIError(err: unknown): OpenAIImageError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    const retryable = !(status >= 400 && status < 500);
    return {
      status,
      code: `OPENAI_${status || 'TRANSIENT'}`,
      message: `openai ${status}: ${err.message}`,
      retryable,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 0, code: 'OPENAI_UNKNOWN', message, retryable: true };
}

function decodeImageResponse(resp: OpenAI.Images.ImagesResponse): GenerateImageResult {
  const first = resp.data?.[0];
  if (!first) throw new Error('openai: empty images.data');
  if (first.b64_json) return { bytes: Buffer.from(first.b64_json, 'base64'), mime: 'image/png' };
  if (first.url) throw new Error('openai: returned URL instead of b64_json — not implemented');
  throw new Error('openai: response had neither b64_json nor url');
}

/**
 * Call gpt-image-2 (generations, or edits when a reference PNG is provided).
 * Returns raw PNG bytes. Throws OpenAI.APIError for real API failures so the
 * caller can classify retryable vs non-retryable.
 */
export async function generateImage(
  apiKey: string,
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  const client = getOpenAI(apiKey);
  const size = params.size ?? 'auto';
  const refs =
    params.referencePngs && params.referencePngs.length > 0
      ? params.referencePngs
      : params.referencePng
        ? [params.referencePng]
        : [];
  if (refs.length > 0) {
    const files = await Promise.all(
      refs.map((buf, i) => OpenAI.toFile(buf, `reference-${i}.png`, { type: 'image/png' })),
    );
    const resp = await client.images.edit({
      model: params.model,
      image: files.length === 1 ? files[0] : files,
      prompt: params.prompt,
      size: size === 'auto' ? undefined : size,
    });
    return decodeImageResponse(resp);
  }
  const resp = await client.images.generate({
    model: params.model,
    prompt: params.prompt,
    size: size === 'auto' ? undefined : size,
  });
  return decodeImageResponse(resp);
}
