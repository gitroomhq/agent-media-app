// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Talking Head — Generates lip-synced avatar videos.
 *
 * Two providers:
 *
 *   1. "kling" (default) — Official Kling API, two-step:
 *      /v1/videos/image2video → /v1/videos/lip-sync
 *      Requires: KLING_ACCESS_KEY, KLING_SECRET_KEY
 *      Needs: TTS audio URLs (lip-sync to audio)
 *
 *   2. "replicate" — Replicate one-shot via kling-v3-omni-video:
 *      face photo + prompt → video with native voice + lip-sync
 *      Requires: REPLICATE_API_TOKEN
 *      Does NOT need TTS audio (generates its own voice)
 *      Note: uses omni-video (kling-v3-video has recurring Replicate infra issues)
 */

import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { runModel, downloadFile as replicateDownload } from './replicate-client.js';
import { runGeneration, downloadFile as evolinkDownload, isTransientEvoLinkError } from './evolink-client.js';

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

async function downloadFile(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Estimate clip duration from text at natural speaking pace (~2.5 words/sec).
 * Clamped to 5-10s per scene (individual clips, not full video).
 */
function estimateDuration(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const estimated = Math.round(words / 2.5);
  return Math.max(5, Math.min(10, estimated));
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider 1: Official Kling API (image2video + lip-sync)
// ═══════════════════════════════════════════════════════════════════════════

const KLING_BASE = 'https://api-singapore.klingai.com';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 900_000; // 15 min — Replicate kling-v3 can take ~12 min

function generateKlingJWT() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables are required');
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: accessKey, iat: now - 5, nbf: now - 5, exp: now + 1800 }, secretKey, { algorithm: 'HS256' });
}

async function klingFetch(path, options = {}) {
  const token = generateKlingJWT();
  const res = await fetch(`${KLING_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    const msg = json.message || json.error || `HTTP ${res.status}`;
    throw new Error(`Kling API ${path} failed: ${msg} (code ${json.code ?? res.status})`);
  }
  return json.data;
}

async function pollKlingTask(pollPath, label) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const data = await klingFetch(pollPath);
    if (data?.task_status === 'succeed') return data;
    if (data?.task_status === 'failed') throw new Error(`${label} failed: ${data?.task_status_msg || 'unknown'}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`${label} timed out after ${TIMEOUT_MS / 1000}s`);
}

async function klingGenerateBaseVideo(facePhotoUrl) {
  const data = await klingFetch('/v1/videos/image2video', {
    method: 'POST',
    body: JSON.stringify({
      model_name: 'kling-v2-master',
      image: facePhotoUrl,
      prompt: 'A person speaking directly to camera with natural head movements, subtle hand gestures, and expressive facial expressions. Casual TikTok-style setting, authentic energy.',
      duration: '5',
      mode: 'pro',
      aspect_ratio: '9:16',
    }),
  });
  const taskId = data?.task_id;
  if (!taskId) throw new Error('image2video returned no task_id');
  console.log(`    image2video task: ${taskId}, polling...`);
  const result = await pollKlingTask(`/v1/videos/image2video/${taskId}`, 'image2video');
  const videoUrl = result?.task_result?.videos?.[0]?.url;
  if (!videoUrl) throw new Error('image2video succeeded but no video URL');
  return videoUrl;
}

async function klingLipSync(videoUrl, audioUrl) {
  const data = await klingFetch('/v1/videos/lip-sync', {
    method: 'POST',
    body: JSON.stringify({
      input: { video_url: videoUrl, mode: 'audio2video', audio_type: 'url', audio_url: audioUrl },
    }),
  });
  const taskId = data?.task_id;
  if (!taskId) throw new Error('lip-sync returned no task_id');
  console.log(`    lip-sync task: ${taskId}, polling...`);
  const result = await pollKlingTask(`/v1/videos/lip-sync/${taskId}`, 'lip-sync');
  const finalUrl = result?.task_result?.videos?.[0]?.url;
  if (!finalUrl) throw new Error('lip-sync succeeded but no video URL');
  return finalUrl;
}

