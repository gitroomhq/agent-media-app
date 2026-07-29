// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Product Acting UGC Pipeline
 *
 * Generates a vertical UGC clip where an actor presents an uploaded product.
 *
 * Steps:
 * 1. GPT Image — create actor + product opening frame
 * 2. Normalize frame to 9:16
 * 3. Upload normalized frame to R2
 * 4. Seedance 2.0 — animate as a raw UGC phone video
 * 5. Trim first 0.3s
 * 6. Optionally burn subtitles
 * 7. Upload final video to R2
 */

import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { r2Upload } from './r2.js';
import { generateASS } from './ass-generator.js';
import { transcribeWithWhisper } from './whisper.js';
import { runGeneration } from './evolink-client.js';

const execFileAsync = promisify(execFile);

const EVOLINK_API_KEY = process.env.EVOLINK_API_KEY;
const IMAGE_MODEL = process.env.PRODUCT_ACTING_IMAGE_MODEL
  || process.env.GPT_IMAGE_MODEL
  || 'gpt-image-2';
const VIDEO_MODEL = process.env.PRODUCT_ACTING_VIDEO_MODEL
  || 'seedance-2.0-image-to-video';
const IMAGE_SIZE = process.env.PRODUCT_ACTING_IMAGE_SIZE || '9:16';
const IMAGE_RESOLUTION = process.env.PRODUCT_ACTING_IMAGE_RESOLUTION || '2K';
const IMAGE_QUALITY = process.env.PRODUCT_ACTING_IMAGE_QUALITY || 'medium';
// Per-step timeout ceilings — historically 10min × default 4 attempts = up
// to 40min wall-clock per job before failure. Cut to a single attempt at a
// realistic ceiling for each step so users get a clean error in minutes,
// not half an hour. Combined with attempts=2 below, max wait is bounded
// at IMAGE_TIMEOUT_MS×2 and VIDEO_TIMEOUT_MS×2.
const IMAGE_TIMEOUT_MS = parsePositiveInteger(
  process.env.PRODUCT_ACTING_IMAGE_TIMEOUT_MS,
  240_000, // 4 min — gpt-image-2 typically lands in 60–120s
);
const VIDEO_TIMEOUT_MS = parsePositiveInteger(
  process.env.PRODUCT_ACTING_VIDEO_TIMEOUT_MS,
  360_000, // 6 min — seedance-2.0 typically lands in 2–3 min
);
const RUNGEN_ATTEMPTS = parsePositiveInteger(
  process.env.PRODUCT_ACTING_RUNGEN_ATTEMPTS,
  2,
);

const TEMPLATE_PROMPTS = {
  'product-in-hand': 'clean indoor selfie-style creator holding the product naturally at chest height near the camera',
  'mirror-selfie': 'bright hallway or living-room mirror-style selfie, creator fully clothed and holding the product while filming',
  'bathroom-reaction': 'bright indoor vanity or desk-side reaction frame with expressive direct-to-camera reaction, fully clothed',
  'kitchen-counter': 'casual kitchen counter demo, product held or placed near the creator',
  'car-selfie': 'parked car selfie in daylight, creator holding product near the camera',
  'couch-review': 'creator sitting on a couch in warm natural light, casually presenting the product',
  'expert-interview': 'expert or interview-style UGC frame with the product visible and the actor speaking directly',
  'product-closeup': 'product large in the foreground with the creator behind it reacting to camera',
};

const ACTING_PROMPTS = {
  'raw-selfie': 'natural, casual, imperfect phone-shot delivery',
  shocked: 'wide-eyed shocked reaction, expressive but believable',
  angry: 'concerned direct reaction hook, like calling out a practical problem',
  excited: 'high-energy discovery reaction, smiling and animated',
  dramatic: 'big but family-friendly testimonial reaction with an expressive face',
  'weird-hook': 'unexpected non-suggestive pattern-interrupt opening pose that would stop a social feed scroll',
  'casual-demo': 'calm practical demonstration with clear product handling',
  'honest-review': 'skeptical but fair review posture, credible and grounded',
};

