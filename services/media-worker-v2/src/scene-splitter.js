// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Scene Splitter — Segments a script into scenes.
 *
 * Two modes:
 *   1. Blueprint mode (structured templates): Scene types, roles, and duration ratios
 *      are predefined. GPT-4o-mini only distributes script text across scenes.
 *   2. Free mode (no template): GPT-4o-mini decides everything.
 *
 * When `allowBroll` is true, some scenes may be assigned type "broll" for cinematic
 * cutaway footage with voiceover. Otherwise all scenes are "talking_head".
 *
 * Templates: monologue, testimonial, product-review, problem-solution,
 *            saas-review, before-after, listicle, product-demo
 */

import OpenAI from 'openai';

// Lazy init — avoid crashing at import time if env var is missing
let _openai;
function getClient() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * @typedef {Object} Scene
 * @property {string} text - Narration text for this scene
 * @property {'talking_head'|'broll'} type - Scene type
 * @property {string} visualPrompt - Visual description for video generation
 * @property {string} [role] - Scene role from blueprint (e.g. 'hook', 'body', 'cta')
 */

// ── Structured Template Blueprints ──────────────────────────────────────────
// Each blueprint defines exact scene sequence, types, and duration ratios.
// GPT-4o-mini only distributes the script text — it does NOT decide structure.
// Default: all talking_head. When allowBroll=true, BROLL_BLUEPRINTS is used.

