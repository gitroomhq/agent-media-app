// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Dubbing — Re-dub a video into a target language via ElevenLabs Dubbing API.
 *
 * Flow:
 *   1. POST /v1/dubbing with the video URL + source/target language
 *   2. Poll GET /v1/dubbing/{dubbing_id} until status = 'dubbed'
 *   3. Download dubbed audio from GET /v1/dubbing/{dubbing_id}/audio/{target_lang}
 *   4. Mux audio back onto the original video with FFmpeg
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ELEVENLABS_API_KEY = () => process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

const POLL_INTERVAL_MS = 8_000;
const TIMEOUT_MS = 900_000; // 15 minutes

/**
 * Dub a video file into the target language using ElevenLabs Dubbing API.
 *
 * @param {string} videoPath - Local path to the assembled video
 * @param {string} targetLanguage - BCP-47 language code (e.g., 'es', 'fr', 'de', 'pt')
 * @param {string} workDir - Temp directory for intermediate files
 * @param {string} jobId - Job ID for logging
 * @returns {Promise<string>} Path to the dubbed video file
 */
export async function dubVideo(videoPath, targetLanguage, workDir, jobId) {
  const apiKey = ELEVENLABS_API_KEY();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured for dubbing');
  }

  console.log(`[${jobId}] Starting ElevenLabs dubbing to language: ${targetLanguage}`);

  // ── Step 1: Submit dubbing job ──────────────────────────────────────────
  const { createReadStream } = await import('node:fs');
  const { FormData, Blob } = globalThis;

  const formData = new FormData();
  formData.append('target_lang', targetLanguage);
  formData.append('mode', 'automatic');
  formData.append('watermark', 'false');
  formData.append('highest_resolution', 'true');

  // Read video file and append as blob
  const { readFile } = await import('node:fs/promises');
  const videoBuffer = await readFile(videoPath);
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  formData.append('file', videoBlob, 'input.mp4');

  const submitRes = await fetch(`${ELEVENLABS_BASE}/v1/dubbing`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs dubbing submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const dubbingId = submitData.dubbing_id;
  const expectedDuration = submitData.expected_duration_sec ?? 60;

  if (!dubbingId) {
    throw new Error('ElevenLabs did not return a dubbing_id');
  }

  console.log(`[${jobId}] Dubbing job submitted: ${dubbingId} (expected ${expectedDuration}s)`);

  // ── Step 2: Poll until complete ─────────────────────────────────────────
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${ELEVENLABS_BASE}/v1/dubbing/${dubbingId}`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!statusRes.ok) {
      console.warn(`[${jobId}] Dubbing status check failed: ${statusRes.status}`);
      continue;
    }

    const statusData = await statusRes.json();
    console.log(`[${jobId}] Dubbing status: ${statusData.status}`);

    if (statusData.status === 'dubbed') {
      break;
    }

    if (statusData.status === 'failed') {
      throw new Error(`ElevenLabs dubbing failed: ${statusData.error ?? 'unknown error'}`);
    }
  }

  // ── Step 3: Download dubbed audio ───────────────────────────────────────
  console.log(`[${jobId}] Downloading dubbed audio for language: ${targetLanguage}`);

  const audioRes = await fetch(
    `${ELEVENLABS_BASE}/v1/dubbing/${dubbingId}/audio/${targetLanguage}`,
    { headers: { 'xi-api-key': apiKey } },
  );

  if (!audioRes.ok) {
    const errText = await audioRes.text().catch(() => 'unknown');
    throw new Error(`Failed to download dubbed audio (${audioRes.status}): ${errText}`);
  }

  const audioPath = join(workDir, `dubbed-audio-${targetLanguage}.mp3`);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  await writeFile(audioPath, audioBuffer);

  console.log(`[${jobId}] Dubbed audio downloaded: ${(audioBuffer.length / 1024).toFixed(0)} KB`);

  // ── Step 4: Mux dubbed audio onto original video ────────────────────────
  const dubbedVideoPath = join(workDir, `dubbed-${targetLanguage}.mp4`);

  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',        // video from original
    '-map', '1:a:0',        // audio from dubbed track
    '-c:v', 'copy',         // copy video stream (no re-encode)
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-y',
    dubbedVideoPath,
  ], { timeout: 120_000 });

  console.log(`[${jobId}] Dubbed video muxed: ${dubbedVideoPath}`);

  return dubbedVideoPath;
}