const SAFETY_ERROR_PATTERN = /inappropriate|explicit|suggestive|sexual|nudity|nsfw|safety|policy|moderation|blocked|disallowed/i;

const RISKY_TEXT_REPLACEMENTS = [
  [/\b(bathroom|bedroom|lingerie|underwear|bikini|cleavage|nude|naked|sexy|sensual|seductive|erotic|nsfw)\b/gi, 'neutral indoor'],
  [/\b(breasts?|boobs?|butt|ass|thighs?|saggy)\b/gi, 'body'],
  [/\b(weight\s*loss|fat\s*burn(?:ing)?|before\s*(?:\/|and)?\s*after|transformation)\b/gi, 'product routine'],
  [/\b(medical|doctor|cure|heals?|treats?|diagnosis)\b/gi, 'wellness'],
];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireProviderConfig() {
  if (!EVOLINK_API_KEY) {
    throw new Error('EVOLINK_API_KEY not configured');
  }
}

function isSafetyError(err) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return SAFETY_ERROR_PATTERN.test(message);
}

function sanitizePromptText(value, maxLength = 240) {
  if (typeof value !== 'string') return '';
  let cleaned = value.normalize('NFKC');
  for (const [pattern, replacement] of RISKY_TEXT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLength);
}

function wantsFullBody(value) {
  return typeof value === 'string'
    && /\b(full body|full-body|head to toe|head-to-toe|whole body|standing|wide shot)\b/i.test(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getImageDimensions(imagePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    imagePath,
  ]);
  const stream = JSON.parse(stdout)?.streams?.[0];
  return {
    width: Number(stream?.width) || 0,
    height: Number(stream?.height) || 0,
  };
}

function isUsablePortrait916({ width, height }) {
  if (!width || !height || height <= width) return false;
  return Math.abs((width / height) - (9 / 16)) <= 0.06;
}

async function downloadToFile(url, outputPath, label, retryOptions = {}) {
  const response = await fetchWithRetries(url, {}, { attempts: 5, delayMs: 2000, ...retryOptions });
  if (!response.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
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

function buildFramePrompt({
  template,
  acting_style,
  visual_style,
  product_name,
  product_description,
}, options = {}) {
  const safeMode = options.safeMode === true;
  const scene = TEMPLATE_PROMPTS[template] || TEMPLATE_PROMPTS['product-in-hand'];
  const acting = ACTING_PROMPTS[acting_style] || ACTING_PROMPTS['raw-selfie'];
  const safeProductName = sanitizePromptText(product_name, 120);
  const safeDescription = safeMode ? '' : sanitizePromptText(product_description, 220);
  const safeStyle = safeMode ? '' : sanitizePromptText(visual_style, 140);
  const framingLine = wantsFullBody(visual_style)
    ? 'Frame a full-body vertical shot from head to toe, with safe margin above the head and below the feet.'
    : 'Frame the actor chest-up or waist-up with neutral body language.';
  const productLine = safeProductName ? `Product name: ${safeProductName}.` : 'Product name is unknown.';
  const descriptionLine = safeDescription
    ? `Product context: ${safeDescription}.`
    : 'No additional product context.';
  const styleLine = safeStyle ? `User style direction: ${safeStyle}.` : '';
  const safeModeLine = safeMode
    ? 'Use the safest possible version: clean living-room or desk setup, neutral posture, simple smile, product held at chest height or placed on a clean table.'
    : '';

  return [
    'Create one photorealistic vertical 9:16 UGC phone-video opening frame.',
    'The generated image canvas itself must be portrait 9:16, not landscape, not square, and not a horizontal photo inside a white or black frame.',
    'All content must be appropriate for all ages and brand-safe.',
    'Use image 1 as the actor reference and preserve the actor identity as much as possible.',
    'Use image 2 as the product reference. The product must be recognizable and naturally integrated.',
    'The actor must be fully clothed in modest everyday casual clothing.',
    framingLine,
    `Scene: ${scene}.`,
    `Acting: ${acting}.`,
    productLine,
    descriptionLine,
    styleLine,
    safeModeLine,
    'If the product is small enough to hold, put it naturally in the actor hand.',
    'If the product is not small enough, place it clearly in the foreground or next to the actor.',
    'Make it look like organic TikTok or Instagram UGC, not a studio ad.',
    'Do not imply body transformation, weight loss, medical results, before-and-after comparison, nudity, swimwear, underwear, lingerie, cleavage focus, sexualized posing, or explicit content.',
    'Avoid polished commercial lighting, perfect symmetry, text overlays, logos added by the model, or fake UI.',
  ].filter(Boolean).join(' ');
}

async function generateOpeningFrame(params) {
  console.log(`  [product-acting] Step 1: ${IMAGE_MODEL} creating product frame...`);
  async function submitFrame(safeMode) {
    console.log(
      `    Image generation${safeMode ? ' safe retry' : ''}, polling for up to ${Math.round(IMAGE_TIMEOUT_MS / 1000)}s...`,
    );
    return runGeneration(IMAGE_MODEL, {
      prompt: buildFramePrompt(params, { safeMode }),
      image_urls: [params.actor_image_url, params.product_image_url],
      size: IMAGE_SIZE,
      resolution: IMAGE_RESOLUTION,
      quality: IMAGE_QUALITY,
      n: 1,
    }, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      attempts: RUNGEN_ATTEMPTS,
    });
  }

  try {
    return await submitFrame(false);
  } catch (err) {
    if (!isSafetyError(err)) throw err;
    console.warn(`    Product frame blocked by safety filter, retrying with conservative prompt: ${err.message}`);
    return submitFrame(true);
  }
}

async function normalizeTo916(inputPath, outputPath) {
  console.log('  [product-acting] Step 2: Normalizing frame to 9:16...');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
    '-q:v', '2',
    outputPath,
  ]);
}

