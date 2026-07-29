// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Video Gen — Generates B-roll video clips via fal.ai queue API.
 *
 * Models:
 * - Veo 3.1 Fast: High-quality text-to-video with native 9:16 support
 * - Veo 3.1 Reference-to-Video: Face-consistent B-roll via reference images
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FAL_API_KEY = () => process.env.FAL_API_KEY;

const VEO31_FAST = 'fal-ai/veo3.1/fast';
const VEO31_REF = 'fal-ai/veo3.1/reference-to-video';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 600_000; // 10 minutes per clip

/**
 * Build request body for the chosen model.
 */
function buildRequestBody(prompt, model, facePhotoUrl, duration, aspectRatio = '9:16') {
  if (model === VEO31_REF && facePhotoUrl) {
    // Reference-to-video only supports "8s"
    return {
      prompt,
      image_urls: [facePhotoUrl],
      aspect_ratio: aspectRatio,
      duration: '8s',
      resolution: '720p',
      generate_audio: false,
      negative_prompt: 'blur, distort, low quality, ugly, deformed',
    };
  }

  // Veo 3.1 Fast text-to-video supports "4s", "6s", "8s"
  const secs = parseInt(duration) || 5;
  const veoDuration = secs <= 4 ? '4s' : secs <= 6 ? '6s' : '8s';

  return {
    prompt,
    aspect_ratio: aspectRatio,
    duration: veoDuration,
    resolution: '720p',
    generate_audio: false,
    negative_prompt: 'blur, distort, low quality, ugly, deformed',
  };
}

/**
 * Submit a B-roll generation request to fal.ai queue.
 */
async function submitToQueue(prompt, model, facePhotoUrl = null, duration = '5', aspectRatio = '9:16') {
  const url = `https://queue.fal.run/${model}`;
  const body = buildRequestBody(prompt, model, facePhotoUrl, duration, aspectRatio);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${FAL_API_KEY()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`fal.ai queue API error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();

  if (!result.request_id) {
    throw new Error('fal.ai did not return a request_id');
  }

  return {
    requestId: result.request_id,
    statusUrl: result.status_url,
    responseUrl: result.response_url,
  };
}

/**
 * Poll fal.ai for job completion.
 */
async function pollForCompletion(statusUrl, responseUrl, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${FAL_API_KEY()}` },
    });

    if (!statusRes.ok) {
      throw new Error(`fal.ai status check failed: ${statusRes.status}`);
    }

    const status = await statusRes.json();

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${FAL_API_KEY()}` },
      });

      if (!resultRes.ok) {
        const errBody = await resultRes.text().catch(() => 'unknown');
        throw new Error(`fal.ai result fetch failed: ${resultRes.status} — ${errBody}`);
      }

      const result = await resultRes.json();
      const videoUrl = result.video?.url;

      if (!videoUrl) {
        throw new Error('fal.ai result missing video URL');
      }

      return videoUrl;
    }

    if (status.status === 'FAILED') {
      throw new Error(`fal.ai generation failed: ${status.error ?? 'unknown'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`fal.ai generation timed out after ${timeoutMs / 1000}s`);
}

/**
 * Download a video from a URL to a local file.
 */
async function downloadVideo(videoUrl, outputPath) {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Generate B-roll clips for scenes in parallel.
 * Auto-selects Veo 3.1 Reference-to-Video when face photo is provided,
 * otherwise uses Veo 3.1 Fast.
 *
 * @param {Array<{index: number, visualPrompt: string}>} scenes
 * @param {string} model - Ignored (kept for API compat), always uses Veo 3.1
 * @param {string} workDir - Temporary directory for output files
 * @param {string|null} facePhotoUrl - Optional face photo URL
 * @param {string} [aspectRatio='9:16'] - Video aspect ratio
 * @returns {Promise<Map<number, string>>} Map of scene index -> local clip path
 */
export async function generateBrollClips(scenes, model = VEO31_FAST, workDir, facePhotoUrl = null, aspectRatio = '9:16') {
  if (!FAL_API_KEY()) {
    throw new Error('FAL_API_KEY environment variable is not set');
  }

  const effectiveModel = facePhotoUrl ? VEO31_REF : VEO31_FAST;

  console.log(`Generating ${scenes.length} B-roll clips via fal.ai (${effectiveModel})...`);

  const results = await Promise.allSettled(
    scenes.map(async (scene) => {
      const outputPath = join(workDir, `broll-${scene.index}.mp4`);

      console.log(`  [broll-${scene.index}] Submitting: "${scene.visualPrompt.substring(0, 60)}..."`);

      const { statusUrl, responseUrl } = await submitToQueue(
        scene.visualPrompt,
        effectiveModel,
        facePhotoUrl,
        '5',
        aspectRatio,
      );

      console.log(`  [broll-${scene.index}] Queued, polling for completion...`);

      const videoUrl = await pollForCompletion(statusUrl, responseUrl);

      console.log(`  [broll-${scene.index}] Downloading clip...`);

      await downloadVideo(videoUrl, outputPath);

      console.log(`  [broll-${scene.index}] Done`);

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
    throw new Error(`All B-roll generations failed:\n${failures.join('\n')}`);
  }

  if (failures.length > 0) {
    console.warn(`Warning: ${failures.length} B-roll clip(s) failed:\n${failures.join('\n')}`);
  }

  return clipMap;
}
