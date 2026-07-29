// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Replicate Client — Shared API helpers for calling Replicate models.
 *
 * Uses the official models API (no version hash needed):
 *   POST /v1/models/{owner}/{name}/predictions
 *
 * Handles: submit → poll → get output URL.
 */

import { writeFile } from 'node:fs/promises';
import { replicateLimiter } from './provider-limiter.js';

const BASE_URL = 'https://api.replicate.com/v1';

function resolveToken(token) {
  if (token) return token;
  const single = process.env.REPLICATE_API_TOKEN;
  if (single) return single;
  throw new Error('No Replicate API token available — set REPLICATE_API_TOKEN or pass one explicitly');
}
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 900_000; // 15 min — kling-v3 can take ~12 min on Replicate

/**
 * Submit a prediction to a Replicate model.
 *
 * @param {string} modelOwner - e.g. 'bytedance'
 * @param {string} modelName - e.g. 'omni-human'
 * @param {Object} input - Model input parameters
 * @returns {Promise<{id: string, status: string, urls: {get: string}}>}
 */
export async function submitPrediction(modelOwner, modelName, input, apiKey) {
  const token = resolveToken(apiKey);
  const url = `${BASE_URL}/models/${modelOwner}/${modelName}/predictions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`Replicate submit error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Poll a Replicate prediction until it completes or fails.
 *
 * @param {string} predictionUrl - The prediction GET URL (from submit response)
 * @param {number} [timeoutMs] - Max time to wait
 * @returns {Promise<Object>} The completed prediction object
 */
export async function pollPrediction(predictionUrl, timeoutMs = TIMEOUT_MS, apiKey) {
  const token = resolveToken(apiKey);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(predictionUrl, {
      headers: { Authorization: `Token ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Replicate poll error: ${response.status}`);
    }

    const prediction = await response.json();

    if (prediction.status === 'succeeded') {
      return prediction;
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error ?? 'unknown'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Replicate prediction timed out after ${timeoutMs / 1000}s`);
}

/**
 * Download a file from a URL to a local path.
 *
 * @param {string} url - URL to download
 * @param {string} outputPath - Local file path
 */
export async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from Replicate: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Run a Replicate model end-to-end: submit → poll → return output.
 *
 * @param {string} modelOwner
 * @param {string} modelName
 * @param {Object} input
 * @returns {Promise<any>} The prediction output (usually a URL or array of URLs)
 */
export async function runModel(modelOwner, modelName, input) {
  return replicateLimiter.run((apiKey) => runModelInner(modelOwner, modelName, input, apiKey));
}

async function runModelInner(modelOwner, modelName, input, apiKey) {
  const prediction = await submitPrediction(modelOwner, modelName, input, apiKey);

  const pollUrl = prediction.urls?.get;
  if (!pollUrl) {
    throw new Error('Replicate prediction missing poll URL');
  }

  const completed = await pollPrediction(pollUrl, TIMEOUT_MS, apiKey);
  return completed.output;
}
