// Copyright 2026 agent-media contributors. Apache-2.0 license.

import OpenAI from 'openai';
import { Agent, fetch as undiciFetch } from 'undici';

let _client: OpenAI | null = null;

/**
 * THE fix (proven in-container, 9.6s for a full 1MB image):
 *
 * The OpenAI SDK's DEFAULT fetch pools keep-alive sockets and reuses a stale one
 * that the server/intermediary cuts mid-generation → "Premature close" at ~10s,
 * FAILING every gpt-image call (a fresh raw fetch always works). The cause was
 * NOT a network blackhole and NOT IP-pinning — it was socket REUSE.
 *
 * Fix: a custom fetch that opens a FRESH connection per request (keepAlive off)
 * with sane 120s header/body timeouts. NO IP rotation / custom connector — that
 * was a separate bug from the misdiagnosis era that broke the direct path. The
 * worker's egress to OpenAI is healthy with a fresh connection.
 */
// ONE shared Agent (created once, reused forever) — a NEW Agent per request
// leaks sockets/handles and degraded the long-running worker after ~13 min.
// keepAliveTimeout 1ms closes idle sockets immediately, so a socket is never
// reused for a later request → fresh connection per call (kills "Premature
// close") WITHOUT leaking. `connections` caps concurrent sockets so a burst
// can't exhaust file descriptors.
const _openaiAgent = new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
  // gpt-image-2 real p100 latency is 2-5 min (vault: content-machine-pipeline.md
  // L104). 120s aborted slow-but-healthy calls mid-body → direct-fail → api-v2
  // fallback cascade → 5-9 min runs (Bug 4). Raise to 300s to match real latency.
  headersTimeout: 300_000,
  bodyTimeout: 300_000,
  connections: 64,
});

const _openaiFetch: typeof fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: _openaiAgent,
    // undici's fetch THROWS "RequestInit: duplex option is required when sending
    // a body" for any request with a body (gpt-image edits stream a multipart
    // body). The global fetch the SDK targets doesn't set it, so set it here.
    // Harmless for string/JSON bodies; required for streamed ones.
    ...((init as { body?: unknown })?.body != null ? { duplex: 'half' } : {}),
  } as Parameters<typeof undiciFetch>[1])) as unknown as typeof fetch;

export function getOpenAI(apiKey: string): OpenAI {
  if (!_client) {
    // maxRetries 2: Temporal's activity retry is the real recovery loop (anti-storm).
    // timeout 300s: gpt-image-2's real worst case is 2-5 min; the old 120s fired
    // the SDK's own "Request timed out" under event-loop load → fallback cascade.
    _client = new OpenAI({ apiKey, maxRetries: 2, timeout: 300_000, fetch: _openaiFetch });
  }
  return _client;
}

export interface GenerateImageParams {
  model: string;
  prompt: string;
  /** Optional reference image bytes for image-to-image edits. */
  referencePng?: Buffer;
  /** Optional MULTIPLE reference images for a multi-reference edit (gpt-image-2
   *  accepts up to 16 in one /images/edits call). Used to composite two distinct
   *  people into one scene (make_podcast's two-shot master). When set it takes
   *  precedence over referencePng. */
  referencePngs?: Buffer[];
  /** OpenAI Images API size. Default "auto" lets the model pick. */
  size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
}

/**
 * Call OpenAI gpt-image-2 either via /v1/images/generations (text-only)
 * or /v1/images/edits (when a reference image is provided). Returns raw
 * PNG bytes.
 */
/**
 * Retry on undici "Premature close" (the worker's egress drops the connection
 * mid-stream — a fresh global dispatcher didn't fix it, so retry the whole
 * call). NEVER retries a real OpenAI APIError (4xx safety/policy etc.) — those
 * are caller faults and each retry burns credit.
 */