const TEMPLATE_BLUEPRINTS = {
  monologue: {
    label: 'Single-Shot Monologue',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'talking_head', role: 'body', durationRatio: 0.65 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  testimonial: {
    label: 'Customer Testimonial',
    scenes: [
      { type: 'talking_head', role: 'problem', durationRatio: 0.25 },
      { type: 'talking_head', role: 'solution', durationRatio: 0.35 },
      { type: 'talking_head', role: 'result', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'product-review': {
    label: 'Product Review',
    scenes: [
      { type: 'talking_head', role: 'intro', durationRatio: 0.20 },
      { type: 'talking_head', role: 'experience', durationRatio: 0.40 },
      { type: 'talking_head', role: 'verdict', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'problem-solution': {
    label: 'Problem → Solution',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.20 },
      { type: 'talking_head', role: 'pain-point', durationRatio: 0.20 },
      { type: 'talking_head', role: 'solution', durationRatio: 0.35 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.25 },
    ],
  },
  'saas-review': {
    label: 'SaaS / App Review',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.20 },
      { type: 'talking_head', role: 'walkthrough', durationRatio: 0.35 },
      { type: 'talking_head', role: 'opinion', durationRatio: 0.25 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'before-after': {
    label: 'Before / After Transformation',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'talking_head', role: 'before', durationRatio: 0.25 },
      { type: 'talking_head', role: 'after', durationRatio: 0.30 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.30 },
    ],
  },
  listicle: {
    label: 'Listicle (3-5 Tips)',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'talking_head', role: 'tip-1', durationRatio: 0.25 },
      { type: 'talking_head', role: 'tip-2', durationRatio: 0.25 },
      { type: 'talking_head', role: 'tip-3-cta', durationRatio: 0.35 },
    ],
  },
  'product-demo': {
    label: 'Product Demo / Tutorial',
    scenes: [
      { type: 'talking_head', role: 'intro', durationRatio: 0.20 },
      { type: 'talking_head', role: 'demo', durationRatio: 0.40 },
      { type: 'talking_head', role: 'recap', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
};

// ── Broll-enabled blueprints (used when allowBroll=true) ────────────────────
// Hook and CTA always talking_head. Middle scenes may be broll cutaways.
// Max 2 broll scenes per template.

const BROLL_BLUEPRINTS = {
  monologue: {
    label: 'Single-Shot Monologue',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'broll', role: 'body', durationRatio: 0.65 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  testimonial: {
    label: 'Customer Testimonial',
    scenes: [
      { type: 'talking_head', role: 'problem', durationRatio: 0.25 },
      { type: 'broll', role: 'solution', durationRatio: 0.35 },
      { type: 'talking_head', role: 'result', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'product-review': {
    label: 'Product Review',
    scenes: [
      { type: 'talking_head', role: 'intro', durationRatio: 0.20 },
      { type: 'broll', role: 'experience', durationRatio: 0.40 },
      { type: 'talking_head', role: 'verdict', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'problem-solution': {
    label: 'Problem → Solution',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.20 },
      { type: 'broll', role: 'pain-point', durationRatio: 0.20 },
      { type: 'talking_head', role: 'solution', durationRatio: 0.35 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.25 },
    ],
  },
  'saas-review': {
    label: 'SaaS / App Review',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.20 },
      { type: 'broll', role: 'walkthrough', durationRatio: 0.35 },
      { type: 'talking_head', role: 'opinion', durationRatio: 0.25 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
  'before-after': {
    label: 'Before / After Transformation',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'broll', role: 'before', durationRatio: 0.25 },
      { type: 'broll', role: 'after', durationRatio: 0.30 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.30 },
    ],
  },
  listicle: {
    label: 'Listicle (3-5 Tips)',
    scenes: [
      { type: 'talking_head', role: 'hook', durationRatio: 0.15 },
      { type: 'broll', role: 'tip-1', durationRatio: 0.25 },
      { type: 'broll', role: 'tip-2', durationRatio: 0.25 },
      { type: 'talking_head', role: 'tip-3-cta', durationRatio: 0.35 },
    ],
  },
  'product-demo': {
    label: 'Product Demo / Tutorial',
    scenes: [
      { type: 'talking_head', role: 'intro', durationRatio: 0.20 },
      { type: 'broll', role: 'demo', durationRatio: 0.40 },
      { type: 'talking_head', role: 'recap', durationRatio: 0.20 },
      { type: 'talking_head', role: 'cta', durationRatio: 0.20 },
    ],
  },
};

/** All valid template slugs. */
export const VALID_TEMPLATES = new Set(Object.keys(TEMPLATE_BLUEPRINTS));

/**
 * Speaking rate constant: ~2.5 words per second (natural conversational pace).
 * Used to calculate target word count per scene based on duration allocation.
 */
const WORDS_PER_SECOND = 2.5;

// ── Visual Prompt Guidelines ────────────────────────────────────────────────
const VISUAL_PROMPT_GUIDELINES = `CRITICAL RULES for visualPrompt:
   - Describe REAL-WORLD visuals only: people, places, objects, nature, cityscapes, hands, activities
   - Use specific camera vocabulary: dolly shot, tracking shot, crane shot, rack focus, shallow depth of field, wide establishing shot, tight close-up, over-the-shoulder, Dutch angle, push-in
   - Specify lighting: golden hour, dramatic side-lighting, rim light, soft diffused light, high-key, moody low-key, silhouette, backlit, neon glow
   - Describe motion: slow motion, time-lapse, handheld, steadicam, smooth dolly, whip pan, parallax
   - NEVER describe screens, UIs, apps, software, dashboards, code, websites, or computer interfaces
   - NEVER mention product names, brand names, or specific tools in the visual description
   - NEVER include text overlays, title cards, or abstract visual concepts
   - Focus on the EMOTION or CONCEPT behind the narration, not the literal subject`;

/**
 * Build GPT prompt instructions for semantic broll image assignment.
 * Tells GPT which images are available and asks it to assign each broll
 * scene the most relevant image via an imageIndex field.
 *
 * @param {string[]} brollImages - Available image URLs
 * @param {Array<{type:string,role?:string}>} [blueprintScenes] - Blueprint scene defs (if in blueprint mode)
 * @returns {string} Prompt instructions block
 */
function buildImageAssignmentInstructions(brollImages, blueprintScenes = null) {
  const imageList = brollImages
    .map((url, i) => {
      // Extract a human-readable hint from the URL filename
      const filename = url.split('/').pop()?.split('?')[0] || `image-${i}`;
      return `  ${i}: "${filename}"`;
    })
    .join('\n');

  const brollCount = blueprintScenes
    ? blueprintScenes.filter(s => s.type === 'broll').length
    : 2; // max broll in free mode

  return `
BROLL IMAGE ASSIGNMENT:
The user provided ${brollImages.length} reference image(s) for broll scenes:
${imageList}

For each broll scene, set "imageIndex" to the 0-based index of the most relevant image based on what the scene narration is about. Match the image filename/context to the scene content.
- Each image can be used by at most one scene.
- If there are more broll scenes than images, set "imageIndex" to null for extra scenes (they'll use AI-generated footage).
- If there are more images than broll scenes (${brollCount} broll scene${brollCount === 1 ? '' : 's'}), pick the ${brollCount} most relevant image${brollCount === 1 ? '' : 's'}.
- For talking_head scenes, do NOT include "imageIndex".`;
}

/**
 * Split a script into scenes. Uses blueprint mode for structured templates
 * or free mode when no template is specified.
 *
 * @param {string} script - The full narration script
 * @param {number|null} [targetDuration] - Target video duration in seconds
 * @param {string|null} [template] - Template slug
 * @param {boolean} [allowBroll=false] - When true, some scenes may be broll cutaways
 * @param {string[]|null} [brollImages=null] - Available broll image URLs (for semantic assignment)
 * @returns {Promise<Scene[]>}
 */
export async function splitScenes(script, targetDuration = null, template = null, allowBroll = false, brollImages = null) {
  if (template) {
    const blueprintSet = allowBroll ? BROLL_BLUEPRINTS : TEMPLATE_BLUEPRINTS;
    const blueprint = blueprintSet[template];
    if (blueprint) {
      return splitWithBlueprint(script, blueprint, targetDuration, allowBroll, brollImages);
    }
  }

  return splitFreeForm(script, targetDuration, allowBroll, brollImages);
}

/**
 * Blueprint mode: scene structure is predefined, GPT-4o-mini only distributes text.
 */
async function splitWithBlueprint(script, blueprint, targetDuration, allowBroll, brollImages) {
  const numScenes = blueprint.scenes.length;
  const hasBroll = blueprint.scenes.some(s => s.type === 'broll');
  const totalDuration = targetDuration || 10;

  const sceneDescriptions = blueprint.scenes
    .map((s, i) => {
      const sceneDuration = Math.round(totalDuration * s.durationRatio);
      const targetWords = Math.round(sceneDuration * WORDS_PER_SECOND);
      return `Scene ${i + 1}: type="${s.type}", role="${s.role}", ~${sceneDuration}s (~${targetWords} words)`;
    })
    .join('\n');

  // Build image assignment instructions when broll images are provided
  const imageInstructions = (hasBroll && brollImages?.length > 0)
    ? buildImageAssignmentInstructions(brollImages, blueprint.scenes)
    : '';

  const typeInstructions = hasBroll
    ? `This video mixes talking_head scenes (actor on camera) and broll scenes (cinematic cutaway footage with voiceover narration).

For talking_head scenes:
- "visualPrompt" should describe the speaker's energy and expression (e.g. "excited, leaning in", "serious and direct").

For broll scenes:
- "visualPrompt" should describe cinematic cutaway footage that illustrates the narration.
${VISUAL_PROMPT_GUIDELINES}
${imageInstructions}`
    : `All scenes are talking_head — the actor speaks directly to camera throughout the entire video.

For each scene, provide:
1. "text" — the narration text for that scene. Every word of the original script must appear in exactly one scene. Distribute proportionally by the duration percentage.
2. "visualPrompt" — a brief description of the speaker's energy and expression for that moment (e.g. "excited, leaning in", "serious and direct", "smiling, warm").`;

  const imageOutputField = (hasBroll && brollImages?.length > 0)
    ? ', "imageIndex": <0-based index into the provided images array, or null if no image fits>' : '';

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a UGC video script editor. Distribute the given script across exactly ${numScenes} scenes.

Scene structure (FIXED — do not change types or order):
${sceneDescriptions}

CRITICAL PACING RULE: Natural speaking pace is ~2.5 words per second. Each scene's text MUST match its target word count. Do NOT cram too many words into a short scene — the actor will speak too fast and lip-sync will break. If the original script has more words than fit, cut filler words to match the target pace.

${typeInstructions}

Return JSON: { "scenes": [{ "text": "...", "visualPrompt": "..."${imageOutputField} }, ...] }
Exactly ${numScenes} scenes, in order.`,
      },
      {
        role: 'user',
        content: script,
      },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT-4o-mini returned empty response for blueprint scene splitting');
  }

  const parsed = JSON.parse(content);
  const rawScenes = parsed.scenes;

  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error('GPT-4o-mini returned no scenes for blueprint');
  }

  // Merge GPT output with blueprint structure
  const scenes = blueprint.scenes.map((bp, i) => {
    const gptScene = rawScenes[i] || rawScenes[rawScenes.length - 1];
    return {
      text: gptScene.text || '',
      type: bp.type,
      role: bp.role,
      visualPrompt: gptScene.visualPrompt || gptScene.text || '',
      durationRatio: bp.durationRatio,
      ...(gptScene.imageIndex != null ? { imageIndex: gptScene.imageIndex } : {}),
    };
  });

  // Validate
  for (const scene of scenes) {
    if (!scene.text) {
      throw new Error(`Blueprint scene (role: ${scene.role}) has empty text`);
    }
  }

  return scenes;
}

/**
 * Free-form mode: GPT-4o-mini decides scene structure.
 * Used when no blueprint template is specified.
 */
async function splitFreeForm(script, targetDuration, allowBroll, brollImages) {
  // Scale scene count with video duration — avoid jarring cuts in short videos
  let minScenes, maxScenes;
  if (targetDuration && targetDuration <= 10) {
    minScenes = 2;
    maxScenes = 3;
  } else if (targetDuration && targetDuration >= 30) {
    minScenes = 5;
    maxScenes = 8;
  } else {
    minScenes = 3;
    maxScenes = 5;
  }

  // Build image assignment instructions when broll images are provided
  const imageInstructions = (allowBroll && brollImages?.length > 0)
    ? buildImageAssignmentInstructions(brollImages)
    : '';

  const typeInstructions = allowBroll
    ? `This is a UGC video. The actor speaks to camera in most scenes, but you may use "broll" for 1-2 scenes where a cinematic cutaway would enhance the video. The voiceover narration continues over broll scenes.

Rules for broll:
- Max 2 broll scenes per video
- The FIRST scene must ALWAYS be "talking_head" (hook — actor on camera)
- The LAST scene must ALWAYS be "talking_head" (CTA — actor on camera)
- Broll scenes should illustrate or dramatize the narration (not just repeat it)

For each scene, provide:
1. "text" — the exact narration text for that scene (must use the original script words verbatim, no additions)
2. "type" — "talking_head" (actor on camera) or "broll" (cinematic cutaway with voiceover)
3. "visualPrompt" — for talking_head: describe the speaker's energy/expression. For broll: describe cinematic footage.

${VISUAL_PROMPT_GUIDELINES}
${imageInstructions}`
    : `This is a UGC (User-Generated Content) video — a single person talking directly to camera the entire time. The actor must be visible and speaking in EVERY scene.

For each scene, provide:
1. "text" — the exact narration text for that scene (must use the original script words verbatim, no additions)
2. "type" — MUST be "talking_head" for all scenes. The actor speaks to camera throughout the entire video. Do NOT use "broll" — there are no cutaway scenes in UGC content.
3. "visualPrompt" — a brief description of the speaker's energy/expression for that moment (e.g. "excited, leaning in", "calm and confident, direct eye contact", "emphatic hand gestures").`;

  const imageOutputField = (allowBroll && brollImages?.length > 0)
    ? ', "imageIndex": <0-based index or null>' : '';

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an award-winning cinematographer and UGC video director. Split the given script into ${minScenes}-${maxScenes} scenes for a short-form vertical (9:16) video.${targetDuration ? ` Target duration: ~${targetDuration} seconds. Create enough scenes to fill this duration — each scene is typically 3-5 seconds.` : ''}

${typeInstructions}

Scene pacing rules:
- Natural speaking pace is ~2.5 words per second. Each scene should have ~2.5 words × scene_duration_seconds.
- For a ${targetDuration || 10}s video with ${minScenes}-${maxScenes} scenes, each scene is ~3-5 seconds and ~7-12 words.
- Do NOT cram too many words — if the script is too long, cut filler words to match the target pace.
- Each scene should be 1-2 short sentences max.

Return JSON: { "scenes": [{ "text": "...", "type": "talking_head", "visualPrompt": "..."${imageOutputField} }, ...] }`,
      },
      {
        role: 'user',
        content: script,
      },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT-4o-mini returned empty response for scene splitting');
  }

  const parsed = JSON.parse(content);
  const scenes = parsed.scenes;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('GPT-4o-mini returned no scenes');
  }

  if (scenes.length > maxScenes) {
    scenes.length = maxScenes;
  }

  // Enforce hook-first: first scene should be talking_head
  if (scenes.length > 1 && scenes[0].type !== 'talking_head') {
    const thIdx = scenes.findIndex(s => s.type === 'talking_head');
    if (thIdx > 0) [scenes[0], scenes[thIdx]] = [scenes[thIdx], scenes[0]];
  }

  // Validate each scene has required fields + preserve imageIndex
  for (const scene of scenes) {
    if (!scene.text || !scene.type || !scene.visualPrompt) {
      throw new Error('Scene missing required fields (text, type, visualPrompt)');
    }
    if (scene.imageIndex != null) scene.imageIndex = Number(scene.imageIndex);
    // When broll is not allowed, force everything to talking_head
    if (!allowBroll && scene.type !== 'talking_head') {
      scene.type = 'talking_head';
    }
    // When broll is allowed, only permit talking_head and broll
    if (allowBroll && scene.type !== 'talking_head' && scene.type !== 'broll') {
      scene.type = 'talking_head';
    }
  }

  // Safety: enforce max 2 broll scenes even if GPT generates more
  if (allowBroll) {
    let brollCount = 0;
    for (const scene of scenes) {
      if (scene.type === 'broll') {
        brollCount++;
        if (brollCount > 2) {
          scene.type = 'talking_head';
        }
      }
    }
  }

  return scenes;
}
