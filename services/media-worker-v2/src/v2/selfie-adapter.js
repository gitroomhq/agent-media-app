// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Selfie adapter.
 *
 * Translates the public Selfie API (SelfieSchema) into the five-stage
 * Selfie pipeline:
 *
 *   orchestrateSelfie        ->  prompts + assumptions (Claude)
 *   generatePortrait         ->  realistic portrait (gpt-image-2)
 *   generateCharacterSheet   ->  character sheet (gpt-image-2)
 *   generateWireframe        ->  photographic storyboard board (gpt-image-2)
 *   processCharacterVideo    ->  Seedance 2.0 reference-to-video + sub burn
 *
 * The orchestrator is responsible for filling missing creative details
 * with assumptions. The worker is responsible for executing the stages
 * and enforcing hard media guardrails.
 */

import { createClient } from '@supabase/supabase-js';
import { generateCharacterSheet } from '../character-sheets.js';
import { generateImageEdit, generateImageFromText } from '../openai-image-client.js';
import { r2Upload } from '../r2.js';
import { processCharacterVideo } from '../character-video-pipeline.js';
import { orchestrateSelfie } from './selfie-orchestrator.js';
import { buildVideoPrompt } from './realism.js';

const R2_BUCKET = 'generation-outputs';

const BODY_DETAIL_RE = /\b(tall|petite|slim|lean|athletic|muscular|stocky|broad-shouldered|broad shouldered|plus[- ]size|curvy|heavyset|overweight|underweight|average build|medium build)\b/gi;

function titleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Build the character-sheet prompt for gpt-image-2.
 *
 * @param {string} description  free-text description from the user
 * @param {object} [personaBrief]  optional 9-field locked persona from
 *   the orchestrator. When present, ALL 9 fields go into the prompt to
 *   lock identity across video reuses. When absent (legacy callers /
 *   saved characters without a brief), falls back to the thin
 *   age/gender/body extraction from `description`.
 */
export function buildCharacterSheetPrompt(description, personaBrief) {
  // Preferred path — full 9-field brief from the orchestrator.
  if (personaBrief && typeof personaBrief === 'object') {
    const lines = [];
    if (personaBrief.age) lines.push(`Age: ${personaBrief.age}`);
    if (personaBrief.ethnicity) lines.push(`Ethnicity: ${personaBrief.ethnicity}`);
    if (personaBrief.build) lines.push(`Build: ${personaBrief.build}`);
    if (personaBrief.hair) lines.push(`Hair: ${personaBrief.hair}`);
    if (personaBrief.face_features) lines.push(`Face: ${personaBrief.face_features}`);
    if (personaBrief.skin_tone) lines.push(`Skin: ${personaBrief.skin_tone}`);
    if (personaBrief.clothing) lines.push(`Outfit: ${personaBrief.clothing}`);
    if (personaBrief.energy) lines.push(`Default energy: ${personaBrief.energy}`);
    if (personaBrief.signature_mannerism) lines.push(`Signature mannerism: ${personaBrief.signature_mannerism}`);
    if (lines.length > 0) {
      return [
        'Create a full-body character sheet with multiple angles (front, 3/4, side, back).',
        'Maintain EXACT identity across all panels — same person every frame.',
        '',
        ...lines,
        '',
        'Lock every visible detail. This sheet is the identity reference for future video generations — drift here cascades downstream.',
      ].join('\n');
    }
  }

  // Legacy fallback — thin extraction from raw description.
  if (typeof description !== 'string' || !description.trim()) {
    return 'Create a full character sheet, including full body, and outfit for this person.';
  }

  const text = description.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const ageMatch = lower.match(/\b(\d{1,2})\s*(?:-?\s*year\s*-?\s*old|yo|y\/o)\b/);
  const genderMatch = lower.match(/\b(male|man|guy|female|woman|girl|non[- ]binary|nonbinary)\b/);
  const bodyDetails = [...new Set((text.match(BODY_DETAIL_RE) ?? []).map((v) => v.toLowerCase().replace(/\s+/g, ' ')))];

  const parts = [];
  if (ageMatch) parts.push(`${ageMatch[1]}yo`);
  if (ageMatch && genderMatch) {
    const between = text.slice(ageMatch.index + ageMatch[0].length, genderMatch.index).trim();
    const subjectContext = between
      .replace(/[,.;:()[\]{}]/g, ' ')
      .replace(/\b(with|and|who|that|creator|tiktok|ugc|influencer|person|guy|girl|man|woman|male|female)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (subjectContext) parts.push(titleCaseWords(subjectContext));
  }
  if (genderMatch) {
    const gender = genderMatch[1].replace('nonbinary', 'non-binary');
    parts.push(gender === 'man' || gender === 'guy' ? 'male' : gender === 'woman' || gender === 'girl' ? 'female' : gender);
  }
  parts.push(...bodyDetails);

  const brief = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!brief) {
    return 'Create a full character sheet, including full body, and outfit for this person.';
  }
  return `Create a full character sheet, including full body, and outfit for this person - ${brief}.`;
}

function cleanOneLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function buildWireframePrompt({
  orchestration,
  script,
  scene_action,
  setting,
  wardrobe,
  minimal_props,
} = {}) {
  const cleanScript = cleanOneLine(script);
  const cleanAction = cleanOneLine(scene_action);
  const cleanSetting = cleanOneLine(setting);
  const cleanWardrobe = cleanOneLine(wardrobe);
  const cleanAgentPrompt = cleanOneLine(orchestration?.wireframe_prompt);
  const props = Array.isArray(minimal_props)
    ? minimal_props.map(cleanOneLine).filter(Boolean).slice(0, 4)
    : [];

  const story = [
    cleanScript ? `the actor is saying: "${cleanScript}"` : null,
    cleanAction ? `while: ${cleanAction}` : null,
    cleanSetting ? `setting: ${cleanSetting}` : null,
    cleanWardrobe ? `wardrobe/outfit: ${cleanWardrobe}` : null,
    props.length ? `minimal props: ${props.join(', ')}` : null,
  ].filter(Boolean).join('; ');

  return [
    `Create a full photographic wireframe/storyboard board for this user story: ${story || 'the actor performs a short UGC selfie beat to camera'}.`,
    cleanAgentPrompt ? `Use this agent-generated frame plan for visual beats only; do not add new spoken dialogue beyond the exact script: ${cleanAgentPrompt}` : '',
    'Build 8-10 separate frames arranged as a clean grid on one image.',
    'Each frame must be a realistic photographic still, not a sketch, not pencil art, not line art, not a rough drawing.',
    'Show the same actor clearly in every frame, preserving the face, body, and outfit from the reference character sheet.',
    'Every frame should show a distinct visual beat: hook, setup, context, demonstration/action, reaction, proof/result, emotional shift, and closing reaction when relevant.',
    cleanScript
      ? 'Add a short explanation/caption for each frame inside the board: frame number, a spoken beat made only from words in the exact script, expression, gesture, and camera framing. Do not invent additional spoken lines, claims, offers, CTAs, or product promises.'
      : 'Add a short explanation/caption for each frame inside the board: frame number, action, expression, gesture, and camera framing. Do not invent spoken dialogue.',
    'Use real-world UGC lighting, natural facial expressions, small human gestures, and believable scene continuity.',
    'Face and skin must stay natural: no shiny/plastic face, no glowing light on the face, no beauty-filter glow.',
    'No visible phone, camera, mirror-phone, selfie arm, or outstretched arm toward the lens unless the user story explicitly requires it.',
    'This is a planning board image with multiple photographic frames and brief explanations; it is not the final video frame.',
  ].filter(Boolean).join(' ');
}

async function generatePortrait({ prompt, jobId, userId, onProgress }) {
  onProgress?.('portrait', { phase: 'painting' });
  console.log(`[portrait:${jobId}] prompt: ${prompt.substring(0, 220)}${prompt.length > 220 ? '...' : ''}`);
  // quality:'high' is required for face-realism work — 'medium' produces
  // visible plastic-skin artifacts on gpt-image-2. The portrait is the
  // seed reference for everything downstream, so any artifact here
  // propagates through the sheet, the wireframe, and the final video.
  const buf = await generateImageFromText({
    prompt,
    size: '1024x1024',
    quality: 'high',
  });
  onProgress?.('portrait', { phase: 'uploading' });
  const key = `${userId}/${jobId}/character-portrait.png`;
  const url = await r2Upload(R2_BUCKET, key, buf, 'image/png');
  console.log(`[portrait:${jobId}] uploaded -> ${url}`);
  return url;
}

/**
 * Photographic wireframe / storyboard board for the final video.
 *
 * Generated from the character sheet as a likeness reference and from
 * the orchestrator's scene plan. It is a multi-frame planning image
 * with short explanations, not a sketch and not a literal final frame.
 */
