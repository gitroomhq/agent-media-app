// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · small HTTP helpers.
 *
 * Lifts the per-pipeline `fetchWithRetries` pattern (copied 4 times
 * across the legacy worker) into one place that the v2 pipelines use.
 * Old pipelines still keep their own copies — touching them violates
 * the "old code stays untouched" rule.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const DEFAULT_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Fetch with retry-on-transient-status. Doesn't throw on the first
 * failure; only after `attempts` is exhausted.
 */
export async function fetchWithRetries(url, options = {}, retry = {}) {
  const attempts = retry.attempts ?? 5;
  const delayMs = retry.delayMs ?? 2000;
  const retryStatuses = new Set(retry.retryStatuses ?? DEFAULT_RETRY_STATUSES);

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!retryStatuses.has(response.status) || attempt === attempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    await sleep(delayMs * attempt);
  }
  throw lastError ?? new Error('fetchWithRetries exhausted with no recorded error');
}

/**
 * Download a URL into a Buffer with retries. Throws on non-2xx.
 */
export async function fetchToBuffer(url, retry = {}) {
  const resp = await fetchWithRetries(url, {}, retry);
  if (!resp.ok) {
    throw new Error(`fetchToBuffer ${url}: HTTP ${resp.status}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}
