// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Character-create pipeline.
 *
 * Two gpt-image-2 calls:
 *   A. portrait      — generated from the user-supplied photo + description
 *   B. character sheet — multi-pose grid built from (A)
 *
 * Then we pin a Seedance seed and persist a row in `user_characters`
 * with both URLs, the seed, the voice brief, and the preferred preset.
 *
 * The row is keyed externally by a public_id ("char_xxxxxxxxxx") so the
 * api-v2 route / CLI / MCP / SDK can refer to it without ever leaking
 * the internal uuid.
 *
 * Cost: ~$0.08 (two gpt-image-2 calls). Priced at 27 credits.
 */

import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

import { generateImageFromText, generateImageEdit } from '../openai-image-client.js';
import { r2Upload } from '../r2.js';
import { fetchToBuffer } from './http.js';
import { buildScaffoldedPrompt, REALISM_RUBRIC } from './realism.js';
import { generatePersonaBrief } from './persona-brief.js';

const R2_BUCKET = 'brand-extracts';

let _db = null;
function db() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  _db = createClient(url, key);
  return _db;
}

/**
 * Generate a nanoid-style 10-char base32 id with "char_" prefix.
 * 32^10 = 1.1e15 — plenty for the v1 user base, and the unique index
 * on user_characters.public_id catches any collision anyway.
 */