async function generateSceneKling(scene, facePhotoUrl, audioUrl, workDir) {
  const outputPath = join(workDir, `talking-head-${scene.index}.mp4`);

  console.log(`  [talking-head-${scene.index}] Step 1: generating base video from face photo...`);
  const videoUrl = await klingGenerateBaseVideo(facePhotoUrl);

  console.log(`  [talking-head-${scene.index}] Step 2: lip-syncing to TTS audio...`);
  const finalUrl = await klingLipSync(videoUrl, audioUrl);

  console.log(`  [talking-head-${scene.index}] Downloading final clip...`);
  await downloadFile(finalUrl, outputPath);

  console.log(`  [talking-head-${scene.index}] Done`);
  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider 2: Replicate (kling-v3-omni-video, one-shot with native audio + lip-sync)
// ═══════════════════════════════════════════════════════════════════════════

async function generateSceneReplicate(scene, facePhotoUrl, workDir) {
  const outputPath = join(workDir, `talking-head-${scene.index}.mp4`);
  const duration = scene.duration || estimateDuration(scene.text);

  console.log(`  [talking-head-${scene.index}] Submitting to Replicate (kling-v3-omni-video, duration: ${duration}s)...`);

  const output = await runModel('kwaivgi', 'kling-v3-omni-video', {
    start_image: facePhotoUrl,
    prompt: `A person speaking directly to camera in a casual TikTok-style setting, saying: "${scene.text}". Natural head movements, hand gestures, expressive face, authentic energy.`,
    duration,
    aspect_ratio: '9:16',
    mode: 'pro',
    generate_audio: true,
  });

  const videoUrl = Array.isArray(output) ? output[0] : output;
  if (!videoUrl) throw new Error(`Replicate returned no output for scene ${scene.index}`);

  console.log(`  [talking-head-${scene.index}] Downloading output...`);
  await replicateDownload(videoUrl, outputPath);

  console.log(`  [talking-head-${scene.index}] Done`);
  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider 3: EvoLink (Kling v3/O3 via EvoLink API, ~55% cheaper)
// ═══════════════════════════════════════════════════════════════════════════

async function generateSceneEvoLink(scene, facePhotoUrl, workDir, { sound = 'on' } = {}) {
  const outputPath = join(workDir, `talking-head-${scene.index}.mp4`);
  const duration = scene.duration || estimateDuration(scene.text);

  console.log(`  [talking-head-${scene.index}] Submitting to EvoLink (kling-o3-image-to-video, duration: ${duration}s, sound: ${sound})...`);

  const videoUrl = await runGeneration('kling-o3-image-to-video', {
    prompt: `A person speaking directly to camera in a casual TikTok-style setting, saying: "${scene.text}". Natural head movements, hand gestures, expressive face, authentic energy.`,
    image_start: facePhotoUrl,
    duration,
    aspect_ratio: '9:16',
    sound,
  });

  if (!videoUrl) throw new Error(`EvoLink returned no output for scene ${scene.index}`);

  console.log(`  [talking-head-${scene.index}] Downloading output...`);
  await evolinkDownload(videoUrl, outputPath);

  console.log(`  [talking-head-${scene.index}] Done`);
  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate talking head clips for all talking_head scenes in parallel.
 *
 * @param {Array<{index: number, text: string}>} scenes
 * @param {string} facePhotoUrl - Public URL of the persona face photo
 * @param {string[]|null} sceneAudioUrls - Public URLs of TTS audio per scene (required for 'kling' provider)
 * @param {string} workDir - Temp directory for output files
 * @param {string} [provider='kling'] - 'kling' (official API) or 'replicate' (one-shot)
 * @param {Object} [options]
 * @param {string} [options.sound='on'] - Sound mode for EvoLink: 'on' (native audio) or 'off' (silent, use TTS)
 * @returns {Promise<Map<number, string>>} Map of scene index -> local clip path
 */
export async function generateTalkingHeadClips(
  scenes,
  facePhotoUrl,
  sceneAudioUrls,
  workDir,
  provider = 'kling',
  { sound = 'on' } = {},
) {
  const useReplicate = provider === 'replicate';
  const useEvoLink = provider === 'evolink';

  if (useEvoLink) {
    if (!process.env.EVOLINK_API_KEY) {
      throw new Error('EVOLINK_API_KEY environment variable is not set');
    }
    const fallbackLabel = process.env.REPLICATE_API_TOKEN ? ' with Replicate fallback' : '';
    console.log(`Generating ${scenes.length} talking head clips via EvoLink (kling-v3-image-to-video)${fallbackLabel}...`);
  } else if (useReplicate) {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN environment variable is not set');
    }
    console.log(`Generating ${scenes.length} talking head clips via Replicate (kling-v3-omni-video, native audio)...`);
  } else {
    if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
      throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY environment variables are required');
    }
    console.log(`Generating ${scenes.length} talking head clips via Kling API (image2video + lip-sync)...`);
  }

  const results = await Promise.allSettled(
    scenes.map(async (scene) => {
      let path;
      if (useEvoLink) {
        try {
          path = await generateSceneEvoLink(scene, facePhotoUrl, workDir, { sound });
        } catch (err) {
          if (!process.env.REPLICATE_API_TOKEN || !isTransientEvoLinkError(err)) {
            throw err;
          }
          console.warn(
            `  [talking-head-${scene.index}] EvoLink transient failure after retries; falling back to Replicate: ${err.message}`,
          );
          path = await generateSceneReplicate(scene, facePhotoUrl, workDir);
        }
      } else if (useReplicate) {
        path = await generateSceneReplicate(scene, facePhotoUrl, workDir);
      } else {
        const audioUrl = sceneAudioUrls?.[scene.index];
        if (!audioUrl) throw new Error(`No audio URL for talking head scene ${scene.index}`);
        path = await generateSceneKling(scene, facePhotoUrl, audioUrl, workDir);
      }
      return { index: scene.index, path };
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

  if (failures.length > 0) {
    throw new Error(`${failures.length} talking head clip(s) failed:\n${failures.join('\n')}`);
  }

  return clipMap;
}