async function burnSyncedSubtitles(inputPath, outputPath, workDir, style = 'hormozi') {
  const audioPath = join(workDir, 'subtitle-audio.mp3');
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'libmp3lame',
    '-q:a', '4',
    audioPath,
  ]);

  const words = await transcribeWithWhisper(audioPath);
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('No subtitle words detected from generated audio');
  }

  const assPath = join(workDir, 'synced-subtitles.ass');
  const assContent = generateASS(words, style, '9:16');
  await writeFile(assPath, assContent);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    outputPath,
  ]);
}

function buildVideoPrompt({
  script,
  template,
  acting_style,
  product_name,
  product_description,
}, options = {}) {
  const safeMode = options.safeMode === true;
  const scene = TEMPLATE_PROMPTS[template] || TEMPLATE_PROMPTS['product-in-hand'];
  const acting = ACTING_PROMPTS[acting_style] || ACTING_PROMPTS['raw-selfie'];
  const safeProductName = sanitizePromptText(product_name, 120);
  const safeDescription = safeMode ? '' : sanitizePromptText(product_description, 220);
  const safeScript = sanitizePromptText(script, 500) || 'This product is really useful, and I wanted to show you why.';
  const productLine = safeProductName ? `The product is ${safeProductName}.` : '';
  const descriptionLine = safeDescription ? `Context: ${safeDescription}.` : '';

  return [
    'Animate this still image as a raw vertical UGC phone video.',
    'All content must stay appropriate for all ages and brand-safe.',
    `Scene: ${scene}.`,
    `Acting style: ${acting}.`,
    productLine,
    descriptionLine,
    `The actor says: "${safeScript}".`,
    'Keep the product identity stable and recognizable.',
    'Keep the actor identity stable.',
    'Use natural handheld micro-motion, face movement, and product handling.',
    'Keep the actor fully clothed and avoid body-transformation, medical, sexualized, explicit, or suggestive framing.',
    'Do not add extra people, captions, fake social UI, or unrelated objects.',
  ].filter(Boolean).join(' ');
}

