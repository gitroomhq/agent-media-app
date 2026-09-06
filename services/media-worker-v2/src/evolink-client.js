// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * EvoLink Client — API helpers for calling Kling models via EvoLink.
 *
 * ~55% cheaper than fal.ai/Replicate for the same Kling v3/O3 models.
 *
 * API:
 *   POST /v1/videos/generations  → submit job
 *   GET  /v1/tasks/{task_id}     → poll status
 *
 * Models:
 *   kling-v3-text-to-video, kling-v3-image-to-video
 *   kling-o3-text-to-video, kling-o3-image-to-video
 */

import { writeFile } from 'node:fs/promises';
import { evolinkLimiter, CircuitOpenError } from './provider-limiter.js';

const BASE_URL = 'https://api.evolink.ai/v1';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 1_800_000; // 30 min — EvoLink Seedance degrades under sustained load
const DEFAULT_GENERATION_ATTEMPTS = parsePositiveInteger(process.env.EVOLINK_GENERATION_ATTEMPTS, 4);
const DEFAULT_RETRY_DELAY_MS = parsePositiveInteger(process.env.EVOLINK_RETRY_BASE_DELAY_MS, 15_000);
const TRANSIENT_ERROR_RE = /service\s+busy|allocating\s+resources|try\s+later|temporar(?:y|ily)|timeout|timed?\s*out|rate\s*limit|too\s+many\s+requests|capacity|overloaded|503|502|504|524/i;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve which API key to use for a single call.
 * - If the caller passed a key (selected by KeyPool.run), use it.
 * - Otherwise fall back to EVOLINK_API_KEY for legacy single-key setups
 *   and direct callers that bypass the limiter.
 */
function resolveApiKey(apiKey) {
  if (apiKey) return apiKey;
  const single = process.env.EVOLINK_API_KEY;
  if (single) return single;
  // KeyPool callers should always pass a key; this branch only fires when
  // someone calls submitGeneration / pollTask directly without env or pool.
  throw new Error('No EvoLink API key available — set EVOLINK_API_KEY or pass one explicitly');
}

/**
 * Which EvoLink endpoint a model id lives on. Callers that know (the loose
 * surface reads it from the catalog) pass it explicitly; legacy callers
 * fall back to the name heuristic. Kling "image-to-video" ids are VIDEO
 * models, so the heuristic checks for "video" first.
 */
export function endpointFor(model, kind) {
  if (kind === 'videos' || kind === 'images' || kind === 'audios') return kind;
  if (model.includes('video')) return 'videos';
  if (/gemini|flux|nano|gpt-image|seedream|z-image/.test(model)) return 'images';
  if (/audio|suno/.test(model)) return 'audios';
  return 'videos';
}

function buildEvoLinkError(message, { transient = false } = {}) {
  const err = new Error(message);
  err.transient = transient || isTransientEvoLinkError(err);
  return err;
}

export function isTransientEvoLinkError(err) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return TRANSIENT_ERROR_RE.test(message) || Boolean(err?.transient);
}

/**
 * Submit a video generation job.
 *
 * @param {string} model - e.g. 'kling-v3-text-to-video'
 * @param {Object} params - { prompt, duration, aspect_ratio, image_url?, ... }
 * @returns {Promise<{id: string, status: string}>}
 */
