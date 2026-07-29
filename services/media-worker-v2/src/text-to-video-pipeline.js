// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Text-to-Video Pipeline — pure prompt mode for batch-row schedules.
 *
 * This is the "Use prompts" flow: the user pastes N prompts as their
 * schedule's rows, and each tick consumes the next row VERBATIM as the
 * full Seedance text. No character sheet, no storyboard, no subtitles —
 * just text → video.
 *
 * Inputs:
 *   - prompt: the user's row text (e.g. "Handcrafted stop-motion aesthetic. …")
 *   - duration / aspect_ratio / generate_audio: passed through to Seedance
 *
 * Pipeline:
 *   1. Seedance 2.0 text-to-video (no image refs)
 *   2. Download MP4 and re-host on R2
 *   3. Return public URL via callback
 *
 * Cost basis: EvoLink Seedance 2.0 720p ≈ $0.199/sec. Same credit
 * pricing as character_video (350/700/1050 for 5/10/15s).
 */

import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { r2Upload } from './r2.js';
import { runGeneration as runEvolinkGeneration } from './evolink-client.js';

const VIDEO_TIMEOUT_MS = parsePositiveInteger(process.env.SEEDANCE_TIMEOUT_MS, 1_500_000);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchWithRetries(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw lastErr ?? new Error('fetch failed');
}

export async function processTextToVideo(params) {
  const {
    job_id,
    user_id,
    prompt,
    duration,
    aspect_ratio,
    generate_audio,
  } = params;

  if (!job_id || !user_id || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('text-to-video: job_id, user_id, and prompt required');
  }

  // Seedance accepts 5 / 10 / 15s only. Clamp to nearest supported.
  const requested = Number(duration ?? 10);
  const clamped = requested <= 5 ? 5 : requested >= 15 ? 15 : 10;
  const ratio = typeof aspect_ratio === 'string' ? aspect_ratio : '9:16';
  const audio = generate_audio !== false;

  const workDir = await mkdtemp(join(tmpdir(), `t2v-${job_id}-`));
  try {
    const model = 'seedance-2.0-text-to-video';
    console.log(`[text-to-video] ${job_id} EvoLink ${model} 720p (${clamped}s, ${ratio})`);
    const seedanceVideoUrl = await runEvolinkGeneration(
      model,
      {
        prompt: prompt.trim(),
        duration: clamped,
        aspect_ratio: ratio,
        generate_audio: audio,
        quality: '720p',
      },
      { timeoutMs: VIDEO_TIMEOUT_MS },
    );
    console.log(`[text-to-video] ${job_id} Seedance returned: ${seedanceVideoUrl}`);

    // Download to a temp file, then push to R2 under the standard layout
    // so the gallery + showcase route find it.
    const resp = await fetchWithRetries(seedanceVideoUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download Seedance output: HTTP ${resp.status}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const tmpPath = join(workDir, 'seedance.mp4');
    await writeFile(tmpPath, buffer);

    const finalBuffer = await readFile(tmpPath);
    const finalKey = `${user_id}/${job_id}/text-to-video.mp4`;
    const finalUrl = await r2Upload(
      'generation-outputs',
      finalKey,
      finalBuffer,
      'video/mp4',
    );

    console.log(`[text-to-video] ${job_id} complete: ${finalUrl}`);
    return { video_url: finalUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
