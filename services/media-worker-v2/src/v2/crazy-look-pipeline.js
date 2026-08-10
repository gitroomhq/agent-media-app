// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Crazy Look pipeline.
 *
 * Silent extreme close-up reaction clip with a static caption overlay.
 * One character, one exaggerated expression held into the lens for
 * 5–10s, the hook text burned over the full clip. No speech, no
 * lip-sync, no TTS, no orchestrator LLM call — the look preset + the
 * caption fully determine every stage, which is what makes this the
 * cheapest and fastest video generator in the v2 registry.
 *
 *   Stage A · gpt-image-2 → portrait          (inline-character mode only)
 *   Stage B · gpt-image-2 → character sheet   (inline-character mode only)
 *   Stage C · gpt-image-2 → expression frame  (extreme close-up wireframe)
 *   Stage D · Seedance 2.0 ref-to-video       (ambient audio, no dialogue)
 *   Stage E · polish pass                     (grain + warm grade — lo-fi
 *                                              authenticity is load-bearing here)
 *   Stage F · static caption burn             (one ASS event, 0 → duration)
 *
 * Saved-character mode reuses the cached portrait/sheet/seed from
 * user_characters — the pinned seed is what keeps the SAME face across
 * a whole posting series, which is the entire format.
 */

import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

import { generateImageFromText, generateImageEdit } from '../openai-image-client.js';
import { runGeneration } from '../evolink-client.js';
import { r2Upload } from '../r2.js';
import { fetchToBuffer } from './http.js';
import { REALISM_RUBRIC } from './realism.js';
import { polishVideo, isPolishActive, DEFAULT_POLISH_INTENSITY } from './polish-pass.js';

const execFileAsync = promisify(execFile);

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
 * Same contract as the Selfie pipeline's loader.
 */
const CHARACTER_COLUMNS = 'id, public_id, portrait_url, character_sheet_url, seedance_seed, archived_at';

async function loadCharacter(publicId) {
  // signature_look lands in 20260809140000_character_signature_look.sql.
  // Until that migration is applied the column doesn't exist and
  // PostgREST 400s the whole select, so fall back rather than break
  // every generation on an un-migrated database.
  let { data, error } = await db()
    .from('user_characters')
    .select(`${CHARACTER_COLUMNS}, signature_look`)
    .eq('public_id', publicId)
    .maybeSingle();
  if (error && /signature_look/.test(error.message ?? '')) {
    console.warn('[crazy-look] signature_look column missing — run the migration; using derived signature');
    ({ data, error } = await db()
      .from('user_characters')
      .select(CHARACTER_COLUMNS)
      .eq('public_id', publicId)
      .maybeSingle());
  }
  if (error) throw new Error(`character lookup failed: ${error.message}`);
  if (!data) throw new Error(`character not found: ${publicId}`);
  if (data.archived_at) throw new Error(`character archived: ${publicId}`);
  if (!data.portrait_url || !data.character_sheet_url || data.seedance_seed == null) {
    throw new Error(`character ${publicId} is missing v2 fields (portrait/sheet/seed). Re-create via /v2/characters.`);
  }
  return data;
}

// ── Constants ─────────────────────────────────────────────────────────────
const R2_BUCKET = 'generation-outputs';
const SEEDANCE_MODEL = 'seedance-2.0-reference-to-video';
const DEFAULT_QUALITY = '720p';
const DEFAULT_ASPECT = '9:16';