async function animateFrame(imageUrl, params) {
  console.log(`  [product-acting] Step 4: ${VIDEO_MODEL} animating (${params.duration}s)...`);
  async function submitVideo(safeMode) {
    console.log(
      `    Video generation${safeMode ? ' safe retry' : ''}, polling for up to ${Math.round(VIDEO_TIMEOUT_MS / 1000)}s...`,
    );
    return runGeneration(VIDEO_MODEL, {
      prompt: buildVideoPrompt(params, { safeMode }),
      image_urls: [imageUrl],
      duration: params.duration,
      aspect_ratio: '9:16',
      generate_audio: true,
    }, {
      timeoutMs: VIDEO_TIMEOUT_MS,
      attempts: RUNGEN_ATTEMPTS,
    });
  }

  try {
    return await submitVideo(false);
  } catch (err) {
    if (!isSafetyError(err)) throw err;
    console.warn(`    Product acting video blocked by safety filter, retrying with conservative prompt: ${err.message}`);
    return submitVideo(true);
  }
}

export async function processProductActing(params) {
  requireProviderConfig();

  const {
    job_id,
    user_id,
    actor_image_url,
    product_image_url,
    script,
    duration = 5,
    subtitles = true,
    subtitle_style = 'hormozi',
  } = params;

  const workDir = await mkdtemp(join(tmpdir(), 'product-acting-'));

  try {
    console.log(`[product-acting] Job ${job_id} starting...`);
    console.log(`  Actor image: ${actor_image_url}`);
    console.log(`  Product image: ${product_image_url}`);
    console.log(`  Script: "${script.substring(0, 50)}..."`);

    const framePath = join(workDir, 'frame.png');
    let frameUrl = await generateOpeningFrame(params);
    await downloadToFile(frameUrl, framePath, 'generated frame');

    let frameDimensions = await getImageDimensions(framePath);
    if (!isUsablePortrait916(frameDimensions)) {
      console.warn(
        `  [product-acting] Generated frame was ${frameDimensions.width}x${frameDimensions.height}; retrying strict portrait request...`,
      );
      frameUrl = await generateOpeningFrame({
        ...params,
        visual_style: `${params.visual_style || ''} strict vertical 9:16 portrait phone frame`.trim(),
      });
      await downloadToFile(frameUrl, framePath, 'strict portrait generated frame');
      frameDimensions = await getImageDimensions(framePath);
      if (!isUsablePortrait916(frameDimensions)) {
        throw new Error(`Generated product frame is not portrait 9:16 (${frameDimensions.width}x${frameDimensions.height}).`);
      }
    }

    const normalizedPath = join(workDir, 'normalized.jpg');
    await normalizeTo916(framePath, normalizedPath);

    console.log('  [product-acting] Step 3: Uploading normalized frame...');
    const normalizedBuffer = await readFile(normalizedPath);
    const frameR2Key = `${user_id}/${job_id}/product-acting-frame.jpg`;
    const normalizedUrl = await r2Upload('generation-outputs', frameR2Key, normalizedBuffer, 'image/jpeg');

    const videoUrl = await animateFrame(normalizedUrl, params);

    console.log('  [product-acting] Step 5: Downloading + trimming...');
    const rawVideoPath = join(workDir, 'raw.mp4');
    const trimmedPath = join(workDir, 'trimmed.mp4');
    await downloadToFile(videoUrl, rawVideoPath, 'generated video', { delayMs: 2500 });

    await execFileAsync('ffmpeg', [
      '-y', '-i', rawVideoPath,
      '-ss', '0.3',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      trimmedPath,
    ]);

    let finalVideoPath = trimmedPath;
    if (subtitles && subtitle_style !== 'none') {
      console.log('  [product-acting] Step 6: Transcribing + burning synced subtitles...');
      const subtitledPath = join(workDir, 'subtitled.mp4');
      // No catch. Subtitles are a documented feature; silently shipping
      // without them is not the product the user asked for.
      await burnSyncedSubtitles(trimmedPath, subtitledPath, workDir, subtitle_style);
      finalVideoPath = subtitledPath;
    }

    console.log('  [product-acting] Step 7: Uploading final video...');
    const finalBuffer = await readFile(finalVideoPath);
    const finalR2Key = `${user_id}/${job_id}/product-acting-final.mp4`;
    const finalUrl = await r2Upload('generation-outputs', finalR2Key, finalBuffer, 'video/mp4');

    console.log(`[product-acting] Job ${job_id} complete: ${finalUrl}`);
    return { video_url: finalUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
