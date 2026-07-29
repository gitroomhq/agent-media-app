// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 CLI helpers — shared upload + dispatch + poll logic so each v2
 * command stays a thin wrapper around the registry.
 */

import { readFileSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, type ApiIssue } from '../lib/errors.js';
import { createSpinner } from '../lib/output.js';
import type { OutputMode } from '../types.js';

const PHOTO_MIME = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.heic', 'image/heic'],
]);

// Supabase public-asset URL for the generation-inputs bucket. The
// `upload-url` edge function returns only `storage_path`; the CLI
// constructs the public URL itself. Same constant the legacy commands
// (character-video, laptop-ugc, review, subtitle) already hard-code.
const SUPABASE_PUBLIC_BASE =
  'https://ppwvarkmpffljlqxkjux.supabase.co/storage/v1/object/public/generation-inputs';

/**
 * Accepts either a `https://…` URL or a local file path.
 *  - URL: returned verbatim
 *  - File: uploaded via the existing presigned-url helper, returns the public URL
 *
 * Same upload path the legacy commands use (see laptop-ugc.ts line 109+).
 */
export async function resolvePhotoOrUrl(
  api: AgentMediaAPI,
  pathOrUrl: string,
): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  // Local path
  let st;
  try {
    st = statSync(pathOrUrl);
  } catch {
    throw new CLIError(`File not found: ${pathOrUrl}`, {
      code: 'FILE_NOT_FOUND',
      suggestion: 'Check the path and try again.',
    });
  }
  if (!st.isFile()) {
    throw new CLIError(`${pathOrUrl} is not a regular file`, { code: 'FILE_NOT_FILE' });
  }
  const ext = extname(pathOrUrl).toLowerCase();
  const mime = PHOTO_MIME.get(ext);
  if (!mime) {
    throw new CLIError(
      `Unsupported photo type "${ext}". Accepts: ${Array.from(PHOTO_MIME.keys()).join(', ')}`,
      { code: 'UNSUPPORTED_PHOTO_TYPE' },
    );
  }

  const buf = readFileSync(pathOrUrl);
  const { upload_url, storage_path } = await api.getUploadUrl(basename(pathOrUrl), mime);
  await api.uploadFile(upload_url, buf.buffer as ArrayBuffer, mime);
  return `${SUPABASE_PUBLIC_BASE}/${storage_path}`;
}

/**
 * Make an authenticated POST to api-v2 at an arbitrary path. The
 * existing AgentMediaAPI.request() is private; this hits the same
 * baseUrl + auth chain via a fresh fetch using fields the class
 * already exposes.
 */
export async function postJSON(
  api: AgentMediaAPI,
  path: string,
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${api.baseUrl}${path}`;
  const headers = authHeaders(api, true);

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* leave as null; caller handles non-JSON */
    }
  }
  return { status: resp.status, data };
}

function authHeaders(api: AgentMediaAPI, includeJsonContentType: boolean): Record<string, string> {
  // baseUrl is public on AgentMediaAPI; apiKey/anonKey are not, so we
  // read them off the instance with a narrow cast (private fields, not
  // type holes — the data lives on the same object).
  const reader = api as unknown as { apiKey: string; anonKey?: string };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${reader.apiKey}`,
  };
  if (includeJsonContentType) headers['Content-Type'] = 'application/json';
  if (reader.anonKey) headers['apikey'] = reader.anonKey;
  return headers;
}

interface StreamJob {
  status?: string;
  [key: string]: unknown;
}

function isTerminalJob(job: StreamJob): boolean {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'canceled';
}

