// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Show Your App Pipeline
 *
 * Generates a video of an AI actor holding a phone showing the user's app.
 *
 * Steps:
 * 1. GPT Image 2 — replace green screen with app screenshot
 * 2. Crop 1024x1024 → 9:16 (center crop, NOT squish)
 * 3. Upload cropped image to R2
 * 4. Seedance 2.0 — animate with "frozen photograph" prompt
 * 5. FFmpeg — trim first 0.3s
 * 6. Upload final video to R2
 */

import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { r2Upload } from './r2.js';
import { burnHormoziSubtitles } from './hormozi-subtitles.js';
import { runGeneration } from './evolink-client.js';

const execFileAsync = promisify(execFile);

const EVOLINK_API_KEY = process.env.EVOLINK_API_KEY;
const IMAGE_TIMEOUT_MS = parsePositiveInteger(
  process.env.SHOW_YOUR_APP_IMAGE_TIMEOUT_MS,
  600_000,
);
const VIDEO_TIMEOUT_MS = parsePositiveInteger(
  process.env.SHOW_YOUR_APP_VIDEO_TIMEOUT_MS,
  600_000,
);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, options = {}, retryOptions = {}) {
  const attempts = retryOptions.attempts ?? 5;
  const delayMs = retryOptions.delayMs ?? 2000;
  const retryStatuses = new Set(retryOptions.retryStatuses ?? [408, 429, 500, 502, 503, 504]);
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

  throw lastError;
}

async function downloadToFile(url, outputPath, label, retryOptions = {}) {
  const response = await fetchWithRetries(url, {}, { attempts: 5, delayMs: 2000, ...retryOptions });
  if (!response.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

/**
 * Run GPT Image 2 to composite app onto green screen.
 * Returns the URL of the composited image.
 */
async function gptImageComposite(greenScreenUrl, appScreenshotUrl) {
  console.log('  [show-your-app] Step 1: GPT Image 2 compositing...');

  const imageUrl = await runGeneration('gpt-image-2', {
    prompt: 'Take the green phone screen in the first image and replace it with the app screenshot from the second image. The app should be perfectly aligned and tilted to match the phone angle. Keep everything else unchanged.',
    image_urls: [greenScreenUrl, appScreenshotUrl],
  }, {
    timeoutMs: IMAGE_TIMEOUT_MS,
  });

  console.log('    GPT Image done');
  return imageUrl;
}

/**
 * Crop a 1024x1024 image to 9:16 (576x1024) from center.
 * Uses FFmpeg since sharp may not be available.
 */
async function cropTo916(inputPath, outputPath) {
  console.log('  [show-your-app] Step 2: Cropping to 9:16...');

  // Get image dimensions
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', inputPath,
  ]);
  const streams = JSON.parse(stdout).streams;
  const video = streams.find(s => s.codec_type === 'video') || streams[0];
  const w = parseInt(video.width);
  const h = parseInt(video.height);

  // Calculate 9:16 crop from center
  const targetW = Math.round(h * 9 / 16);
  const xOffset = Math.round((w - targetW) / 2);

  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vf', `crop=${targetW}:${h}:${xOffset}:0`,
    '-q:v', '2',
    outputPath,
  ]);

  console.log(`    Cropped: ${targetW}x${h}`);
}

/**
 * Run Seedance 2.0 to animate the composited image.
 * Returns the URL of the video.
 */
async function seedanceAnimate(imageUrl, script, duration) {
  console.log(`  [show-your-app] Step 4: Seedance 2.0 animating (${duration}s)...`);

  const gender = 'person'; // generic
  const prompt = `A ${gender} talking to camera while holding a phone. They say: "${script}". The phone screen shows a fixed static image like a photograph. The screen content is frozen and unchanging throughout. Natural facial movement only.`;

  const videoUrl = await runGeneration('seedance-2.0-image-to-video', {
    prompt,
    image_urls: [imageUrl],
    duration,
    aspect_ratio: '9:16',
    generate_audio: true,
  }, {
    timeoutMs: VIDEO_TIMEOUT_MS,
  });

  console.log('    Seedance done');
  return videoUrl;
}

/**
 * Main pipeline entry point.
 */
export async function processShowYourApp(params) {
  if (!EVOLINK_API_KEY) {
    throw new Error('EVOLINK_API_KEY not configured');
  }

  const {
    job_id,
    user_id,
    green_screen_url,
    app_screenshot_url,
    script,
    duration = 5,
    subtitle_style = 'hormozi',
  } = params;

  const workDir = await mkdtemp(join(tmpdir(), 'show-your-app-'));

  try {
    console.log(`[show-your-app] Job ${job_id} starting...`);
    console.log(`  Green screen: ${green_screen_url}`);
    console.log(`  App: ${app_screenshot_url}`);
    console.log(`  Script: "${script.substring(0, 50)}..."`);

    // Step 1: GPT Image composite
    const compositeUrl = await gptImageComposite(green_screen_url, app_screenshot_url);

    // Download composite
    const compositePath = join(workDir, 'gpt-composite.png');
    await downloadToFile(compositeUrl, compositePath, 'composited app image');

    // Step 2: Crop to 9:16
    const croppedPath = join(workDir, 'cropped.jpg');
    await cropTo916(compositePath, croppedPath);

    // Step 3: Upload cropped image (need public URL for Seedance)
    console.log('  [show-your-app] Step 3: Uploading cropped image...');
    const croppedBuffer = await readFile(croppedPath);

    // Upload to R2
    const r2Key = `${user_id}/${job_id}/cropped-input.jpg`;
    const croppedPublicUrl = await r2Upload('generation-outputs', r2Key, croppedBuffer, 'image/jpeg');
    console.log(`    Uploaded: ${croppedPublicUrl}`);

    // Step 4: Seedance animate
    const videoUrl = await seedanceAnimate(croppedPublicUrl, script, duration);

    // Step 5: Download + trim
    console.log('  [show-your-app] Step 5: Downloading + trimming...');
    const rawVideoPath = join(workDir, 'raw.mp4');
    const trimmedPath = join(workDir, 'trimmed.mp4');

    await downloadToFile(videoUrl, rawVideoPath, 'generated app video', { delayMs: 2500 });

    await execFileAsync('ffmpeg', [
      '-y', '-i', rawVideoPath,
      '-ss', '0.3',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      trimmedPath,
    ]);

    // Step 6: Burn subtitles (Hormozi style)
    let finalVideoPath = trimmedPath;
    if (subtitle_style === 'hormozi') {
      console.log('  [show-your-app] Step 6: Burning Hormozi subtitles...');
      const { stdout: durOut } = await execFileAsync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', trimmedPath,
      ]);
      const trimmedDuration = parseFloat(durOut.trim()) || duration;
      const subtitledPath = join(workDir, 'subtitled.mp4');
      await burnHormoziSubtitles(trimmedPath, subtitledPath, script, trimmedDuration, workDir);
      finalVideoPath = subtitledPath;
    }

    // Step 7: Upload final video to R2
    console.log('  [show-your-app] Step 7: Uploading final video...');
    const finalBuffer = await readFile(finalVideoPath);
    const finalR2Key = `${user_id}/${job_id}/show-your-app-final.mp4`;
    const finalUrl = await r2Upload('generation-outputs', finalR2Key, finalBuffer, 'video/mp4');

    console.log(`[show-your-app] Job ${job_id} complete: ${finalUrl}`);
    return { video_url: finalUrl };

  } finally {
    // Cleanup
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