async function withPrematureCloseRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof OpenAI.APIError) throw e; // real API response — don't retry
      const msg = e instanceof Error ? e.message : String(e);
      if (!/premature close|ERR_STREAM_PREMATURE_CLOSE|terminated|ECONNRESET|fetch failed|socket hang up/i.test(msg)) {
        throw e;
      }
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function generateImage(
  client: OpenAI,
  params: GenerateImageParams,
): Promise<{ bytes: Buffer; mime: 'image/png' }> {
  const size = params.size ?? 'auto';
  const refs =
    params.referencePngs && params.referencePngs.length > 0
      ? params.referencePngs
      : params.referencePng
        ? [params.referencePng]
        : [];
  if (refs.length > 0) {
    // Image edits endpoint accepts a base "image" the model edits/extends — or an
    // ARRAY of images for a multi-reference edit (gpt-image-2, up to 16), which is
    // how we composite two distinct people into one podcast two-shot master.
    const files = await Promise.all(
      refs.map((buf, i) => OpenAI.toFile(buf, `reference-${i}.png`, { type: 'image/png' })),
    );
    const resp = await withPrematureCloseRetry(() => client.images.edit({
      model: params.model,
      image: files.length === 1 ? files[0] : files,
      prompt: params.prompt,
      size: size === 'auto' ? undefined : size,
      // gpt-image-2 returns base64 b64_json by default.
    }));
    return decodeImageResponse(resp);
  }
  const resp = await withPrematureCloseRetry(() => client.images.generate({
    model: params.model,
    prompt: params.prompt,
    size: size === 'auto' ? undefined : size,
  }));
  return decodeImageResponse(resp);
}

export interface OpenAIErrorClassification {
  retryable: boolean;
  code: string;
  message: string;
}

/**
 * Error carrying the proxy's classification (the gpt-image call now runs in
 * api-v2 and returns retryable/non-retryable + a code). classifyOpenAIError
 * honours it so the activities' retry behaviour is unchanged.
 */
export class ProxyImageError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'ProxyImageError';
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Proxy gpt-image-2 generation through api-v2's healthy egress over Railway's
 * private network. Same return shape as generateImage so the activities are a
 * drop-in swap. Throws ProxyImageError (classifiable) on failure.
 */
export async function generateImageViaApiV2(
  cfg: {
    imageProxyUrl: string;
    imageProxySecret: string;
    imageModel: string;
  },
  params: GenerateImageParams,
): Promise<{ bytes: Buffer; mime: 'image/png' }> {
  const url = `${cfg.imageProxyUrl.replace(/\/+$/, '')}/internal/gpt-image`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': cfg.imageProxySecret,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model || cfg.imageModel,
        size: params.size ?? 'auto',
        reference_png_base64: params.referencePng
          ? params.referencePng.toString('base64')
          : undefined,
        // Multi-reference edit (e.g. the podcast two-shot master): send every
        // reference so the proxy makes the same multi-image /images/edits call.
        reference_pngs_base64:
          params.referencePngs && params.referencePngs.length > 0
            ? params.referencePngs.map((b) => b.toString('base64'))
            : undefined,
      }),
      // Fast-fail: a hung api-v2 call must NOT blow the activity's 4-min
      // startToClose (it did — direct-fail + 180s fallback + retry = stuck run).
      // 75s covers a healthy proxy gpt-image call; beyond that, fail and let
      // Temporal retry the (reliable) direct path with a fresh attempt.
      signal: AbortSignal.timeout(75_000),
    });
  } catch (e) {
    // Network failure reaching api-v2 (not OpenAI) — transient, retry.
    const msg = e instanceof Error ? e.message : String(e);
    throw new ProxyImageError(`image proxy unreachable: ${msg}`, 'PROXY_UNREACHABLE', true);
  }

  if (resp.ok) {
    const json = (await resp.json()) as { b64_json?: string };
    if (!json.b64_json) {
      throw new ProxyImageError('image proxy returned no b64_json', 'PROXY_EMPTY', true);
    }
    return { bytes: Buffer.from(json.b64_json, 'base64'), mime: 'image/png' };
  }

  // Error response — read the classification the proxy attached.
  let body: { error?: string; code?: string; retryable?: boolean } = {};
  try {
    body = (await resp.json()) as typeof body;
  } catch {
    /* non-JSON error body */
  }
  // 401/503 from the proxy itself = misconfig — surface as non-retryable so it's
  // visible, not silently retried forever.
  const retryable =
    typeof body.retryable === 'boolean'
      ? body.retryable
      : resp.status >= 500 && resp.status !== 503;
  throw new ProxyImageError(
    body.error ?? `image proxy ${resp.status}`,
    body.code ?? `PROXY_${resp.status}`,
    retryable,
  );
}

