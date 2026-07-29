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
export async function submitGeneration(model, params, apiKey) {
  // Image models use /images/generations, video models use /videos/generations
  // Note: kling models with 'image-to-video' are VIDEO models, not image models
  const isImageModel = !model.includes('video')
    && (
      model.includes('gemini')
      || model.includes('flux')
      || model.includes('nano')
      || model.includes('gpt-image')
    );
  const endpoint = isImageModel ? `${BASE_URL}/images/generations` : `${BASE_URL}/videos/generations`;
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
    if (task.status === 'failed') {
      const message = task.error?.message ?? JSON.stringify(task.error) ?? 'unknown';
      throw buildEvoLinkError(`EvoLink task failed: ${message}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw buildEvoLinkError(`EvoLink task timed out after ${timeoutMs / 1000}s`, { transient: true });
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
  return evolinkLimiter.run((apiKey) => runGenerationInner(model, params, options, apiKey));
}

async function runGenerationInner(model, params, options = {}, apiKey) {
  const attempts = parsePositiveInteger(options.attempts, DEFAULT_GENERATION_ATTEMPTS);
  const retryDelayMs = parsePositiveInteger(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const submission = await submitGeneration(model, params, apiKey);

      const taskId = submission.id;
      if (!taskId) {
        throw new Error('EvoLink submission missing task ID');
      }

      console.log(`    EvoLink task: ${taskId}, polling...`);
      const completed = await pollTask(taskId, options.timeoutMs, apiKey);

      // Extract generated asset URL — EvoLink returns results as an array for both image and video tasks.
      const assetUrl = completed.results?.[0]
        ?? completed.image_url
        ?? completed.video_url
        ?? completed.result?.image_url
        ?? completed.result?.video_url
        ?? completed.output?.image_url
        ?? completed.output?.video_url;

      if (!assetUrl) {
        throw new Error(`EvoLink task completed but no asset URL found in response: ${JSON.stringify(completed).substring(0, 200)}`);
      }

      return assetUrl;
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