export async function submitGeneration(model, params, apiKey, endpointKind) {
  const endpoint = `${BASE_URL}/${endpointFor(model, endpointKind)}/generations`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolveApiKey(apiKey)}`,
    },
    body: JSON.stringify({ model, ...params }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw buildEvoLinkError(
      `EvoLink submit error ${response.status}: ${errorBody}`,
      { transient: response.status === 408 || response.status === 429 || response.status >= 500 },
    );
  }

  return response.json();
}

/**
 * Poll a task until it completes or fails.
 *
 * @param {string} taskId
 * @param {number} [timeoutMs]
 * @returns {Promise<Object>} The completed task object
 */
export async function pollTask(taskId, timeoutMs = TIMEOUT_MS, apiKey) {
  const deadline = Date.now() + timeoutMs;
  apiKey = resolveApiKey(apiKey);

  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      // Transient errors (5xx, Cloudflare 524) — retry instead of failing
      if (response.status >= 500) {
        console.warn(`EvoLink poll transient error ${response.status}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      throw buildEvoLinkError(
        `EvoLink poll error: ${response.status}`,
        { transient: response.status === 408 || response.status === 429 || response.status >= 500 },
      );
    }

    const task = await response.json();

    if (task.status === 'completed') return task;
    if (task.status === 'failed' || task.status === 'cancelled') {
      const message = task.error?.message ?? JSON.stringify(task.error) ?? task.status;
      throw buildEvoLinkError(`EvoLink task ${task.status}: ${message}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // NOT transient on purpose: the provider is still rendering (and will
  // bill) this task. A retry would submit a second one and pay twice.
  const err = new Error(`EvoLink task ${taskId} still running after ${Math.round(timeoutMs / 60_000)} min`);
  err.transient = false;
  err.code = 'PROVIDER_TIMEOUT';
  throw err;
}

/**
 * Download a file from a URL to a local path.
 */
export async function downloadFile(url, outputPath) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`Failed to download from EvoLink: HTTP ${response.status}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 5) {
          throw lastError;
        }
      } else {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(outputPath, buffer);
        return;
      }
    } catch (err) {
      lastError = err;
      if (attempt === 5) throw err;
    }

    await sleep(2_000 * attempt);
  }

  throw lastError;
}

/**
 * Run an EvoLink generation end-to-end: submit → poll → return output asset URL.
 *
 * @param {string} model - EvoLink model ID
 * @param {Object} params - Generation parameters
 * @returns {Promise<string>} The generated image or video URL
 */
export async function runGeneration(model, params, options = {}) {
  const r = await runGenerationDetailed(model, params, options);
  return r.url;
}

/**
 * Same as runGeneration, returning every output URL and the finished task
 * (its `usage` is what the provider billed; the loose surface records it).
 * @returns {Promise<{ url: string, urls: string[], task: object }>}
 */
export async function runGenerationDetailed(model, params, options = {}) {
  return evolinkLimiter.run((apiKey) => runGenerationInner(model, params, options, apiKey));
}

/** Every output URL of a completed task, in order. Exported for tests. */
export function extractAssetUrls(completed) {
  if (Array.isArray(completed.results) && completed.results.length) {
    return completed.results.map((r) => (typeof r === 'string' ? r : r?.url ?? r?.video_url ?? r?.image_url ?? r?.audio_url)).filter(Boolean);
  }
  const one = completed.image_url
    ?? completed.video_url
    ?? completed.audio_url
    ?? completed.result?.image_url
    ?? completed.result?.video_url
    ?? completed.output?.image_url
    ?? completed.output?.video_url;
  return one ? [one] : [];
}

async function runGenerationInner(model, params, options = {}, apiKey) {
  const attempts = parsePositiveInteger(options.attempts, DEFAULT_GENERATION_ATTEMPTS);
  const retryDelayMs = parsePositiveInteger(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const submission = await submitGeneration(model, params, apiKey, options.endpoint);

      const taskId = submission.id;
      if (!taskId) {
        throw new Error('EvoLink submission missing task ID');
      }

      console.log(`    EvoLink task: ${taskId}, polling...`);
      const completed = await pollTask(taskId, options.timeoutMs, apiKey);

      const urls = extractAssetUrls(completed);
      if (!urls.length) {
        throw new Error(`EvoLink task completed but no asset URL found in response: ${JSON.stringify(completed).substring(0, 200)}`);
      }

      return { url: urls[0], urls, task: completed };
    } catch (err) {
      lastError = err;
      if (!isTransientEvoLinkError(err) || attempt >= attempts) {
        throw err;
      }
      const waitMs = retryDelayMs * attempt;
      console.warn(`    EvoLink transient failure on attempt ${attempt}/${attempts}: ${err.message}. Retrying in ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}
