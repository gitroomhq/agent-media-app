// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Selfie pipeline.
 *
 *   Stage A · gpt-image-2 → portrait (when no saved character_id)
 *   Stage B · gpt-image-2 → character sheet (when no saved character_id)
 *   Stage C · gpt-image-2 → wireframe (per scene)
 *   Stage D · Seedance 2.0 ref-to-video (sheet + wireframe + locked seed)
 *
 * In v1 we ship inline-character mode only (caller passes
 * `photo_url` + `description`). Saved-character mode (`character_id`)
 * arrives once the `user_characters` migration lands in the schema.
 *
 * Validated end-to-end by /tmp/test-selfie.mjs and test-selfie-2.mjs.
 * This module is the proper-module form of those throwaway scripts —
 * same provider calls, same prompts (via the realism scaffolder),
 * shared R2/OpenAI/EvoLink clients from the v1 worker.
 */

import { writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

import { generateImageFromText, generateImageEdit } from '../openai-image-client.js';
import { runGeneration } from '../evolink-client.js';
import { r2Upload } from '../r2.js';
import { fetchToBuffer } from './http.js';
import { buildScaffoldedPrompt, buildVideoPrompt, REALISM_RUBRIC } from './realism.js';

// ── Supabase (service-role) for character lookups ─────────────────────────
let _supabase = null;
function db() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — required for character_id resolution');
  }
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Load a saved v2 character by its public id ("char_xxxxxxxxxx").
 * Throws if not found, archived, or missing the v2 columns.
 */
async function loadCharacter(publicId) {
  const { data, error } = await db()
    .from('user_characters')
    .select('id, public_id, portrait_url, character_sheet_url, seedance_seed, voice_brief, preset_default, archived_at')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw new Error(`character lookup failed: ${error.message}`);
  if (!data) throw new Error(`character not found: ${publicId}`);
  if (data.archived_at) throw new Error(`character archived: ${publicId}`);
  if (!data.portrait_url || !data.character_sheet_url || data.seedance_seed == null) {
    throw new Error(`character ${publicId} is missing v2 fields (portrait/sheet/seed). Re-create via /v2/characters.`);
  }
  return data;
}

// ── Constants ─────────────────────────────────────────────────────────────
const R2_BUCKET = 'brand-extracts'; // reuses an existing public-read bucket
const SEEDANCE_MODEL = 'seedance-2.0-reference-to-video';
const DEFAULT_QUALITY = '720p';
const DEFAULT_ASPECT = '9:16';

/**
 * Generate a Selfie video end to end.
 *
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} [params.character_id]   — saved character (TODO: wire when DB lands)
 * @param {string} [params.photo_url]      — inline-character mode
 * @param {string} [params.description]    — inline-character mode
 * @param {string} params.script           — what the character says
 * @param {string} [params.preset]         — shot-grammar preset key (default bedroom-morning-ritual)
 * @param {string} [params.vibe]           — excited|calm|sassy|serious|curious
 * @param {number} [params.duration]       — 5 | 8 | 12 | 15 (seconds)
 * @param {string} [params.voice_brief]    — natural-language voice direction
 * @param {number} [params.seed]           — pinned random integer; we'll generate one when missing
 * @param {(stage: string, meta?: object) => void} [params.onProgress]
 * @returns {Promise<{
 *   videoUrl: string,
 *   portraitUrl: string,
 *   sheetUrl: string,
 *   wireframeUrl: string,
 *   seed: number,
 *   prompts: { portrait: string, sheet: string, wireframe: string, video: string },
 * }>}
 */
