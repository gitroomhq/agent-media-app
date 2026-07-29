// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Realism scaffolder.
 *
 * Single source of truth for the 9-point realism rubric and the shot-
 * grammar preset library. Every gpt-image-2 / Seedance call in the v2
 * pipeline routes through `buildScaffoldedPrompt()` so realism never
 * relies on the caller remembering to inject the right modifiers.
 *
 * Locked in v1:
 *   - the 9-point rubric is constant
 *   - the 20 shot presets are constant
 *   - the shot library expresses each preset as named building blocks
 *     (setting · lighting · outfit · posture · free-hand action)
 *
 * The pipeline never embeds prose prompts directly. It composes them
 * from this module so when we tune the rubric, every clip we render
 * after that point picks up the new wording — zero per-pipeline edits.
 */

// ── The 9-point realism rubric, baked into every prompt ───────────────────
export const REALISM_RUBRIC = `Critical realism rules (must all be visible in the frame):
- skin shows pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb), realistic shadows;
- stable iPhone-like framing by default (no noticeable shake/drift), with slight off-axis angle (about 5-12 degrees) and imperfect centering;
- 9:16 vertical, looks like raw iPhone footage, NOT a studio shot;
- NO plastic AI sheen, NO uncanny symmetry, NO ultra-smoothed skin;
- NO shiny/plastic face, NO glowing light on the face, NO beauty-filter glow;
- subtle asymmetry: head tilt, blink, micro-expressions;
- hands are always doing something — gesturing, holding a product, adjusting clothing, or otherwise occupied (never limp at the sides);
- mouth caught mid-syllable when talking, not closed and not open-smile;
- eyes slightly off-center to camera, not a dead stare;
- no visible phone, selfie-stick, or outstretched selfie arm unless explicitly requested.`;

// ── Shot-grammar preset library (20 named presets) ────────────────────────
//
// Each preset is a fully composed brief — setting + lighting + outfit +
// posture + free-hand action. The shape is intentionally prose, not a
// struct, because Seedance + gpt-image-2 read prose better than tags.
//
// Add a preset → add a row here. Same key MUST exist in
// packages/schema/src/v2/selfie.ts's V2_SHOT_PRESETS array.
// Presets describe SETTING + LIGHTING only. Outfit, hand action, hair
// styling and any gendered styling come from the brief (description +
// scene_action + wardrobe) so the preset never conflicts with the
// character's actual gender, age, or style. Earlier versions baked
// "Outfit: halter, free hand at necklace" into every preset which
// produced a man in a halter top when the brief said male.
export const SHOT_PRESETS = {
  'bedroom-morning-ritual':
    'Setting: bedroom corner with the bed visible in frame. Lighting: soft window daylight on one side + warm bedside-lamp glow on the other.',
  'getting-ready-mirror-edge':
    'Setting: dresser or vanity, the edge of a mirror visible in frame. Lighting: soft daylight from an off-screen window.',
  'bathroom-skincare-routine':
    'Setting: bathroom counter, the edge of a mirror visible. Lighting: soft cool-daylight overhead + warm vanity bulb fill.',
  'bedside-lamp-evening':
    'Setting: bed corner, slightly disheveled bedding. Lighting: warm bedside-lamp glow, room mostly dark beyond.',

  'kitchen-glow-up':
    'Setting: kitchen counter + the edge of a cabinet. Lighting: bright daylight from a kitchen window.',
  'backyard-morning-coffee':
    'Setting: garden, patio, or back step. Lighting: warm direct morning sun, sun-streaks across the face.',
  'picnic-blanket-outdoor':
    'Setting: grass with a picnic blanket spread out. Lighting: bright open sun, slight haze.',

  'car-quick-honest-review':
    "Setting: driver's seat of a parked car, seatbelt visible across the chest. Lighting: daylight through the windshield.",
  'car-passenger-honest':
    'Setting: passenger seat of a car. Lighting: soft side-window light, slightly cooler tone.',
  'outdoor-walking-talking':
    'Setting: sidewalk or path, slight motion. Lighting: golden hour, warm sun raking across the face.',

  'couch-haul-show-off':
    'Setting: couch corner, throw cushions visible. Lighting: warm interior lamp + ambient room light.',
  'closet-fit-check':
    'Setting: in front of a clothes rack, edge of a full-length mirror visible. Lighting: bright bedroom daylight.',
  'studio-apartment-tour':
    'Setting: lived-in studio-apartment vibe — bookshelf or throw blanket visible in the background. Lighting: warm interior, single lamp glow.',
  'balcony-evening-vibes':
    'Setting: balcony railing with city blur behind. Lighting: warm golden-hour or string-light glow.',

  'desk-wfh-quick-pitch':
    'Setting: desk corner with a laptop edge in frame. Lighting: monitor glow on the face + cool ambient.',
  'cafe-window-seat':
    'Setting: cafe window seat with a coffee cup visible. Lighting: bright daylight from the window.',
  'office-bathroom-discreet':
    'Setting: corporate-style bathroom mirror. Lighting: cool overhead office fluorescents + warmer vanity light.',

  'gym-post-workout':
    'Setting: locker room or gym mirror. Lighting: cool gym fluorescents.',
  'salon-mirror-result':
    'Setting: hair salon mirror, towel and styling tools visible on the counter. Lighting: bright salon overheads + warm fill.',
  'travel-hotel-room-review':
    'Setting: hotel bed corner with a suitcase visible. Lighting: warm room lamp + soft daylight from the curtain edge.',
};