async function waitForV2Stream(
  api: AgentMediaAPI,
  jobId: string,
  opts: { timeoutMs: number; onTick?: (s: unknown) => void },
): Promise<unknown> {
  const headers = authHeaders(api, false);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), opts.timeoutMs);

  try {
    const resp = await fetch(`${api.baseUrl}/v2/jobs/${encodeURIComponent(jobId)}/stream`, {
      method: 'GET',
      headers,
      signal: abortController.signal,
    });
    if (!resp.ok) {
      throw new CLIError(`SSE stream unavailable (HTTP ${resp.status})`, { code: 'SSE_UNAVAILABLE' });
    }
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('text/event-stream')) {
      throw new CLIError(`Unexpected stream content-type: ${ct || '(missing)'}`, { code: 'SSE_UNAVAILABLE' });
    }
    if (!resp.body) {
      throw new CLIError('SSE stream opened without a response body', { code: 'SSE_UNAVAILABLE' });
    }

    const decoder = new TextDecoder();
    const reader = resp.body.getReader();
    let buffer = '';
    let eventName = 'message';
    let dataLines: string[] = [];

    const flushEvent = (): StreamJob | null => {
      if (dataLines.length === 0) {
        eventName = 'message';
        return null;
      }
      const raw = dataLines.join('\n');
      dataLines = [];
      const previousName = eventName;
      eventName = 'message';
      if (previousName !== 'job.update') return null;
      try {
        return JSON.parse(raw) as StreamJob;
      } catch {
        return null;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const newlineIdx = buffer.indexOf('\n');
        if (newlineIdx < 0) break;
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
        buffer = buffer.slice(newlineIdx + 1);

        if (line.length === 0) {
          const evt = flushEvent();
          if (evt) {
            if (opts.onTick) opts.onTick(evt);
            if (isTerminalJob(evt)) return evt;
          }
          continue;
        }
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || 'message';
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }

    throw new CLIError(`SSE stream ended before job ${jobId} reached terminal status`, {
      code: 'SSE_UNAVAILABLE',
    });
  } catch (err) {
    if (err instanceof CLIError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CLIError(`SSE stream timeout after ${Math.round(opts.timeoutMs / 1000)}s`, {
        code: 'SSE_UNAVAILABLE',
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isSseUnavailableError(err: unknown): boolean {
  return err instanceof CLIError && err.code === 'SSE_UNAVAILABLE';
}

/**
 * Poll a v2 job until terminal. Returns the final job row (same
 * shape the legacy CLI commands consume).
 */
export async function pollV2(
  api: AgentMediaAPI,
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (s: unknown) => void } = {},
): Promise<unknown> {
  const intervalMs = opts.intervalMs ?? 5_000;
  // Just above the backend's 15-min processing timeout — so the client fails with
  // a clear, id-bearing message rather than hanging 15 min past the server giving up.
  const timeoutMs = opts.timeoutMs ?? 16 * 60_000;
  const deadline = Date.now() + timeoutMs;
  try {
    return await waitForV2Stream(api, jobId, { timeoutMs, onTick: opts.onTick });
  } catch (err) {
    if (!isSseUnavailableError(err)) throw err;
    // Stream is best-effort: if SSE is unavailable, fall back to polling.
  }

  while (Date.now() < deadline) {
    const job = await api.getJob(jobId);
    if (opts.onTick) opts.onTick(job);
    if (isTerminalJob(job as unknown as StreamJob)) {
      return job;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new CLIError(
    `Polling timed out after ${Math.round(timeoutMs / 1000)}s for job ${jobId}`,
    { code: 'POLL_TIMEOUT' },
  );
}

/**
 * Build a CLIError from a non-2xx v2 submit response, preserving the backend's
 * field-level validation `issues` so "Invalid request / VALIDATION_ERROR" is
 * never the whole story. Shared by selfie / character / subtitle.
 */
export function v2SubmitError(status: number, data: unknown): CLIError {
  const err = (data as { error?: { message?: string; code?: string; issues?: ApiIssue[] } } | null)?.error;
  return new CLIError(err?.message ?? `Submission failed (HTTP ${status})`, {
    code: err?.code ?? 'SUBMIT_FAILED',
    issues: err?.issues,
  });
}

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Poll a v2 job to completion with visible liveness, so a multi-minute render is
 * never mistaken for a hang:
 *  - human mode: a spinner whose text shows the elapsed time (updates every 1s
 *    even when the server sends no status change).
 *  - json/quiet/non-TTY: a heartbeat line to STDERR every 20s (stdout stays clean).
 *  - Ctrl-C: prints the job id + `agent-media status <id>` so the paid job is
 *    resumable instead of orphaned blind.
 * Returns the final job row. The caller prints the terminal result/failure.
 */
export async function pollWithFeedback(
  api: AgentMediaAPI,
  jobId: string,
  opts: { mode: OutputMode; label: string },
): Promise<unknown> {
  const isHuman = opts.mode === 'human';
  const started = Date.now();
  let lastStatus = '';
  const spin = isHuman ? createSpinner(`${opts.label}…`) : null;
  spin?.start();

  const ticker = setInterval(
    () => {
      const el = fmtElapsed(Date.now() - started);
      const status = lastStatus ? ` ${lastStatus}` : '';
      if (spin) spin.text = `${opts.label}…${status} (${el}, Ctrl-C to detach)`;
      else process.stderr.write(`… ${opts.label}${status} (${el})\n`);
    },
    isHuman ? 1_000 : 20_000,
  );

  const onSigint = (): void => {
    clearInterval(ticker);
    spin?.stop();
    process.stderr.write(
      `\nStill running as ${jobId}. Check it later with: agent-media status ${jobId}\n`,
    );
    process.exit(130);
  };
  process.once('SIGINT', onSigint);

  try {
    return await pollV2(api, jobId, {
      onTick: (s: unknown) => {
        lastStatus = (s as { status?: string }).status ?? lastStatus;
      },
    });
  } finally {
    clearInterval(ticker);
    process.removeListener('SIGINT', onSigint);
    spin?.stop();
  }
}