function makePublicId() {
  const ALPHA = '0123456789ABCDEFGHJKLMNPQRSTVWXYZ'; // Crockford base32: no I/L/O/U
  let s = 'char_';
  for (let i = 0; i < 10; i += 1) {
    s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  return s;
}

/**
 * Create a character end-to-end.
 *
 * @param {object} params
 * @param {string} params.job_id           — tracking id (not the public_id)
 * @param {string} params.user_id          — auth.users(id)
 * @param {string} params.photo_url        — source reference photo
 * @param {string} params.display_name
 * @param {string} params.description
 * @param {string} [params.voice_brief]
 * @param {string} [params.preset_default]
 * @param {(stage: string, meta?: object) => void} [params.onProgress]
 * @returns {Promise<{
 *   character_id: string,         // "char_xxxxxxxxxx"
 *   internal_id: string,          // uuid
 *   portrait_url: string,
 *   sheet_url: string,
 *   seedance_seed: number,
 * }>}
 */
export async function processCharacterCreate(params) {
  const {
    job_id,
    user_id,
    photo_url,
    display_name,
    description,
    voice_brief,
    preset_default,
    onProgress = () => {},
  } = params;

  if (!job_id) throw new Error('processCharacterCreate: job_id required');
  if (!user_id) throw new Error('processCharacterCreate: user_id required');
  // photo_url is now optional. When absent we generate the portrait
  // from `description` alone via gpt-image-2 text-to-image. When
  // present we use it as the identity reference (image-to-image edit).
  if (!display_name) throw new Error('processCharacterCreate: display_name required');
  if (!description) throw new Error('processCharacterCreate: description required');

  const workDir = await mkdtemp(join(tmpdir(), `character-${job_id}-`));
  const r2Prefix = `characters/${user_id}/${job_id}`;
  const presetForPrompts = preset_default ?? 'bedroom-morning-ritual';

  // ── Stage A · portrait ─────────────────────────────────────────────────
  // Two paths:
  //   • photo_url provided  → image-to-image edit (likeness preserved)
  //   • photo_url omitted   → text-to-image from description alone
  onProgress('A', { stage: 'portrait' });
  console.log(`[character:${job_id}] [A] portrait${photo_url ? ' (from photo)' : ' (from description)'}…`);
  const portraitLines = photo_url
    ? [
        `Hyper-realistic clean portrait reference of: ${description}.`,
        'Take the reference photo as the identity (face shape, eye colour, hair, skin tone, body). Render a clean frontal-ish portrait of THE SAME PERSON, eyes meeting camera, soft daylight, plain off-white background.',
        'This image will be used as the master reference for video generation — face must be unambiguous.',
      ]
    : [
        `Hyper-realistic clean portrait of: ${description}.`,
        'Frontal-ish portrait, eyes meeting camera, soft daylight, plain off-white background. Real-person look: pores, microcatchlights, natural asymmetry, no makeup smoothing.',
        'This image will be used as the master reference for video generation — face must be unambiguous, distinctive, and consistent.',
      ];
  const portraitPrompt = buildScaffoldedPrompt({
    preset: presetForPrompts,
    vibe: 'calm',
    lines: portraitLines,
  });
  const portraitBuf = photo_url
    ? await generateImageEdit({
        prompt: portraitPrompt,
        imageBuffers: [await fetchToBuffer(photo_url)],
        size: '1024x1536',
        quality: 'medium',
      })
    : await generateImageFromText({
        prompt: portraitPrompt,
        size: '1024x1536',
        quality: 'medium',
      });
  await writeFile(join(workDir, 'portrait.png'), portraitBuf);
  const portraitUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/portrait.png`, portraitBuf, 'image/png');
  console.log(`[character:${job_id}] [A] ✓ ${portraitUrl}`);

  // ── Stage B · character sheet (gpt-image-2 from portrait) ─────────────
  onProgress('B', { stage: 'sheet' });
  console.log(`[character:${job_id}] [B] character sheet…`);
  const sheetPrompt = [
    'Build a CHARACTER SHEET for the same person shown in the reference image.',
    '8 cells in a 2×4 grid on a clean off-white background. Each cell shows the SAME person — identical face, hair colour, freckles, ethnicity, body — in a different pose/expression:',
    '1) frontal headshot · 2) 3/4 angle · 3) side profile · 4) smiling open mouth · 5) hand touching hair · 6) holding a small bottle mid-chest · 7) seated relaxed · 8) walking 3/4.',
    REALISM_RUBRIC,
    'Treat this as a reference sheet that another AI will use to keep this character consistent. Faces must be IDENTICAL across cells.',
  ].join('\n\n');
  const sheetBuf = await generateImageEdit({
    prompt: sheetPrompt,
    imageBuffers: [portraitBuf],
    size: '1536x1024',
    quality: 'medium',
  });
  await writeFile(join(workDir, 'sheet.png'), sheetBuf);
  const sheetUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/sheet.png`, sheetBuf, 'image/png');
  console.log(`[character:${job_id}] [B] ✓ ${sheetUrl}`);

  // ── Stage C · persona brief (locks identity across video reuses) ───────
  // Single Claude call → 9-field structured brief stored on the row.
  // Best-effort: if Claude is down or returns garbage, log + persist NULL
  // and let the Selfie pipeline fall back to the legacy thin extraction
  // — character creation must NEVER block on the brief.
  onProgress('persona_brief', { stage: 'persona_brief' });
  let personaBrief = null;
  try {
    personaBrief = await generatePersonaBrief({ description, jobId: job_id });
  } catch (err) {
    console.warn(`[character:${job_id}] persona-brief generation failed (non-fatal):`, err?.message ?? err);
  }

  // ── Persist ───────────────────────────────────────────────────────────
  onProgress('persist', { stage: 'persist' });
  const seedanceSeed = Math.floor(Math.random() * 2_147_483_647);
  let publicId = makePublicId();

  // Insert. On the astronomically unlikely chance of a public_id
  // collision (unique index), retry with a fresh id once.
  let internalId;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await db()
      .from('user_characters')
      .insert({
        user_id,
        name: display_name,
        source_kind: 'upload',
        source_image_url: photo_url,
        description,
        character_sheet_url: sheetUrl,
        portrait_url: portraitUrl,
        seedance_seed: seedanceSeed,
        voice_brief: voice_brief ?? null,
        preset_default: preset_default ?? null,
        public_id: publicId,
        sheet_job_id: job_id,
        persona_brief: personaBrief,
      })
      .select('id')
      .single();

    if (!error) {
      internalId = data.id;
      break;
    }
    // 23505 = unique_violation
    if (error.code === '23505' && attempt === 0) {
      publicId = makePublicId();
      continue;
    }
    throw new Error(`character insert failed: ${error.message ?? error.code ?? 'unknown'}`);
  }

  // Link the new character back onto the originating job so callers can
  // resolve "which character did this job create?" with one read.
  const { error: linkErr } = await db()
    .from('generation_jobs')
    .update({ character_id: internalId })
    .eq('id', job_id);
  if (linkErr) {
    // Non-fatal — the character row exists and is reachable via sheet_job_id.
    console.warn(`[character:${job_id}] could not stamp character_id on job:`, linkErr.message);
  }

  console.log(`[character:${job_id}] persisted ${publicId} (uuid=${internalId})`);

  return {
    character_id: publicId,
    internal_id: internalId,
    portrait_url: portraitUrl,
    sheet_url: sheetUrl,
    seedance_seed: seedanceSeed,
  };
}
