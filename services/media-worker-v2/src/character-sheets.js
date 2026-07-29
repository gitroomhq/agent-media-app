// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Character-sheet helpers for the 3-step character_video pipeline.
 *
 *   generateCharacterSheet({ description, jobId, userId })
 *     → calls gpt-image-2 with a locked multi-angle character-sheet
 *       template, uploads the PNG to R2, returns the public URL.
 *
 *   generateStoryboardSheet({ characterSheetUrl, beats, jobId, userId, ratio })
 *     → calls gpt-image-2 with the character sheet as a reference
 *       image and a numbered-panel template prompt, uploads to R2,
 *       returns the public URL.
 *
 * Both are SYNCHRONOUS (5–15s). Used directly by api-v2 sync routes via
 * the /character-sheet-generate and /character-storyboard-generate
 * worker endpoints — not through the queue.
 */

import sharp from 'sharp';

import { r2Upload } from './r2.js';
import { runGeneration } from './evolink-client.js';
import { generateImageEdit, generateImageFromText } from './openai-image-client.js';
import { REALISM_RUBRIC } from './v2/realism.js';

// gpt-image-2 charges by output tokens, not input pixels, but smaller
// inputs upload faster + reduce moderation latency. We re-encode the
// reference image to JPEG q=85 capped at 1024×1024 — a 2 MB portrait
// becomes ~120 KB without visible quality loss for character-sheet use.
async function shrinkReferenceImage(buffer) {
  return sharp(buffer)
    .rotate() // honor EXIF orientation
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

// When OPENAI_API_KEY is set, character-sheet + storyboard generation
// goes direct to OpenAI's Images Edits endpoint (gpt-image-2). The
// EvoLink proxy has been flaky on the Azure-hosted gpt-image-2 route
// (intermittent "Resource temporarily exhausted" upstream errors), and
// going direct also halves credit cost.
const USE_OPENAI_DIRECT = !!process.env.OPENAI_API_KEY;

// EvoLink's gpt-image-2 endpoint takes 2–5+ minutes per call (observed:
// 2m51s, 3m54s, 5m13s for ref-image-conditioned generations). The default
// pollTask timeout was 120s — far too tight, so completed tasks expired
// before we fetched the result and the retry loop kept submitting fresh
// jobs, burning ~7 EvoLink credits per discarded attempt.
const IMAGE_TIMEOUT_MS = parsePositiveInteger(
  process.env.CHARACTER_SHEETS_IMAGE_TIMEOUT_MS,
  600_000, // 10 min
);
// With a generous timeout we don't need the runGeneration default of 4
// attempts; one attempt is enough. Set to 1 to stop double-charging on
// transient timeouts.
const RUNGEN_ATTEMPTS = parsePositiveInteger(
  process.env.CHARACTER_SHEETS_RUNGEN_ATTEMPTS,
  1,
);

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchOr(url, attempts = 5, delayMs = 2000) {
  const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const r = await fetch(url);
      if (!retryStatuses.has(r.status) || i === attempts) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) await new Promise((res) => setTimeout(res, delayMs));
  }
  throw lastErr;
}

/**
 * Default character-sheet prompt. The reference image does most of the
 * work — gpt-image-2 turns it into a full sheet of the same person —
 * but for direct callers (content-machine / character_video) that don't
 * pass a custom sheetPrompt, we append the REALISM_RUBRIC so the sheet
 * itself enforces realism cues. Selfie callers pass their own richer
 * sheetPrompt and bypass this default.
 */
function buildCharacterSheetPrompt(description) {
  const base = description
    ? `Create a Character sheet for ${description}`
    : 'Create a Character sheet for this person';
  return `${base}.\n\n${REALISM_RUBRIC}`;
}

/**
 * Generate a character sheet from a reference image (e.g. an actor portrait).
 *
 * @param {object} params
 * @param {string} params.referenceImageUrl Public HTTPS URL of the source
 *   image (actor portrait, photo, etc.). Required.
 * @param {string} [params.description] Optional extra context (e.g. actor's
 *   name, role) appended to the prompt. Most callers can leave this empty.
 * @param {string} params.jobId
 * @param {string} params.userId
 * @returns {Promise<string>} public R2 URL of the uploaded sheet PNG
 */