// ── Vibe modifiers ────────────────────────────────────────────────────────
export const VIBE_MODIFIERS = {
  excited: 'Tone: warm, casually excited, micro-smile, slightly raised eyebrows.',
  calm:    'Tone: calm, slow blink, soft eyes, measured delivery.',
  sassy:   'Tone: sassy, sideways glance, smirk at the corner of the mouth.',
  serious: 'Tone: focused, minimal smile, steady eye contact.',
  curious: 'Tone: curious, slight head tilt, open mouth between sentences.',
};

/**
 * Resolve a preset key (or a `custom-scene:<text>` escape hatch) into a
 * prose brief that goes into prompts.
 */
export function resolveShotBrief(presetKey) {
  if (typeof presetKey !== 'string') {
    throw new Error('preset key must be a string');
  }
  if (presetKey.startsWith('custom-scene:')) {
    const custom = presetKey.slice('custom-scene:'.length).trim();
    if (!custom) throw new Error('custom-scene: requires a non-empty description');
    return custom;
  }
  const brief = SHOT_PRESETS[presetKey];
  if (!brief) {
    throw new Error(`unknown shot preset "${presetKey}". Did you mean to use custom-scene:<text>?`);
  }
  return brief;
}

export function resolveVibeBrief(vibe) {
  return VIBE_MODIFIERS[vibe] ?? VIBE_MODIFIERS.excited;
}

/**
 * Build a prompt that bakes in the realism rubric + the shot brief +
 * any caller-supplied stage-specific lines.
 *
 * Use for the IMAGE stages (portrait, sheet, wireframe). These need
 * the full rubric because gpt-image-2 has to generate the realism
 * details from scratch.
 *
 * DO NOT use for Stage D (Seedance video) — the references already
 * encode everything the rubric describes (skin pores, lighting,
 * camera framing). Repeating it in the video prompt bloats the call
 * and confuses the model. For Stage D use buildVideoPrompt() below.
 *
 * @param {object} args
 * @param {string} args.preset       — shot preset key, e.g. 'bedroom-morning-ritual'
 * @param {string} [args.vibe]       — one of VIBE_MODIFIERS, defaults to 'excited'
 * @param {string} [args.voiceBrief] — natural-language voice direction (image stages: ignored)
 * @param {string[]} args.lines      — stage-specific instructional lines, in order
 */
export function buildScaffoldedPrompt({ preset, vibe = 'excited', voiceBrief, lines }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('buildScaffoldedPrompt: lines is required');
  }
  const parts = [
    ...lines,
    resolveShotBrief(preset),
    resolveVibeBrief(vibe),
  ];
  if (voiceBrief) parts.push(voiceBrief);
  parts.push(REALISM_RUBRIC);
  return parts.join('\n\n');
}

/**
 * Minimal prompt for Stage D (Seedance video). The references (sheet +
 * wireframe) carry all the realism, identity, setting, and styling.
 * Seedance just needs to know: what's happening, what's said (if any),
 * what's playing, how long.
 *
 * @param {object} args
 * @param {string} args.action     — what the person is doing (scene_action, or "talking to camera")
 * @param {string} [args.script]   — verbatim line if speaking; empty/undefined for non-speech
 * @param {string} [args.music]    — background-music direction; null/undefined for none
 * @param {number} args.duration   — seconds (5/10/15)
 */
export function buildVideoPrompt({ action, script, music, duration }) {
  // Emit caller-supplied action/script/music plus one mandatory quality
  // guardrail line for Seedance 2's face lighting/skin behavior.
  const lines = [
    `The person in the reference images: ${action}.`,
    'CRITICAL for Seedance 2: facial skin and lighting must stay natural and realistic — no shiny/plastic face, no glowing light on the face, no beauty-filter glow.',
  ];
  if (script && script.trim()) {
    lines.push(`They say, exactly: "${script}".`);
  }
  if (music) {
    lines.push(`Background audio: ${music}.`);
  }
  lines.push(`9:16 vertical, ${duration}s.`);
  return lines.join(' ');
}
