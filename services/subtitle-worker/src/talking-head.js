// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Talking Head — Generates lip-synced avatar videos via Creatify Aurora on fal.ai.
 *
 * Takes a face photo + audio clip and produces a portrait video
 * with high-quality lip-sync and natural body movement.
 * Uses the fal.ai queue API (submit -> poll -> download).
 *
 * Model: fal-ai/creatify/aurora
 * Pricing: $0.14/second (720p)
 * Audio: supports speaking and singing
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FAL_API_KEY = () => process.env.FAL_API_KEY;
const MODEL_ID = 'fal-ai/creatify/aurora';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 600_000; // 10 minutes per clip

/**
 * Submit a talking head generation request to fal.ai queue.
 *
 * @param {string} imageUrl - Public URL of the face photo
 * @param {string} audioUrl - Public URL of the per-scene audio
 * @returns {Promise<{requestId: string, statusUrl: string, responseUrl: string}>}
 */
async function submitTalkingHead(imageUrl, audioUrl) {
  const url = `https://queue.fal.run/${MODEL_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_API_KEY()}`,
    },
    body: JSON.stringify({
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: 'Natural speaking, slight head movements, professional studio lighting, high quality',
      guidance_scale: 1,
      audio_guidance_scale: 3,
      resolution: '720p',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`Creatify Aurora queue error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();

  if (!result.request_id) {
    throw new Error('Creatify Aurora did not return a request_id');
  }

  return {
    requestId: result.request_id,
    statusUrl: result.status_url,
    responseUrl: result.response_url,
  };
}

/**
 * Poll fal.ai for talking head job completion.
 *
 * @param {string} statusUrl - URL to poll for status
 * @param {string} responseUrl - URL to fetch final result
 * @param {number} timeoutMs - Maximum time to wait
 * @returns {Promise<string>} URL of the generated video
 */
async function pollForCompletion(statusUrl, responseUrl, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${FAL_API_KEY()}` },
    });

    if (!statusRes.ok) {
      throw new Error(`Talking head status check failed: ${statusRes.status}`);
    }

    const status = await statusRes.json();

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${FAL_API_KEY()}` },
      });

      if (!resultRes.ok) {
        const errBody = await resultRes.text().catch(() => 'unknown');
        throw new Error(`Talking head result fetch failed: ${resultRes.status} — ${errBody}`);
      }

      const result = await resultRes.json();
      const videoUrl = result.video?.url;

      if (!videoUrl) {
        throw new Error('Talking head result missing video URL');
      }

      return videoUrl;
    }

    if (status.status === 'FAILED') {
      throw new Error(`Talking head generation failed: ${status.error ?? 'unknown'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Talking head generation timed out after ${timeoutMs / 1000}s`);
}

/**
 * Download a video from a URL to a local file.
 *
 * @param {string} videoUrl - URL to download
 * @param {string} outputPath - Local file path
 * @returns {Promise<void>}
 */
async function downloadVideo(videoUrl, outputPath) {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download talking head video: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Generate talking head clips for all talking_head scenes in parallel.
 *
 * @param {Array<{index: number, audioUrl: string, audioDuration: number}>} scenes
 *   Each scene needs an audioUrl (public URL) and audioDuration (seconds)
 * @param {string} facePhotoUrl - Public URL of the persona face photo
 * @param {string} workDir - Temp directory for output files
 * @returns {Promise<Map<number, string>>} Map of scene index -> local clip path
 */
export async function generateTalkingHeadClips(scenes, facePhotoUrl, workDir) {
  if (!FAL_API_KEY()) {
    throw new Error('FAL_API_KEY environment variable is not set');
  }

  console.log(`Generating ${scenes.length} talking head clips via Creatify Aurora...`);

  const results = await Promise.allSettled(
    scenes.map(async (scene) => {
      const outputPath = join(workDir, `talking-head-${scene.index}.mp4`);

      console.log(`  [talking-head-${scene.index}] Submitting (audio: ${scene.audioDuration.toFixed(1)}s)...`);

      const { statusUrl, responseUrl } = await submitTalkingHead(
        facePhotoUrl,
        scene.audioUrl,
      );

      console.log(`  [talking-head-${scene.index}] Queued, polling...`);

      const videoUrl = await pollForCompletion(statusUrl, responseUrl);

      console.log(`  [talking-head-${scene.index}] Downloading...`);

      await downloadVideo(videoUrl, outputPath);

      console.log(`  [talking-head-${scene.index}] Done`);

      return { index: scene.index, path: outputPath };
    }),
  );

  const clipMap = new Map();
  const failures = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      clipMap.set(result.value.index, result.value.path);
    } else {
      failures.push(result.reason?.message ?? 'unknown error');
    }
  }

  if (clipMap.size === 0) {
    throw new Error(`All talking head generations failed:\n${failures.join('\n')}`);
  }

  if (failures.length > 0) {
    console.warn(`Warning: ${failures.length} talking head clip(s) failed:\n${failures.join('\n')}`);
  }

  return clipMap;
}