async function generateWireframe({ characterSheetUrl, prompt, jobId, userId, onProgress }) {
  onProgress?.('wireframe', { phase: 'starting' });
  // Pull the sheet down as a buffer so gpt-image-2 edits can use it as ref.
  const sheetResp = await fetch(characterSheetUrl);
  if (!sheetResp.ok) throw new Error(`wireframe: failed to fetch sheet (${sheetResp.status})`);
  const sheetBuf = Buffer.from(await sheetResp.arrayBuffer());

  console.log(`[wireframe:${jobId}] prompt: ${prompt}`);
  onProgress?.('wireframe', { phase: 'painting' });
  // quality:'high' so the panels themselves are photoreal — each frame
  // is what teaches Seedance the realism it should render in the video.
  const buf = await generateImageEdit({
    prompt,
    imageBuffers: [sheetBuf],
    size: '1024x1536',
    quality: 'high',
  });
  onProgress?.('wireframe', { phase: 'uploading' });
  const key = `${userId}/${jobId}/wireframe.png`;
  const url = await r2Upload(R2_BUCKET, key, buf, 'image/png');
  console.log(`[wireframe:${jobId}] uploaded -> ${url}`);
  return url;
}

let _supabase = null;
function db() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  _supabase = createClient(url, key);
  return _supabase;
}

async function loadSavedCharacter(publicId) {
  const { data, error } = await db()
    .from('user_characters')
    .select('character_sheet_url, archived_at, persona_brief, description')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error || !data) throw new Error(`character not found: ${publicId}`);
  if (data.archived_at) throw new Error(`character archived: ${publicId}`);
  if (!data.character_sheet_url) throw new Error(`character ${publicId} has no sheet`);
  return {
    character_sheet_url: data.character_sheet_url,
    persona_brief: data.persona_brief ?? null, // null for legacy rows (pre-migration)
    description: data.description ?? null,
  };
}

async function patchInputParams(jobId, patch) {
  try {
    const { data } = await db()
      .from('generation_jobs')
      .select('input_params')
      .eq('id', jobId)
      .maybeSingle();
    const next = { ...(data?.input_params ?? {}), ...patch };
    await db().from('generation_jobs').update({ input_params: next }).eq('id', jobId);
  } catch (err) {
    console.warn(`[selfie-adapter:${jobId}] input_params patch failed (non-fatal):`, err?.message ?? err);
  }
}

// buildActionPrompt was removed in the realism-cascade refactor. The
// triple-redundant locked-camera / no-phone hammering was killing
// realism. The Seedance video prompt is now generated by buildVideoPrompt
// from realism.js — it stays minimal because the character_sheet_url and
// storyboard_url references already encode identity, setting, and the
// full 9-point realism rubric. See realism.js for the rationale.

