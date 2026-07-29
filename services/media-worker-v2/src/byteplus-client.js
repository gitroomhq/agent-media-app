// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * BytePlus ModelArk Client — direct API for Seedance 2.0 fast variant.
 *
 * Cheaper + faster than EvoLink's standard Seedance 2.0. Uses the
 * Volcano Engine ARK platform (BytePlus international tenant).
 *
 * API:
 *   POST /contents/generations/tasks   → submit task, returns { id }
 *   GET  /contents/generations/tasks/{id} → poll status
 *
 * Models we use:
 *   dreamina-seedance-2-0-fast-260128   (reference-to-video, fast)
 *
 * Auth: Authorization: Bearer $ARK_API_KEY
 *
 * Request body shape (verified from BytePlus quickstart curl):
 *   {
 *     model: "dreamina-seedance-2-0-fast-260128",
 *     content: [
 *       { type: "text", text: "<prompt>" },
 *       { type: "image_url", image_url: { url: "..." }, role: "reference_image" },
 *       ...
 *     ],
 *     generate_audio: true,
 *     ratio: "9:16",          // not "aspect_ratio"
 *     duration: 10,
 *     watermark: false,
 *   }
 *
 * Response shape from create / poll: not officially documented (SPA
 * docs site), so this client logs raw responses + tries multiple
 * common ARK field names when extracting the video URL.
 */

import { writeFile } from 'node:fs/promises';

const BASE_URL = process.env.BYTEPLUS_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 1_800_000; // 30 min — Seedance 2.0 fast typically ~1-3 min

const TRANSIENT_ERROR_RE = /service\s+busy|temporar(?:y|ily)|timeout|timed?\s*out|rate\s*limit|too\s+many\s+requests|capacity|overloaded|503|502|504|524/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveApiKey(apiKey) {
  if (apiKey) return apiKey;
  const single = process.env.ARK_API_KEY;
  if (single) return single;
  throw new Error('No BytePlus ARK API key — set ARK_API_KEY or pass one explicitly');
}

function isTransient(err) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return TRANSIENT_ERROR_RE.test(message) || Boolean(err?.transient);
}

/**
 * Build the `content[]` array from our flat call shape.
 *
 * @param {string} prompt - The scene/action description.
 * @param {string[]} imageUrls - Reference images. Each becomes a
 *   `{ type:'image_url', image_url: { url }, role:'reference_image' }`.
 * @returns {Array<object>}
 */
function buildContent(prompt, imageUrls) {
  const parts = [{ type: 'text', text: prompt }];
  for (const url of imageUrls ?? []) {
    if (typeof url !== 'string' || url.length === 0) continue;
    parts.push({
      type: 'image_url',
      image_url: { url },
      role: 'reference_image',
    });
  }
  return parts;
}

/**
 * POST /contents/generations/tasks — returns { id, ... }.
 */
export async function submitVideoTask(model, params, apiKey) {
  const key = resolveApiKey(apiKey);
  const body = {
    model,
    content: buildContent(params.prompt, params.image_urls),
    generate_audio: params.generate_audio ?? true,
    ratio: params.ratio ?? params.aspect_ratio ?? '9:16',
    duration: Number(params.duration ?? 10),
    watermark: params.watermark ?? false,
  };

  const response = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    const err = new Error(`BytePlus submit error ${response.status}: ${errText}`);
    err.transient = response.status === 408 || response.status === 429 || response.status >= 500;
    throw err;
  }

  const json = await response.json();
  if (!json.id) {
    throw new Error(`BytePlus submit returned no task id: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

/**
 * GET /contents/generations/tasks/{id} — poll until done.
 *
 * Status field values per ARK convention: queued, running, succeeded,
 * failed (or sometimes 'completed'). We accept all common variants.
 *
 * Video URL location varies between models — try multiple paths.
 */
export async function pollVideoTask(taskId, options = {}) {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const apiKey = resolveApiKey(options.apiKey);
  const deadline = Date.now() + timeoutMs;
  let lastTask = null;

  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      if (response.status >= 500) {
        console.warn(`[byteplus] poll transient ${response.status}, retrying...`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      const errText = await response.text().catch(() => 'unknown');
      const err = new Error(`BytePlus poll error ${response.status}: ${errText}`);
      err.transient = response.status === 408 || response.status === 429;
      throw err;
    }

    const task = await response.json();
    lastTask = task;
    const status = String(task.status ?? '').toLowerCase();

    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      return task;
    }
    if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
      const message =
        task.error?.message
        ?? task.error_message
        ?? task.failure_reason
        ?? JSON.stringify(task).slice(0, 300);
      throw new Error(`BytePlus task ${taskId} ${status}: ${message}`);
    }
    // queued | running | pending | processing — keep polling

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`BytePlus task ${taskId} timed out after ${timeoutMs / 1000}s. last=${JSON.stringify(lastTask).slice(0, 300)}`);
}

/**
 * Best-effort video URL extraction. ARK doesn't publish the response
 * shape; we walk the most common locations and fall back to a deep
 * search for the first plausible https URL ending in .mp4.
 */
export function extractVideoUrl(task) {
  const direct =
    task?.content?.video_url
    ?? task?.video_url
    ?? task?.result?.video_url
    ?? task?.output?.video_url
    ?? task?.data?.video_url
    ?? task?.results?.[0]?.video_url
    ?? task?.results?.[0]?.url
    ?? null;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  // Walk the object tree for any string that looks like a video URL.
  const seen = new Set();
  const queue = [task];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const value of Object.values(node)) {
      if (typeof value === 'string' && /^https?:\/\//.test(value) && /\.mp4(\?|$)/i.test(value)) {
        return value;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return null;
}

/**
 * Submit + poll + return the video URL. Mirrors the
 * `runGeneration(model, params)` shape used by evolink-client so the
 * pipeline can switch providers via a single env flag.
 *
 * @param {string} model - e.g. 'dreamina-seedance-2-0-fast-260128'
 * @param {Object} params - { prompt, image_urls[], duration, aspect_ratio, generate_audio }
 * @param {Object} [options] - { timeoutMs, apiKey }
 * @returns {Promise<string>} Public video URL
 */
export async function runVideoGeneration(model, params, options = {}) {
  const submission = await submitVideoTask(model, params, options.apiKey);
  const taskId = submission.id;
  console.log(`    BytePlus task: ${taskId}, polling...`);
  const completed = await pollVideoTask(taskId, options);
  const videoUrl = extractVideoUrl(completed);
  if (!videoUrl) {
    throw new Error(
      `BytePlus task ${taskId} succeeded but no video URL found. Raw: ${JSON.stringify(completed).slice(0, 600)}`,
    );
  }
  return videoUrl;
}

/**
 * Download a file from a URL to a local path. Same retry semantics as
 * the EvoLink helper (5 attempts, exponential backoff).
 */
export async function downloadFile(url, outputPath) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        lastError = new Error(`BytePlus download HTTP ${response.status}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 5) throw lastError;
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

export const BYTEPLUS_MODELS = {
  SEEDANCE_2_0_FAST: 'dreamina-seedance-2-0-fast-260128',
};