// ── Look preset briefs ────────────────────────────────────────────────────
// Keys mirror V2_LOOK_PRESETS in @agentmedia/schema/v2 (crazy-look.ts).
// Same split as shot presets: keys in the schema, prompt briefs here.
//   pose:   the frozen expression for the Stage C wireframe still
//   action: the motion direction for the Stage D Seedance prompt
const LOOK_BRIEFS = {
  'bug-eyed-shock': {
    pose: 'eyes impossibly wide, brows shot up, mouth slightly open in a frozen silent gasp',
    action: 'holds the wide-eyed stare into the lens, tiny incredulous head shake, one slow blink near the end',
  },
  'jaw-drop': {
    pose: 'jaw fully dropped open in silent disbelief, eyes wide, one hand starting to rise toward the mouth',
    action: 'jaw stays dropped, the hand comes up to cover the mouth, eyes flick up and back to the lens',
  },
  'unhinged-grin': {
    pose: 'huge unhinged open-mouth grin, eyes crinkled almost shut with delight',
    action: 'the grin widens even further, shoulders shake with silent laughter, leans slightly closer to the camera',
  },
  'deadpan-stare': {
    pose: 'completely flat expression, lips pressed together, dead-eyed stare straight into the lens',
    action: 'holds the dead stare without moving, one extremely slow blink, the faintest single eyebrow raise at the end',
  },
  'eyes-rolled-up': {
    pose: 'eyes rolled up toward the ceiling mid-exasperation, head tilted back slightly',
    action: 'eyes stay rolled up through a long exhausted silent sigh, then the head drops back down to face the lens',
  },
  'suspicious-squint': {
    pose: 'eyes narrowed in exaggerated suspicion, one brow arched high, lips pursed to one side',
    action: 'squints harder, leans in toward the lens as if inspecting it, ends on a slow distrustful nod',
  },
  'crying-smile': {
    pose: 'smiling through an almost-crying scrunched face, brows pinched together, eyes glassy',
    action: 'the smile keeps breaking toward crying and recovering, fans their face with one hand',
  },
  'lean-in-conspiracy': {
    pose: 'leaned in very close to the lens, eyes darting sideways, conspiratorial half-smile',
    action: 'glances over each shoulder, leans even closer until the face nearly fills the lens, slow knowing nod',
  },
  'guilty-pout': {
    pose: 'exaggerated guilty pout, chin tucked, eyes looking up into the lens like a kid caught red-handed',
    action: 'holds the pout, slow shrug with both palms turned up, bites lower lip fighting back a smile',
  },
  'slow-realization': {
    // Pose must be a PEAK — it is literally frame one. The morph lives in
    // the action, not in a calm opening frame.
    pose: 'eyes flying wide in dawning realization, brows shot up, mouth falling open mid-gasp, one hand rising toward the side of the head',
    action: 'the realization keeps deepening — eyes widen further, the hand reaches the head, the mouth opens more',
  },
  'sweet-smile': {
    pose: 'huge warm genuine smile, eyes crinkled with delight, chin slightly tucked',
    action: 'the smile keeps blooming wider, a happy little shoulder wiggle, eyes stay locked warmly on the lens',
  },
  'giggle-fit': {
    pose: 'mid-laugh with the mouth wide open, eyes squeezed nearly shut, head starting to tip back',
    action: 'silent laughter shakes the shoulders, head tips back and comes down, wipes the corner of one eye',
  },
};

const LOOK_KEYS = Object.keys(LOOK_BRIEFS);

// ── Beat pool ─────────────────────────────────────────────────────────────
// Micro-actions sampled per job to keep the expression MOVING. The look
// preset anchors the open and close of the arc; chaos decides how many
// of these get woven in between, and how frantically.
const BEAT_POOL = [
  'both eyebrows pop up, then knit together hard',
  'mouth drops open, snaps shut, then opens again even wider',
  'silently mouths a wordless "WHAT" with exaggerated lips',
  'eyes dart left, then right, then snap back to the lens',
  'head tilts sharply to one side, then slowly straightens',
  'a hand flies up to the cheek, fingers spread',
  'leans suddenly closer to the lens, then eases back',
  'blinks twice fast, then holds the eyes open even wider',
  'nose scrunches and the upper lip curls in disbelief',
  'a slow head shake builds into a fast little shake',
  'presses lips together fighting a grin that breaks through anyway',
  'chin drops and the eyes look up into the lens',
];

// ── Framing rotation ──────────────────────────────────────────────────────
// Crop levels observed on reference accounts: same identity, rotated
// framings, so a high-volume series never reads as one repeated video.
// `weight` drives the omitted-input sampler. Macro crops (eyes-only,
// mouth-only, nose-up) are weight 0 — EXPLICIT-ONLY. Sampled onto a
// fresh face they hide the likeness and the reaction (a 5s giant
// mouth, learned the hard way on 2026-08-09); they're series spice an
// operator pins deliberately, not a default.
const FRAMING_BRIEFS = {
  'full-face': {
    weight: 70,
    frame: 'Tight selfie framing with HEADROOM: the face sits in the lower two-thirds of the frame (eyes near the vertical midline, clear space above the head for overlay text), filling 50–65% of the frame',
  },
  'eyes-only': {
    weight: 0,
    frame: 'EXTREME macro crop of the upper face: eyes and eyebrows fill the frame edge to edge, mouth and chin out of frame below, top of the head cropped out',
  },
  'mouth-only': {
    weight: 0,
    frame: 'EXTREME macro crop of the lower face: mouth, teeth and chin fill the frame edge to edge, the eyes are out of frame above',
  },
  'nose-up': {
    weight: 0,
    frame: 'Macro crop from the nose upward: eyes centered and huge in the frame, forehead visible, mouth out of frame below',
  },
  'medium': {
    weight: 30,
    frame: 'Head-and-shoulders selfie framing: face in the upper-middle of the frame with the room clearly visible behind, like a casual FaceTime call',
  },
};
const FRAMING_KEYS = Object.keys(FRAMING_BRIEFS);
const FRAMING_TOTAL_WEIGHT = FRAMING_KEYS.reduce((n, k) => n + FRAMING_BRIEFS[k].weight, 0);