export async function generateCharacterSheet({ description, jobId, userId, referenceImageUrl, portraitPrompt, sheetPrompt, onPhase }) {
  const phase = (p) => (typeof onPhase === 'function' ? Promise.resolve(onPhase(p)).catch(() => {}) : Promise.resolve());

  // "Describe a character" mode — no reference image. Generate a portrait
  // from the description first via gpt-image-2 text-to-image, upload it
  // to R2, then use that as the reference for the sheet pipeline below.
  if (!referenceImageUrl) {
    if (!description || description.trim().length < 3) {
      throw new Error('character-sheet: provide either referenceImageUrl or a description (≥3 chars)');
    }
    await phase('painting_portrait');
    console.log(`[character-sheets] no ref — generating portrait from description first (job ${jobId})`);
    // Default portrait prompt is the original studio-style line for
    // backwards compat with content-machine / character_video flows.
    // Callers chasing UGC realism (selfie) pass `portraitPrompt` to
    // override with a candid-iPhone-style brief. See selfie-adapter.js.
    const prompt = (typeof portraitPrompt === 'string' && portraitPrompt.trim().length > 0)
      ? portraitPrompt
      : `studio portrait of ${description}, clean background, head and shoulders, photorealistic`;
    console.log(`[character-sheets] portrait prompt: ${prompt.substring(0, 200)}${prompt.length > 200 ? '…' : ''}`);
    // quality:'high' — portrait is the identity seed; medium produces
    // plastic-skin artifacts that propagate through sheet → video.
    const portraitBuffer = await generateImageFromText({
      prompt,
      size: '1024x1024',
      quality: 'high',
    });
    const portraitKey = `${userId}/${jobId}/character-portrait.png`;
    referenceImageUrl = await r2Upload('generation-outputs', portraitKey, portraitBuffer, 'image/png');
    console.log(`[character-sheets] portrait uploaded: ${referenceImageUrl}`);
  }
  await phase('building_sheet');
  console.log(`[character-sheets] sheet for ref=${referenceImageUrl}${description ? ` (${description})` : ''} (job ${jobId}) provider=${USE_OPENAI_DIRECT ? 'openai' : 'evolink'}`);
  // Callers that want a specific sheet layout (e.g. selfie: full-body,
  // multiple outfits, clean grid, no editorial design) pass `sheetPrompt`
  // to override the generic default. Default behavior unchanged for
  // content-machine / character_video.
  const prompt = (typeof sheetPrompt === 'string' && sheetPrompt.trim().length > 0)
    ? sheetPrompt
    : buildCharacterSheetPrompt(description);
  console.log(`[character-sheets] sheet prompt: ${prompt.substring(0, 200)}${prompt.length > 200 ? '…' : ''}`);

  let buffer;
  if (USE_OPENAI_DIRECT) {
    const refResp = await fetchOr(referenceImageUrl);
    if (!refResp.ok) {
      throw new Error(`Failed to download reference image: HTTP ${refResp.status}`);
    }
    const rawBuffer = Buffer.from(await refResp.arrayBuffer());
    const refBuffer = await shrinkReferenceImage(rawBuffer);
    console.log(`    [openai] ref image: ${rawBuffer.length} → ${refBuffer.length} bytes (jpeg q=85, max 1024px)`);
    // quality:'high' — sheet is the identity reference Seedance reads.
    // Medium produces visible AI artifacts on faces that propagate.
    buffer = await generateImageEdit({
      prompt,
      imageBuffers: [refBuffer],
      // Landscape (3:2) — multi-angle character sheets read better with
      // horizontal layout: front / 3-4 / profile / back along a row,
      // expressions in a strip below. gpt-image-1 supports 1536x1024.
      size: '1536x1024',
      quality: 'high',
      n: 1,
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
  } else {
    // EvoLink's gpt-image-2 endpoint expects size/resolution/quality fields;
    // omitting them surfaces as a misleading "Service authentication failed"
    // from their backend rather than a 400.
    const params = {
      prompt,
      image_urls: [referenceImageUrl],
      size: '3:2', // landscape — see comment in OpenAI branch above
      resolution: '2K',
      quality: 'high', // identity reference must be photoreal
      n: 1,
    };
    const remoteUrl = await runGeneration(
      'gpt-image-2',
      params,
      { timeoutMs: IMAGE_TIMEOUT_MS, attempts: RUNGEN_ATTEMPTS },
    );
    const resp = await fetchOr(remoteUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download character sheet: HTTP ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
  }
  await phase('uploading');
  const r2Key = `${userId}/${jobId}/character-sheet.png`;
  const publicUrl = await r2Upload(
    'generation-outputs',
    r2Key,
    buffer,
    'image/png',
  );
  console.log(`[character-sheets] sheet uploaded: ${publicUrl}`);
  return publicUrl;
}

/**
 * Build the storyboard panel prompt.
 *
 * Layout: a numbered panel grid (1, 2, 3, …, n) showing the character
 * in each beat. Uses the character sheet as a reference so the
 * character stays on-model across all panels.
 */
/**
 * Script-mode storyboard prompt — let gpt-image-2 split the script
 * into 4–6 panels itself. Same caption requirement as beats mode so
 * each panel carries its spoken line for the video step.
 */
function buildStoryboardScriptPrompt(script /* , ratio */) {
  return [
    'make a 4 to 6 panel storyboard split intelligently from the script below.',
    'character matches the reference image exactly across every panel.',
    'in each panel render the action AND the spoken line as bold legible caption text inside the panel.',
    'natural spoken voice, in english.',
    `script:`,
    script,
  ].join(' ');
}

function buildStoryboardSheetPrompt(beats /* , ratio */) {
  const numbered = beats
    .map((beat, i) => `${i + 1}. ${beat.trim()}.`)
    .join(' ');
  // Each panel must include a short line of dialogue that the character is
  // saying for that beat — gpt-image-2 writes the line itself based on the
  // beat description. The dialogue feeds into the final video step (it's
  // what the character speaks on screen), so it MUST be rendered as legible
  // text inside the panel. Without dialogue text in the storyboard, the
  // video pipeline has no script.
  return [
    `make a ${beats.length}-panel storyboard.`,
    'character matches the reference image exactly across every panel.',
    'in each panel render the action AND a short spoken line the character says,',
    'as bold legible caption text inside the panel.',
    'one short sentence per panel, natural spoken voice, in english.',
    `panels:`,
    numbered,
  ].join(' ');
}

/**
 * Generate a storyboard panel grid from beats, using the character
 * sheet as a reference image so the character stays on-model.
 * @returns {Promise<string>} public R2 URL of the uploaded PNG
 */
export async function generateStoryboardSheet({
  characterSheetUrl,
  beats,
  script,
  jobId,
  userId,
  ratio = '9:16',
  onPhase,
}) {
  const phase = (p) => (typeof onPhase === 'function' ? Promise.resolve(onPhase(p)).catch(() => {}) : Promise.resolve());
  const hasScript = typeof script === 'string' && script.trim().length >= 10;
  const hasBeats = Array.isArray(beats) && beats.length >= 3 && beats.length <= 10;
  if (!hasScript && !hasBeats) {
    throw new Error('storyboard: provide either beats[] (3–10 items) or script (≥10 chars)');
  }
  await phase('composing_panels');
  console.log(`[character-sheets] storyboard ${hasScript ? '(script)' : `${beats.length} panels`} (job ${jobId}) provider=${USE_OPENAI_DIRECT ? 'openai' : 'evolink'}`);
  const prompt = hasScript
    ? buildStoryboardScriptPrompt(script.trim(), ratio)
    : buildStoryboardSheetPrompt(beats, ratio);

  let buffer;
  if (USE_OPENAI_DIRECT) {
    const refResp = await fetchOr(characterSheetUrl);
    if (!refResp.ok) {
      throw new Error(`Failed to download character sheet for storyboard: HTTP ${refResp.status}`);
    }
    const refBuffer = Buffer.from(await refResp.arrayBuffer());
    buffer = await generateImageEdit({
      prompt,
      imageBuffers: [refBuffer],
      size: '2048x2048',
      quality: 'medium',
      n: 1,
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
  } else {
    const remoteUrl = await runGeneration(
      'gpt-image-2',
      {
        prompt,
        image_urls: [characterSheetUrl],
        size: '1:1',
        resolution: '2K',
        quality: 'medium',
        n: 1,
      },
      { timeoutMs: IMAGE_TIMEOUT_MS, attempts: RUNGEN_ATTEMPTS },
    );
    const resp = await fetchOr(remoteUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download storyboard sheet: HTTP ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
  }
  await phase('uploading');
  const r2Key = `${userId}/${jobId}/storyboard.png`;
  const publicUrl = await r2Upload(
    'generation-outputs',
    r2Key,
    buffer,
    'image/png',
  );
  console.log(`[character-sheets] storyboard uploaded: ${publicUrl}`);
  return publicUrl;
}