export async function processSelfie(params) {
  const {
    job_id,
    user_id,
    character_id,
    description,
    photo_url,
    script,
    scene_action,
    background_music,
    duration = 10,
    subtitles = true,
    // Optional realism overrides (Phase 1 of realism cascade fix).
    // Defaults are picked by the orchestrator when these are absent.
    shot_preset,
    vibe,
    camera_locked,
    phone_in_frame,
    polish,
    onProgress = () => {},
  } = params;

  if (!job_id) throw new Error('processSelfie: job_id required');
  if (!character_id && !description) {
    throw new Error('processSelfie: provide character_id or description');
  }
  if (!script && !scene_action) {
    throw new Error('processSelfie: provide script or scene_action');
  }

  // -- 0a. If reusing a saved character, load it FIRST so the
  // orchestrator can lock the scene to the saved persona's brief.
  // Legacy characters (created before the persona_brief migration)
  // have null brief — orchestrator generates a fresh one in that case.
  let savedCharacter = null;
  if (character_id) {
    savedCharacter = await loadSavedCharacter(character_id);
  }

  // -- 0b. Orchestration agent ---------------------------------------
  onProgress('orchestrator', { phase: 'planning' });
  const orchestration = await orchestrateSelfie({
    description: description ?? savedCharacter?.description ?? undefined,
    photo_url,
    character_id,
    script,
    scene_action,
    background_music,
    duration,
    subtitles,
    shot_preset,
    vibe,
    camera_locked,
    phone_in_frame,
    saved_persona_brief: savedCharacter?.persona_brief ?? undefined,
    jobId: job_id,
  });
  // Prefer the orchestrator's 9-field persona_brief over the legacy
  // age/gender/body extraction — locks identity across video reuses.
  const characterSheetPrompt = buildCharacterSheetPrompt(description, orchestration.persona_brief);
  const wireframePrompt = buildWireframePrompt({
    orchestration,
    script: orchestration.script ?? script,
    scene_action: orchestration.scene_action ?? scene_action,
    setting: orchestration.setting,
    wardrobe: orchestration.wardrobe,
    minimal_props: orchestration.minimal_props,
  });
  orchestration.character_sheet_prompt = characterSheetPrompt;
  orchestration.wireframe_prompt = wireframePrompt;

  await patchInputParams(job_id, {
    orchestration,
    portrait_prompt: orchestration.portrait_prompt,
    character_sheet_prompt: characterSheetPrompt,
    wireframe_prompt: wireframePrompt,
    seedance_prompt: orchestration.seedance_prompt,
    scene_action_resolved: orchestration.scene_action,
    setting_resolved: orchestration.setting,
    wardrobe_resolved: orchestration.wardrobe,
    minimal_props: orchestration.minimal_props,
    missing_details: orchestration.missing_details,
    assumptions: orchestration.assumptions,
  });

  // -- 1. Portrait + character sheet ---------------------------------
  let portrait_url = null;
  let character_sheet_url;
  if (character_id) {
    onProgress('load_character', { character_id });
    character_sheet_url = savedCharacter.character_sheet_url;
    console.log(`[selfie:${job_id}] reusing saved sheet -> ${character_sheet_url} (persona_brief=${savedCharacter.persona_brief ? 'present' : 'null'})`);
  } else {
    portrait_url = photo_url || await generatePortrait({
      prompt: orchestration.portrait_prompt,
      jobId: job_id,
      userId: user_id,
      onProgress,
    });
    await patchInputParams(job_id, { portrait_url });

    onProgress('sheet', { phase: 'starting' });
    character_sheet_url = await generateCharacterSheet({
      description,
      referenceImageUrl: portrait_url,
      sheetPrompt: characterSheetPrompt,
      jobId: job_id,
      userId: user_id,
      onPhase: (p) => onProgress('sheet', { phase: p }),
    });
    console.log(`[selfie:${job_id}] sheet -> ${character_sheet_url}`);
  }

  // -- 2. Wireframe (always - scene composition reference) ------------
  // Built from the character sheet + scene_action/script. Anchors the
  // Seedance shot to a locked-off, front-camera POV in the right scene.
  const wireframe_url = await generateWireframe({
    characterSheetUrl: character_sheet_url,
    prompt: wireframePrompt,
    jobId: job_id,
    userId: user_id,
    onProgress,
  });

  // Surface intermediate artifacts on the job row so /v1/videos/:id
  // can render the sheet + wireframe alongside the final video.
  await patchInputParams(job_id, {
    ...(portrait_url ? { portrait_url } : {}),
    character_sheet_url,
    wireframe_url,
  });

  // -- 3. Video -------------------------------------------------------
  onProgress('video', { phase: 'starting' });
  const finalScript = orchestration.script;
  const finalBackgroundMusic = orchestration.background_music;
  // Minimal Seedance prompt — see realism.js / buildVideoPrompt for why.
  // The character_sheet_url + storyboard_url references carry identity,
  // setting, wardrobe, lighting, and the full realism rubric. The video
  // prompt only needs to communicate: what's happening, what's said
  // (if any), what music is playing, how long.
  const action_prompt = buildVideoPrompt({
    action: orchestration.scene_action,
    script: finalScript,
    music: finalBackgroundMusic,
    duration,
  });
  await patchInputParams(job_id, { action_prompt });
  // Audio: enable when we want EITHER lip-synced speech (has script) OR
  // ambient music (background_music set). When neither, keep audio off
  // so Seedance can't hallucinate filler speech that Whisper later
  // burns into bogus subtitles. The action_prompt's "does NOT speak"
  // line further suppresses speech when only music is wanted.
  const hasScript = !!(finalScript && finalScript.trim());
  const hasMusic = finalBackgroundMusic !== undefined && finalBackgroundMusic !== false && finalBackgroundMusic !== null;
  const generate_audio = hasScript || hasMusic;
  const shouldBurnSubtitles = orchestration.subtitles && hasScript;

  const result = await processCharacterVideo({
    job_id,
    user_id,
    character_sheet_url,
    storyboard_url: wireframe_url,
    action_prompt,
    duration,
    aspect_ratio: '9:16',
    generate_audio,
    subtitle_style: shouldBurnSubtitles ? 'hormozi' : 'none',
    // Polish intensity forwarded — undefined falls through to the
    // pipeline's DEFAULT_POLISH_INTENSITY ('default').
    ...(polish !== undefined ? { polish } : {}),
  });

  return {
    video_url: result.video_url,
    videoUrl: result.video_url,
    portrait_url,
    portraitUrl: portrait_url,
    character_sheet_url,
    sheetUrl: character_sheet_url,
    wireframe_url,
    wireframeUrl: wireframe_url,
    orchestration,
  };
}