/**
 * Resolve the `framing` input to a {key, frame} brief. Explicit key, or
 * weighted random when omitted (full-face most likely). `rand`
 * injectable for tests.
 */
export function resolveFraming(framing, rand = Math.random) {
  if (framing) {
    const brief = FRAMING_BRIEFS[framing];
    if (!brief) throw new Error(`unknown framing "${framing}" (one of: ${FRAMING_KEYS.join(', ')})`);
    return { key: framing, frame: brief.frame };
  }
  let roll = rand() * FRAMING_TOTAL_WEIGHT;
  for (const key of FRAMING_KEYS) {
    const w = FRAMING_BRIEFS[key].weight;
    if (w <= 0) continue; // explicit-only framings never sample
    roll -= w;
    if (roll <= 0) return { key, frame: FRAMING_BRIEFS[key].frame };
  }
  return { key: 'full-face', frame: FRAMING_BRIEFS['full-face'].frame };
}

/**
 * Build the dynamic expression arc for the Seedance prompt.
 * chaos 0..1: 0 = one extra beat, gradual; 1 = four extra beats, frantic.
 * `rand` is injectable for tests.
 */
export function buildActionArc(brief, chaos = 0.6, rand = Math.random) {
  const c = Math.min(1, Math.max(0, Number.isFinite(chaos) ? chaos : 0.6));
  const beatCount = 1 + Math.round(c * 3); // 1..4 sampled beats
  const pool = [...BEAT_POOL];
  const beats = [];
  for (let i = 0; i < beatCount && pool.length > 0; i++) {
    beats.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const tempo =
    c < 0.34 ? 'The changes are smooth and gradual.'
    : c < 0.67 ? 'The changes land as distinct, punchy beats.'
    : 'The changes are fast, jittery and unhinged — almost too much.';
  return [
    `FRAME ONE IS ALREADY THE FULL EXPRESSION: ${brief.pose} — at 0.0 seconds, before any motion, the face is already at maximum intensity, exactly as in the reference image. There is NO build-up, NO neutral opening, NO easing into it, NO calm first beat.`,
    'From that peak the expression keeps CHANGING, one moment after another IN TIME, within the same single continuous shot — but it NEVER relaxes back to a neutral or resting face.',
    ...beats.map((b) => `Then ${b}.`),
    `Throughout, ${brief.action}.`,
    tempo,
  ].join(' ');
}

/**
 * The character's SIGNATURE look — deterministic from character_id, so
 * every clip of that person opens on the same face. This is the format's
 * whole identity: the reference account is recognisable in-feed because
 * the same human makes the same bug-eyed face every single time. A
 * per-clip random look destroyed that (a saved character came out
 * shocked, then pouting, then giggling — three different personas).
 *
 * Derived, not stored, so it needs no migration and never drifts out of
 * sync with the row. Explicit `look` always wins.
 */
export function signatureLookFor(characterId) {
  let h = 2166136261;
  for (let i = 0; i < characterId.length; i++) {
    h ^= characterId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return LOOK_KEYS[Math.abs(h) % LOOK_KEYS.length];
}

/**
 * Resolve the `look` input to a {key, pose, action} brief.
 *   - registered preset key → its brief
 *   - "custom:<text>"       → freetext used for both pose and action
 *   - omitted + character_id → that character's SIGNATURE look (stable
 *                              across every clip of them, forever)
 *   - omitted + no character → random preset (one-off tests only)
 */
export function resolveLook(look, characterId, storedSignature) {
  // Precedence: explicit per-job look > the character's PINNED
  // signature (operator's choice, persisted on the row) > a signature
  // derived from the id > random (one-off, no character).
  if (!look && storedSignature) {
    const brief = resolveLook(storedSignature);
    return { ...brief, signature: true, pinned: true };
  }
  if (!look && characterId) {
    const key = signatureLookFor(characterId);
    return { key, signature: true, ...LOOK_BRIEFS[key] };
  }
  if (!look) {
    const key = LOOK_KEYS[Math.floor(Math.random() * LOOK_KEYS.length)];
    return { key, ...LOOK_BRIEFS[key] };
  }
  if (LOOK_BRIEFS[look]) {
    return { key: look, ...LOOK_BRIEFS[look] };
  }
  if (look.startsWith('custom:')) {
    const text = look.slice('custom:'.length).trim();
    return {
      key: look,
      pose: `${text} — frozen at its most extreme, exaggerated moment`,
      action: `${text}, played silently straight into the lens`,
    };
  }
  throw new Error(`unknown look "${look}" (use a registered preset or "custom:<text>")`);
}

// ── Static caption (ASS) ──────────────────────────────────────────────────

function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAss(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/**
 * Strip emoji and pictographs from caption text. The burn font
 * (Liberation Sans) has no emoji coverage, so every 😭💛 rendered as an
 * empty tofu box in production captions (caught by an agent QA pass on
 * 2026-08-09). Removing them beats shipping boxes; a color-emoji
 * fallback font in the worker image can lift this later.
 */
export function stripUnrenderableGlyphs(text) {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}

/**
 * Build an ASS file with ONE dialogue event spanning the whole clip —
 * the TikTok-style static hook caption. White, black outline + soft
 * shadow, wrapped, sitting in the upper-middle of the 9:16 frame
 * (clear of both the face's eyes and any platform UI).
 *
 * Explicit "\n" in the caption becomes a forced line break; otherwise
 * WrapStyle 0 smart-wraps inside the margins.
 *
 * @param {string} caption
 * @param {number} durationSec
 * @returns {string} ASS file contents
 */
export function buildStaticCaptionAss(caption, durationSec) {
  const text = escapeAss(stripUnrenderableGlyphs(caption)).replace(/\r?\n/g, '\\N');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Alignment 8 = top-center; MarginV 250/1920 ≈ 13% down ⇒ over the
    // forehead/background headroom, NEVER the eyes — the crazy eyes ARE
    // the content. Fontsize 54/1920 ≈ 2.8% per line ≈ TikTok-native
    // caption scale (measured off reference accounts), light outline.
    'Style: Caption,Liberation Sans,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,8,110,110,250,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,${toAssTime(0)},${toAssTime(durationSec)},Caption,,0,0,0,,${text}`,
    '',
  ].join('\n');
}

/**
 * Burn the static caption into the clip. Keeps the audio track
 * untouched (-c:a copy) so the ambient room tone survives.
 */
async function burnStaticCaption(inputPath, outputPath, caption, durationSec, workDir) {
  const assPath = join(workDir, 'caption.ass');
  await writeFile(assPath, buildStaticCaptionAss(caption, durationSec), 'utf8');
  // ffmpeg subtitles filter needs paths escaped — colon and apostrophe
  // are filter syntax.
  const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', `subtitles='${safeAssPath}'`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

// ── Prompt builders ───────────────────────────────────────────────────────

function buildWireframePrompt({ pose, frame, duration }) {
  return [
    'Compose a single iPhone front-camera still of the SAME PERSON shown in the reference sheet. ONE frame, vertical 9:16.',
    `${frame}. Gaze locked straight into the lens. Expression: ${pose}.`,
    'CRITICAL: the expression is ALREADY AT ITS ABSOLUTE PEAK in this frame — maximum intensity, fully committed, as extreme as it gets. NOT a neutral face, NOT a calm face, NOT the beginning of a reaction. The peak IS the starting point.',
    'Ordinary home setting barely visible behind them (bedroom, hallway, or living room), everyday indoor lighting, slight amateur handheld imperfection.',
    `This frame is the VERY FIRST frame of a ${duration}-second silent reaction video — the viewer sees this exact face at 0.0 seconds.`,
    '',
    REALISM_RUBRIC,
  ].join('\n');
}

function buildCrazyLookVideoPrompt({ arc, frame, duration }) {
  return [
    `ONE continuous unbroken handheld vertical iPhone front-camera shot of ONE person, ${duration} seconds. ${frame}. Camera nearly static.`,
    'The frame is a single full-bleed shot at all times — absolutely NO split-screen, NO grid, NO collage, NO side-by-side panels, NO picture-in-picture, NO montage cuts.',
    `The person never speaks real words — any mouth movement is silent mouthing, gasping or grimacing. ${arc}`,
    'Audio: natural ambient room tone only. No music, no dialogue, no voiceover.',
  ].join(' ');
}

/**
 * Generate a Crazy Look clip end to end.
 *
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} [params.character_id]  — saved character (preferred for series)
 * @param {string} [params.photo_url]     — inline-character mode, likeness ref
 * @param {string} [params.description]   — inline-character mode
 * @param {string} params.caption         — the hook text, burned over the full clip
 * @param {string} [params.look]          — preset key | "custom:<text>" | omitted ⇒ random
 * @param {number} [params.duration]      — 5 | 10 (seconds)
 * @param {number} [params.chaos]         — 0..1 freedom: how wildly the expression evolves (default 0.6)
 * @param {string} [params.polish]        — off | default | heavy
 * @param {number} [params.seed]          — pinned integer; falls back to the character's seed
 * @param {(stage: string, meta?: object) => void} [params.onProgress]
 * @returns {Promise<{
 *   videoUrl: string,
 *   portraitUrl: string,
 *   sheetUrl: string,
 *   wireframeUrl: string,
 *   seed: number,
 *   look: string,
 *   prompts: object,
 * }>}
 */
export async function processCrazyLook(params) {
  const {
    job_id,
    user_id,
    character_id,
    photo_url,
    description,
    caption,
    look,
    framing,
    duration = 5,
    chaos,
    polish = DEFAULT_POLISH_INTENSITY,
    seed: callerSeed,
    onProgress = () => {},
  } = params;

  if (!job_id) throw new Error('processCrazyLook: job_id is required');
  if (!caption || !String(caption).trim()) {
    throw new Error('processCrazyLook: caption is required — it IS the content');
  }
  const usingSavedCharacter = !!character_id;
  if (!usingSavedCharacter && !description) {
    throw new Error('processCrazyLook: provide character_id, OR description (with optional photo_url)');
  }

  let brief = resolveLook(look, character_id); // refined after the character row loads
  const framingBrief = resolveFraming(framing);
  const workDir = await mkdtemp(join(tmpdir(), `crazy-look-${job_id}-`));
  const r2Prefix = `crazy-look/${job_id}`;
  const prompts = {};

  // ── Resolve character (same two paths as Selfie) ──────────────────────
  let portraitUrl;
  let sheetUrl;
  let portraitBuf; // inline mode only — ref for Stage B
  let sheetBuf;    // ref for Stage C in both modes
  let seed;

  if (usingSavedCharacter) {
    onProgress('load', { stage: 'load_character', character_id });
    console.log(`[crazy-look:${job_id}] [load] resolving ${character_id}…`);
    const char = await loadCharacter(character_id);
    portraitUrl = char.portrait_url;
    sheetUrl = char.character_sheet_url;
    seed = callerSeed ?? Number(char.seedance_seed);
    sheetBuf = await fetchToBuffer(sheetUrl);
    if (!look && char.signature_look) {
      brief = resolveLook(look, character_id, char.signature_look);
      console.log(`[crazy-look:${job_id}] [load] pinned signature look: ${brief.key}`);
    }
    console.log(`[crazy-look:${job_id}] [load] ✓ sheet=${sheetUrl} seed=${seed} look=${brief.key}`);
  } else {
    seed = callerSeed ?? Math.floor(Math.random() * 2_147_483_647);

    // ── Stage A · portrait ────────────────────────────────────────────
    onProgress('A', { stage: 'portrait' });
    prompts.portrait = [
      `Hyper-realistic iPhone front-camera selfie portrait of: ${description}.`,
      'Face centered and close to the lens, looking straight into the camera, relaxed neutral expression, everyday home lighting.',
      '',
      REALISM_RUBRIC,
    ].join('\n');
    console.log(`[crazy-look:${job_id}] [A] portrait…`);
    if (photo_url) {
      const refBuf = await fetchToBuffer(photo_url);
      portraitBuf = await generateImageEdit({
        prompt: prompts.portrait,
        imageBuffers: [refBuf],
        size: '1024x1536',
        quality: 'medium',
      });
    } else {
      portraitBuf = await generateImageFromText({
        prompt: prompts.portrait,
        size: '1024x1536',
        quality: 'medium',
      });
    }
    portraitUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/portrait.png`, portraitBuf, 'image/png');
    console.log(`[crazy-look:${job_id}] [A] ✓ ${portraitUrl}`);

    // ── Stage B · character sheet ─────────────────────────────────────
    onProgress('B', { stage: 'sheet' });
    prompts.sheet = [
      'Create a character sheet of the same person shown in the reference image.',
      'A multi-pose, multi-expression grid on a clean off-white background. Same face, same hair, same identity in every cell. Include several EXAGGERATED expressions (shock, delight, suspicion, deadpan). Wardrobe and hairstyle as shown in the reference portrait.',
    ].join('\n\n');
    console.log(`[crazy-look:${job_id}] [B] character sheet…`);
    sheetBuf = await generateImageEdit({
      prompt: prompts.sheet,
      imageBuffers: [portraitBuf],
      size: '1536x1024',
      quality: 'medium',
    });
    sheetUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/sheet.png`, sheetBuf, 'image/png');
    console.log(`[crazy-look:${job_id}] [B] ✓ ${sheetUrl}`);
  }

  // ── Stage C · expression frame (wireframe) ────────────────────────────
  onProgress('C', { stage: 'wireframe', look: brief.key, signature_look: brief.signature === true, framing: framingBrief.key });
  prompts.wireframe = buildWireframePrompt({ pose: brief.pose, frame: framingBrief.frame, duration });
  console.log(`[crazy-look:${job_id}] [C] expression frame (look=${brief.key})…`);
  const wireBuf = await generateImageEdit({
    prompt: prompts.wireframe,
    imageBuffers: [sheetBuf],
    size: '1024x1536',
    quality: 'medium',
  });
  const wireUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/wireframe.png`, wireBuf, 'image/png');
  console.log(`[crazy-look:${job_id}] [C] ✓ ${wireUrl}`);

  // ── Stage D · Seedance 2.0 ref-to-video ───────────────────────────────
  // Ambient audio stays ON (room tone) — the "silent" in the format
  // means no speech, not a dead audio track. Music is excluded via the
  // prompt; creators layer trending sounds on top themselves.
  onProgress('D', { stage: 'seedance' });
  prompts.video = buildCrazyLookVideoPrompt({ arc: buildActionArc(brief, chaos), frame: framingBrief.frame, duration });
  console.log(`[crazy-look:${job_id}] [D] Seedance prompt: ${prompts.video}`);
  console.log(`[crazy-look:${job_id}] [D] Seedance 2.0 (seed=${seed}, ${duration}s)…`);
  const providerUrl = await runGeneration(
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
  console.log(`[crazy-look:${job_id}] [D] ✓ ${providerUrl}`);

  const rawPath = join(workDir, 'raw.mp4');
  await writeFile(rawPath, await fetchToBuffer(providerUrl));

  // ── Stage E · polish pass ─────────────────────────────────────────────
  let stagedPath = rawPath;
  if (isPolishActive(polish)) {
    onProgress('E', { stage: 'polish', intensity: polish });
    const polishedPath = join(workDir, 'polished.mp4');
    console.log(`[crazy-look:${job_id}] [E] polish (${polish})…`);
    await polishVideo(rawPath, polishedPath, { intensity: polish });
    stagedPath = polishedPath;
    console.log(`[crazy-look:${job_id}] [E] ✓ polished`);
  }

  // ── Stage F · static caption burn ─────────────────────────────────────
  onProgress('F', { stage: 'caption' });
  const finalPath = join(workDir, 'final.mp4');
  console.log(`[crazy-look:${job_id}] [F] burning static caption…`);
  await burnStaticCaption(stagedPath, finalPath, String(caption), duration, workDir);
  console.log(`[crazy-look:${job_id}] [F] ✓ caption burned`);

  // ── Upload + return ───────────────────────────────────────────────────
  onProgress('upload', { stage: 'upload' });
  const finalBuf = await readFile(finalPath);
  const videoUrl = await r2Upload(R2_BUCKET, `${r2Prefix}/video.mp4`, finalBuf, 'video/mp4');
  console.log(`[crazy-look:${job_id}] ✓ ${videoUrl}`);

  return {
    videoUrl,
    portraitUrl,
    sheetUrl,
    wireframeUrl: wireUrl,
    seed,
    look: brief.key,
    signatureLook: brief.signature === true,
    framing: framingBrief.key,
    prompts,
  };
}