/**
 * Generate a gpt-image with a fast PRIMARY (direct OpenAI from the worker — its
 * egress is healthy, ~15s) and an automatic FALLBACK to the api-v2 proxy if the
 * direct call hits a CONNECTION-class failure (not a real 4xx content/policy
 * error — those must surface, never silently retried on another path).
 *
 * This is the durable shape: normally fast & direct; if the worker's egress
 * ever genuinely degrades again, image-gen self-heals through api-v2 instead of
 * failing. A real OpenAI 4xx is re-thrown immediately.
 */
export async function generateImageWithFallback(
  cfg: {
    apiKey: string;
    imageModel: string;
    imageProxyUrl: string;
    imageProxySecret: string;
  },
  params: GenerateImageParams,
): Promise<{ bytes: Buffer; mime: 'image/png' }> {
  try {
    return await generateImage(getOpenAI(cfg.apiKey), params);
  } catch (err) {
    // Real OpenAI API error (4xx content/policy/auth/413) → do NOT fall back;
    // the proxy would just hit the same rejection and waste a generation.
    if (err instanceof OpenAI.APIError && err.status >= 400 && err.status < 500) {
      throw err;
    }
    // DIAGNOSTIC: the direct path is reliable in isolation but fails under
    // in-process concurrent load; the error was previously swallowed here. Log
    // exactly what it is so we stop guessing.
    const e = err as { name?: string; message?: string; status?: number; cause?: { code?: string; message?: string } };
    // eslint-disable-next-line no-console
    console.warn(
      `[gpt-image] DIRECT path failed, falling back to api-v2: name=${e?.name} status=${e?.status} msg=${String(e?.message).slice(0, 160)} causeCode=${e?.cause?.code ?? ''} causeMsg=${String(e?.cause?.message ?? '').slice(0, 120)}`,
    );
    // Connection-class / transient failure → try the api-v2 private-network
    // proxy (independent, healthy egress).
    return await generateImageViaApiV2(
      {
        imageProxyUrl: cfg.imageProxyUrl,
        imageProxySecret: cfg.imageProxySecret,
        imageModel: cfg.imageModel,
      },
      params,
    );
  }
}

/**
 * Map an OpenAI SDK error to retryable/non-retryable. 4xx caller faults
 * (bad prompt, content policy, auth, payload too large) must not retry —
 * each retry burns more credit. 5xx and network errors are transient.
 */
export function classifyOpenAIError(err: unknown): OpenAIErrorClassification {
  if (err instanceof ProxyImageError) {
    return { retryable: err.retryable, code: err.code, message: err.message };
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    if (status >= 400 && status < 500) {
      return {
        retryable: false,
        code: `OPENAI_${status}`,
        message: `openai ${status}: ${err.message}`,
      };
    }
    return {
      retryable: true,
      code: `OPENAI_${status || 'TRANSIENT'}`,
      message: `openai transient ${status}: ${err.message}`,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { retryable: true, code: 'OPENAI_UNKNOWN', message };
}

function decodeImageResponse(resp: OpenAI.Images.ImagesResponse): {
  bytes: Buffer;
  mime: 'image/png';
} {
  const first = resp.data?.[0];
  if (!first) throw new Error('openai: empty images.data');
  if (first.b64_json) {
    return { bytes: Buffer.from(first.b64_json, 'base64'), mime: 'image/png' };
  }
  if (first.url) {
    throw new Error(
      'openai: returned URL instead of b64_json — fetch path not implemented',
    );
  }
  throw new Error('openai: response had neither b64_json nor url');
}