export async function processSelfie(params) {
  // Note: script and a few other params are `let` (not const-destructured)
  // because we normalize them below.
  const {
    job_id,
    user_id,
    character_id,
    photo_url,
    description,
    preset = 'bedroom-morning-ritual',
    vibe = 'excited',
    duration = 10,
    voice_brief,
    subtitles = true,
    // New v2 brief fields, all optional. scene_action overrides the
    // default "talking to camera" template. background_music adds an
    // ambient track instruction. Empty script ⇒ no speech path.
    scene_action,
    background_music,
    seed: callerSeed,
    onProgress = () => {},
  } = params;
  // Normalize script — allow empty when scene_action is given.
  let script = typeof params.script === 'string' ? params.script : '';

  if (!job_id) throw new Error('processSelfie: job_id is required');
  // Script is optional now — scene_action covers the non-speech case
  // (dance clips, b-roll, etc). At least ONE of (script, scene_action)
  // must be present so we have SOMETHING to drive Stage D.
  if (!script.trim() && !scene_action) {
    throw new Error('processSelfie: provide either script or scene_action');
  }

  const usingSavedCharacter = !!character_id;
  if (!usingSavedCharacter && !description) {
    throw new Error(
      'processSelfie: provide character_id, OR description (with optional photo_url)',
    );
  }
  const workDir = await mkdtemp(join(tmpdir(), `selfie-${job_id}-`));
  const r2Prefix = `selfie/${job_id}`;
  const prompts = {};

  // ── Resolve character ─────────────────────────────────────────────────
  // Two paths:
  //   • saved character: load portrait/sheet/seed/voice from user_characters
  //   • inline character: run Stage A + Stage B fresh
  let portraitUrl;
  let sheetUrl;
  let portraitBuf;     // only populated in inline mode (used as ref for Stage B)
  let sheetBuf;        // only populated in inline mode (used as ref for Stage C)
  let seed;
  let effectiveVoiceBrief = voice_brief;
  let effectivePreset = preset;

  if (usingSavedCharacter) {
    onProgress('load', { stage: 'load_character', character_id });
    console.log(`[selfie:${job_id}] [load] resolving ${character_id}…`);
    const char = await loadCharacter(character_id);
    portraitUrl = char.portrait_url;
    sheetUrl = char.character_sheet_url;
    seed = callerSeed ?? Number(char.seedance_seed);
    if (!effectiveVoiceBrief && char.voice_brief) effectiveVoiceBrief = char.voice_brief;
    if (char.preset_default && !preset) effectivePreset = char.preset_default;
    console.log(`[selfie:${job_id}] [load] ✓ sheet=${sheetUrl} seed=${seed}`);
  } else {
    seed = callerSeed ?? Math.floor(Math.random() * 2_147_483_647);
  }

  if (!usingSavedCharacter) {
    // ── Stage A · portrait (gpt-image-2, text-only) ────────────────────
    onProgress('A', { stage: 'portrait' });
    prompts.portrait = buildScaffoldedPrompt({
      preset: effectivePreset,
      vibe,
      lines: [
        `Hyper-realistic iPhone selfie portrait of: ${description}.`,
        'Subject looks at the camera with a relaxed micro-smile, mouth slightly parted.',
      ],
    });
    console.log(`[selfie:${job_id}] [A] portrait…`);
    portraitBuf = await generateImageFromText({
      prompt: prompts.portrait,
      size: '1024x1536',
      quality: 'medium',
    });
    await writeFile(join(workDir, 'portrait.png'), portraitBuf);
    portraitUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/portrait.png`, portraitBuf, 'image/png');
    console.log(`[selfie:${job_id}] [A] ✓ ${portraitUrl}`);

    // ── Stage B · character sheet (gpt-image-2, portrait as ref) ───────
    onProgress('B', { stage: 'sheet' });
    // Stage B prompt: minimal — just "create a character sheet" of the
    // portrait. Let the model pick poses naturally. No prescribed pose
    // list, no prescribed outfit (the portrait already carries that).
    prompts.sheet = [
      'Create a character sheet of the same person shown in the reference image.',
      'A multi-pose, multi-expression grid on a clean off-white background. Same face, same hair, same identity in every cell. Wardrobe and hairstyle as shown in the reference portrait.',
    ].join('\n\n');
    console.log(`[selfie:${job_id}] [B] character sheet…`);
    sheetBuf = await generateImageEdit({
      prompt: prompts.sheet,
      imageBuffers: [portraitBuf],
      size: '1536x1024',
      quality: 'medium',
    });
    await writeFile(join(workDir, 'sheet.png'), sheetBuf);
    sheetUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/sheet.png`, sheetBuf, 'image/png');
    console.log(`[selfie:${job_id}] [B] ✓ ${sheetUrl}`);
  } else {
    // Saved-character mode: pull the existing sheet PNG into memory so we
    // can hand it to Stage C as a reference image.
    console.log(`[selfie:${job_id}] [load] fetching sheet PNG for Stage C…`);
    sheetBuf = await fetchToBuffer(sheetUrl);
  }

  // ── Stage C · wireframe (gpt-image-2, sheet as ref) ──────────────────
  onProgress('C', { stage: 'wireframe' });
  prompts.wireframe = buildScaffoldedPrompt({
    preset: effectivePreset,
    vibe,
    lines: [
      'Compose a single iPhone-selfie still of the SAME PERSON shown in the reference sheet, captured mid-syllable while delivering the line. ONE frame, vertical 9:16.',
      'Pose: subject is talking to the front camera, head tilted slightly, one hand caught mid hair-touch. Eyes slightly off-center to camera, NOT a dead stare.',
      `This frame becomes the first frame of a ${duration}-second TikTok-style video.`,
    ],
  });
  console.log(`[selfie:${job_id}] [C] wireframe…`);
  const wireBuf = await generateImageEdit({
    prompt: prompts.wireframe,
    imageBuffers: [sheetBuf],
    size: '1024x1536',
    quality: 'medium',
  });
  await writeFile(join(workDir, 'wireframe.png'), wireBuf);
  const wireUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/wireframe.png`, wireBuf, 'image/png');
  console.log(`[selfie:${job_id}] [C] ✓ ${wireUrl}`);

  // ── Stage D · Seedance 2.0 ref-to-video ──────────────────────────────
  //
  // MINIMAL prompt. The sheet + wireframe already encode identity,
  // outfit, hairstyle, setting, lighting, framing, and the realism
  // rubric (skin pores, handheld feel, etc.) — repeating any of that
  // in the Seedance prompt bloats the call and confuses the model.
  //
  // Seedance only needs: action + script (if any) + music + duration.
  const action =
    scene_action && scene_action.trim().length > 0
      ? scene_action.trim()
      : script && script.trim().length > 0
        ? 'talking to camera, handheld iPhone selfie style'
        : 'moving naturally in the scene';
  const musicDirection = background_music
    ? (typeof background_music === 'string' ? background_music : 'soft upbeat music, no dialogue')
    : null;

  onProgress('D', { stage: 'seedance' });
  prompts.video = buildVideoPrompt({
    action,
    script,
    music: musicDirection,
    duration,
  });
  console.log(`[selfie:${job_id}] [D] Seedance prompt (${prompts.video.length} chars): ${prompts.video}`);
  console.log(`[selfie:${job_id}] [D] Seedance 2.0 (seed=${seed}, ${duration}s)…`);
  const videoUrl = await runGeneration(
    SEEDANCE_MODEL,
    {
      prompt: prompts.video,
      image_urls: [sheetUrl, wireUrl],
      duration,
      aspect_ratio: DEFAULT_ASPECT,
      generate_audio: true,
      quality: DEFAULT_QUALITY,
      seed,
    },
    { timeoutMs: 30 * 60_000 },
  );
  console.log(`[selfie:${job_id}] [D] ✓ ${videoUrl}`);

  // Re-host on our own R2 so we own the URL lifecycle.
  const videoBuf = await fetchToBuffer(videoUrl);
  const ownVideoUrl = await r2Upload(
    R2_BUCKET,
    `${r2Prefix}/video.mp4`,
    videoBuf,
    'video/mp4',
  );
  console.log(`[selfie:${job_id}] re-hosted → ${ownVideoUrl}`);

  // ── Stage E · burn subtitles (when subtitles=true) ─────────────────
  // We already have the verbatim script, so we pass it as the
  // transcript — no Whisper round-trip needed. The subtitle pipeline
  // word-distributes evenly across the clip duration.
  let finalVideoUrl = ownVideoUrl;
  // Skip subs when (a) caller said subtitles:false OR (b) there's no
  // speech at all (no script ⇒ Whisper would transcribe Seedance's
  // background sounds and burn garbage).
  if (subtitles !== false && script.trim().length > 0) {
    onProgress('E', { stage: 'subtitles' });
    console.log(`[selfie:${job_id}] [E] burning subtitles (style=hormozi)…`);
    const { processSubtitle } = await import('./subtitle-pipeline.js');
    const subResult = await processSubtitle({
      job_id: `${job_id}-subs`,
      user_id,
      video_url: ownVideoUrl,
      style: 'hormozi',
      transcript: script,
      onProgress: (stage, meta) => onProgress(`E.${stage}`, meta),
    });
    finalVideoUrl = subResult.videoUrl ?? subResult.video_url ?? finalVideoUrl;
    console.log(`[selfie:${job_id}] [E] ✓ subs burned → ${finalVideoUrl}`);
  }

  return {
    videoUrl: finalVideoUrl,
    portraitUrl,
    sheetUrl,
    wireframeUrl: wireUrl,
    seed,
    prompts,
    workDir,
  };
}
