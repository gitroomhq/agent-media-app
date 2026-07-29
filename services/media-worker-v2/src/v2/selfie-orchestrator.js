// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Internal Selfie orchestration agent.
 *
 * This is the pipeline brain: it turns the public request into concrete
 * stage prompts and render instructions. The worker still executes each
 * media step deterministically after this returns.
 *
 * Realism comes from the rubric + shot presets in ./realism.js — the
 * orchestrator embeds the rubric into the system prompt so every
 * generated stage prompt inherits it automatically.
 */

import { REALISM_RUBRIC, SHOT_PRESETS, VIBE_MODIFIERS } from './realism.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL =
  process.env.SELFIE_ORCHESTRATOR_MODEL ??
  process.env.PORTRAIT_PROMPTER_MODEL ??
  'claude-opus-4-7';

const SHOT_PRESET_KEYS = Object.keys(SHOT_PRESETS);
const VIBE_KEYS = Object.keys(VIBE_MODIFIERS);

const SYSTEM_PROMPT = `You are agent-media's internal Selfie pipeline orchestrator.

You receive raw request fields for a short AI UGC selfie clip. Your job is to produce strict JSON for the worker stages:
1. gpt-image-2 portrait prompt
2. gpt-image-2 character sheet prompt
3. script / action / setting / minimal props plan
4. gpt-image-2 photographic wireframe / storyboard board prompt
5. Seedance 2.0 video prompt

Output ONLY valid JSON. No markdown. No commentary. No code fence.

Required JSON shape:
{
  "portrait_prompt": "string",
  "character_sheet_prompt": "string",
  "persona_brief": {
    "age": "string (e.g. '30-35')",
    "ethnicity": "string (e.g. 'south-asian', 'mediterranean')",
    "build": "string (e.g. 'slim', 'athletic', 'average build')",
    "hair": "string (be specific: color, length, style, parting)",
    "face_features": "string (eye color, eye shape, brow, nose, jaw, marks/freckles)",
    "skin_tone": "string (e.g. 'warm olive', 'fair with freckles')",
    "clothing": "string (fabric, color, fit, length — be exact)",
    "energy": "string (e.g. 'warm casual', 'calm grandmotherly', 'sharp pro')",
    "signature_mannerism": "string (one specific micro-gesture, e.g. 'wipes hands on apron mid-sentence')"
  },
  "script": "string or null",
  "scene_action": "string",
  "setting": "string",
  "wardrobe": "string",
  "minimal_props": ["string"],
  "shot_preset": "string (one of: ${SHOT_PRESET_KEYS.join(', ')})",
  "vibe": "string (one of: ${VIBE_KEYS.join(', ')})",
  "wireframe_prompt": "string",
  "seedance_prompt": "string",
  "duration": 5 | 10 | 15,
  "background_music": true | false | "string" | null,
  "subtitles": true | false,
  "missing_details": ["string"],
  "assumptions": ["string"]
}

Persona brief rules:
- Fill ALL 9 fields. They lock the character's identity for the sheet step and for any future video that reuses this character. Vague brief ⇒ cross-video drift.
- Infer from the user description. If the user said "30yo Israeli male", fill age='30', ethnicity='Mediterranean / Israeli', build='medium', and then INFER plausible defaults for hair / face / clothing / energy / mannerism based on the implied persona (don't invent contradictions — if "fitness influencer" implies athletic build, use that).
- For signature_mannerism, pick ONE specific micro-gesture that matches the persona (a busy parent glances off-screen; an Italian nonna wipes hands on apron; a fitness creator wipes sweat). This is what makes the character feel like a person, not a face.
- Brief details that contradict the user description = FORBIDDEN. If the user said "blonde woman" do not put "brown hair" in the brief.

🛑 SAVED CHARACTER OVERRIDE (CRITICAL):
- If the input includes "saved_persona_brief", that is the LOCKED persona of a previously-saved character. You MUST echo it back verbatim in your output persona_brief — do NOT invent a new one, do NOT rewrite any field, do NOT add or remove fields. The user is reusing a saved character; changing the brief means a different face in this video than every other video they've made with this character.
- Also let the saved persona inform your scene_action and wireframe_prompt — e.g. if the brief says signature_mannerism='wipes hands on apron mid-sentence', work that gesture into the scene_action.

Hard product rules:
- Preserve the user's script verbatim. Do not rewrite, correct, expand, translate, or shorten it. If no script was provided, use null.
- If details are missing, decide sensible defaults for the worker and list them in assumptions. Also list what an external skill should ask the user in missing_details.
- Use the requested duration exactly. Do not change the duration in your JSON.
- Keep props minimal. Do not invent products. Only include props needed by the script/action or one natural scene prop such as a mug, pillow, hairbrush, or laptop.
- The final video is a 9:16 selfie-style shot with slight off-axis framing by default (not perfectly straight front-on). The subject still addresses the lens naturally.

Camera + phone defaults (CRITICAL):
- Default camera is STABLE/LOCKED with no noticeable shake, drift, or reframing.
- Slight off-axis framing is preferred by default (about 5-12 degrees), not perfectly straight front-on.
- Phone/camera/selfie-stick/selfie-arm are FORBIDDEN by default. Do not add them unless explicitly requested by caller input.
- Handheld camera movement is opt-in only when explicitly requested by caller input.

Caller override fields (when present in the input, they OVERRIDE your defaults — echo them back exactly):
- "shot_preset_override": you MUST use this preset key as the shot_preset in your output.
- "vibe_override": you MUST use this vibe as the vibe in your output.
- "camera_locked": true ⇒ the seedance_prompt MUST describe a stable/locked camera (no shake, no drift); false ⇒ handheld movement is allowed only because caller asked for it.
- "phone_in_frame": "forbidden" ⇒ exclude phone/camera/selfie-arm/selfie-stick from all prompts; "required" ⇒ actively compose with the subject holding a phone; "optional" ⇒ phone may appear if natural.

Portrait prompt rules:
- Candid upper-body framing in a real environment (room / kitchen / car / outdoors), with ambient context lighting. NOT studio. NOT centered.
- Show shoulders, hair, slight environmental anchor in background (a slice of curtain / kitchen tile / car seatbelt / etc.). The environment is what makes the face feel "real, not stock-portrait".
- Skin must show pores, oil sheen, baby hairs, slight under-eye softness, micro-imperfections, asymmetry.
- Explicitly avoid AI beauty look: no shiny/plastic face, no glowing face light, no beauty-filter glow.
- Start the portrait prompt with "Tight hyper-realistic candid iPhone front-camera upper-body portrait of".

Shot preset rules:
- Choose a shot_preset from the list above that best matches the implied scene from scene_action / script. If no scene is obvious, default to "bedroom-morning-ritual".
- Choose a vibe from the list above that best matches the script's energy. Default to "excited".

Character sheet prompt rules:
- Keep it simple. The portrait reference does the heavy lifting.
- Ask for the same person, full body, multiple angles, multiple everyday outfits, plain background, no text/labels.

Wireframe prompt rules:
- The wireframe is a photographic planning board, not a pencil sketch.
- Write a full GPT Image 2 prompt that says: create a full wireframe/storyboard board for this user story.
- The prompt must include the actor's exact spoken line when present, and what they are doing while saying it.
- Do not invent dialogue. Captions may split the exact user script into shorter spoken beats, but must not add new spoken words, claims, CTAs, or product promises.
- Ask for 8-10 separate frames arranged in a clean grid on one image.
- Each frame must look like a realistic photographic still of the same actor, using the character sheet as the identity/outfit reference.
- Each frame needs a short explanation/caption describing the frame number, spoken beat/action, expression, and gesture.
- Do not ask for sketches, line art, pencil art, grayscale-only, rough drawings, or abstract wireframes.
- Panels should look like SLIGHTLY HANDHELD iPhone frames — micro-variation in framing panel-to-panel (not tripod-perfect grid). Some panels with slight tilt, some with slight pull-back, occasional motion blur on a gesture.

Seedance prompt rules:
- Use character sheet as identity reference and wireframe as staging/composition reference. Both references already encode the realism rubric — the video prompt itself can stay minimal.
- Explicitly include this as CRITICAL for Seedance 2: no shiny/plastic face, no glowing light on face, and no beauty-filter glow.
- Include exact spoken script in quotes if script is present.
- If no script, explicitly say no dialogue and no vocalization.
- Include background music only if requested or if there is no script and music is needed.
- The video must inherit the handheld + environmental + skin-texture realism from the references. Do not re-state every realism rule — that bloats the call and Seedance may ignore it. Trust the references.

${REALISM_RUBRIC}`;

function stripCodeFence(text) {
  return String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('selfie-orchestrator: model did not return JSON');
  }
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
}

function hasKeyword(value, regex) {
  return typeof value === 'string' && regex.test(value);
}

function detectExplicitPhoneRequest({ script, sceneAction, description }) {
  const re = /\b(phone|iphone|selfie\s*stick|gimbal|recording\s+myself|mirror\s*selfie|holding\s+my\s+phone)\b/i;
  return hasKeyword(sceneAction, re) || hasKeyword(script, re) || hasKeyword(description, re);
}

function detectExplicitHandheldRequest({ script, sceneAction, description }) {
  const re = /\b(handheld|camera\s+move|moving\s+camera|walk(?:ing)?\s+and\s+talk|vlog(?:ging)?|selfie\s+walk|shaky)\b/i;
  return hasKeyword(sceneAction, re) || hasKeyword(script, re) || hasKeyword(description, re);
}

function detectExplicitStraightOnRequest({ script, sceneAction, description }) {
  const re = /\b(straight[\s-]?on|dead\s+center|perfectly\s+centered|front[\s-]?on)\b/i;
  return hasKeyword(sceneAction, re) || hasKeyword(script, re) || hasKeyword(description, re);
}

function normalizeDuration(value, fallback) {
  const n = Number(value);
  if (n === 5 || n === 10 || n === 15) return n;
  return fallback === 5 || fallback === 10 || fallback === 15 ? fallback : 10;
}

function normalizeBackgroundMusic(value, { hasScript, requested }) {
  if (requested !== undefined) return requested;
  if (value === true || value === false || value === null) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return hasScript ? null : true;
}

function ensurePhrase(prompt, phrase) {
  const text = asString(prompt);
  return text.toLowerCase().includes(phrase.toLowerCase())
    ? text
    : `${text} ${phrase}`.trim();
}

/**
 * @param {object} params
 * @param {string} [params.description]
 * @param {string} [params.photo_url]
 * @param {string} [params.character_id]
 * @param {string} [params.script]
 * @param {string} [params.scene_action]
 * @param {boolean|string} [params.background_music]
 * @param {number} [params.duration]
 * @param {boolean} [params.subtitles]
 * @param {string} [params.shot_preset]
 * @param {string} [params.vibe]
 * @param {boolean} [params.camera_locked]
 * @param {'forbidden'|'optional'|'required'} [params.phone_in_frame]
 * @param {string} [params.jobId]
 */
export async function orchestrateSelfie(params) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing on worker - Selfie orchestration requires it.');
  }

  const {
    description,
    photo_url,
    character_id,
    script,
    scene_action,
    background_music,
    duration = 10,
    subtitles = true,
    shot_preset,
    vibe,
    camera_locked,
    phone_in_frame,
    saved_persona_brief,
    jobId,
  } = params;
  const hasScript = typeof script === 'string' && script.trim().length > 0;
  const normalizedScript = hasScript ? script.trim() : null;
  const explicitPhoneRequest = detectExplicitPhoneRequest({
    script: normalizedScript,
    sceneAction: scene_action,
    description,
  });
  const explicitHandheldRequest = detectExplicitHandheldRequest({
    script: normalizedScript,
    sceneAction: scene_action,
    description,
  });
  const explicitStraightOnRequest = detectExplicitStraightOnRequest({
    script: normalizedScript,
    sceneAction: scene_action,
    description,
  });
  const resolvedCameraLocked = typeof camera_locked === 'boolean'
    ? camera_locked
    : !explicitHandheldRequest;
  const resolvedPhoneInFrame = phone_in_frame
    ?? (explicitPhoneRequest ? 'required' : 'forbidden');

  const input = {
    description: description ?? null,
    has_photo_url: !!photo_url,
    has_saved_character: !!character_id,
    script: normalizedScript,
    scene_action: scene_action ?? null,
    background_music: background_music ?? null,
    duration,
    subtitles,
    // Optional caller-provided overrides. When present these PIN the
    // corresponding output field — the model must echo them back.
    ...(shot_preset !== undefined ? { shot_preset_override: shot_preset } : {}),
    ...(vibe !== undefined ? { vibe_override: vibe } : {}),
    camera_locked: resolvedCameraLocked,
    phone_in_frame: resolvedPhoneInFrame,
    // When a saved character has a locked persona brief, pass it so the
    // model echoes it back verbatim instead of inventing a new one.
    ...(saved_persona_brief && typeof saved_persona_brief === 'object'
      ? { saved_persona_brief }
      : {}),
  };

  const user = [
    'Raw Selfie request fields:',
    JSON.stringify(input, null, 2),
    '',
    'Return the orchestration JSON now.',
  ].join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(75_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`selfie-orchestrator: Anthropic ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('selfie-orchestrator: Anthropic returned empty content');

  const parsed = parseJsonObject(text);
  const normalizedSceneAction = asString(
    parsed.scene_action,
    scene_action || (normalizedScript ? 'speaking directly to camera with natural facial expression and small relaxed gestures' : 'facing camera with natural movement'),
  );
  let sceneActionResolved = normalizedSceneAction;
  if (resolvedPhoneInFrame === 'forbidden') {
    sceneActionResolved = ensurePhrase(
      sceneActionResolved,
      'No visible phone, selfie stick, camera rig, or outstretched selfie arm in frame.',
    );
  } else if (resolvedPhoneInFrame === 'required') {
    sceneActionResolved = ensurePhrase(
      sceneActionResolved,
      'Phone is visibly in hand as part of the action.',
    );
  }
  if (resolvedCameraLocked) {
    sceneActionResolved = ensurePhrase(
      sceneActionResolved,
      'Camera remains stable with no noticeable shake or drift.',
    );
  } else {
    sceneActionResolved = ensurePhrase(
      sceneActionResolved,
      'Handheld movement is intentional and subtle.',
    );
  }
  if (!explicitStraightOnRequest) {
    sceneActionResolved = ensurePhrase(
      sceneActionResolved,
      'Framing is slightly off-axis, not perfectly straight-on.',
    );
  }
  const normalizedSetting = asString(parsed.setting, 'lived-in bedroom with soft natural window light');
  const normalizedWardrobe = asString(parsed.wardrobe, 'casual everyday outfit');
  const props = asStringArray(parsed.minimal_props).slice(0, 4);

  let portraitPrompt = asString(parsed.portrait_prompt);
  // Inject realism keyword stack (not anti-phone/anti-camera) — the keyword
  // floor that fights gpt-image-2's perfection defaults. Camera and phone
  // rules are handled by the system prompt, not appended here.
  portraitPrompt = ensurePhrase(
    portraitPrompt,
    'natural skin texture, visible pores, subtle freckles, motion blur, breathing movement, slight head tilt, asymmetric features, warm iPhone color grade, no plastic AI smoothing, no uncanny symmetry.',
  );
  if (!portraitPrompt.startsWith('Tight hyper-realistic candid iPhone front-camera upper-body portrait of')) {
    portraitPrompt = `Tight hyper-realistic candid iPhone front-camera upper-body portrait of ${description ?? 'the requested person'}. ${portraitPrompt}`;
  }

  const characterSheetPrompt = asString(
    parsed.character_sheet_prompt,
    'Create a simple character sheet from this portrait: same person, full body, front view, 3/4 view, side view, back view, several everyday outfits, plain neutral background, no text, no labels.',
  );

  // Wireframe defensive appending stays — it correctly anti-bleeds the
  // panel grid layout to Seedance, which is a structural concern, not a
  // realism one.
  const wireframePrompt = ensurePhrase(
    asString(parsed.wireframe_prompt),
    'Create a full photographic wireframe/storyboard board for this user story: 8-10 realistic photo still frames in a clean grid, same actor in every frame, short explanation/caption for each frame, do not invent dialogue beyond the exact user script, no sketches, no pencil art, no line art. Panels should look like slightly handheld iPhone frames with micro-variation in framing panel-to-panel.',
  );

  // Seedance prompt stays minimal — references (sheet + wireframe) carry
  // identity, setting, and realism. The triple-redundant locked-camera /
  // no-phone hammering was killing realism. See buildVideoPrompt in
  // realism.js for the structural minimal-video-prompt rationale.
  //
  // Defensive overrides applied here only when the CALLER explicitly
  // pinned a non-default behavior — these are the rare opt-in cases.
  let seedancePrompt = asString(parsed.seedance_prompt, '');
  seedancePrompt = ensurePhrase(
    seedancePrompt,
    'CRITICAL for Seedance 2: keep facial skin and lighting natural and realistic — no shiny/plastic face, no glowing light on the face, no beauty-filter glow.',
  );
  if (resolvedCameraLocked) {
    seedancePrompt = ensurePhrase(
      seedancePrompt,
      'Camera is locked off on a stable mount: no pan, no zoom, no tilt, no shake. The frame stays still; only the subject moves.',
    );
  }
  if (resolvedPhoneInFrame === 'forbidden') {
    seedancePrompt = ensurePhrase(
      seedancePrompt,
      'The subject does NOT hold a phone or camera. No visible phone, mirror-phone, selfie stick, selfie arm, or outstretched arm toward the lens.',
    );
  } else if (resolvedPhoneInFrame === 'required') {
    seedancePrompt = ensurePhrase(
      seedancePrompt,
      'The subject IS holding an iPhone, with the phone partially covering chin/lower face naturally as if texting or recording.',
    );
  }
  if (!explicitStraightOnRequest) {
    seedancePrompt = ensurePhrase(
      seedancePrompt,
      'Camera is framed slightly off-axis, not perfectly straight front-on.',
    );
  }

  // Apply caller-side overrides AFTER the model returns. The system
  // prompt tells the model to echo overrides back, but force-applying
  // here is the defensive guarantee.
  const callerShotPreset = typeof shot_preset === 'string' &&
    (SHOT_PRESET_KEYS.includes(shot_preset) || shot_preset.startsWith('custom-scene:'))
    ? shot_preset
    : null;
  const normalizedShotPreset = callerShotPreset
    ?? (SHOT_PRESET_KEYS.includes(parsed.shot_preset)
      ? parsed.shot_preset
      : 'bedroom-morning-ritual');

  const callerVibe = typeof vibe === 'string' && VIBE_KEYS.includes(vibe) ? vibe : null;
  const normalizedVibe = callerVibe ?? (VIBE_KEYS.includes(parsed.vibe) ? parsed.vibe : 'excited');

  // Normalize persona_brief — coerce to an object with 9 string fields.
  // Missing keys ⇒ empty string (the downstream builder filters those out).
  //
  // CRITICAL: when a saved_persona_brief was supplied, it WINS over
  // whatever the model returned. This is the defensive guarantee that
  // saved characters never drift identity between videos.
  const BRIEF_KEYS = [
    'age', 'ethnicity', 'build', 'hair', 'face_features',
    'skin_tone', 'clothing', 'energy', 'signature_mannerism',
  ];
  const personaBriefRaw = (saved_persona_brief && typeof saved_persona_brief === 'object')
    ? saved_persona_brief
    : (typeof parsed.persona_brief === 'object' && parsed.persona_brief !== null)
      ? parsed.persona_brief
      : {};
  const personaBrief = Object.fromEntries(
    BRIEF_KEYS.map((k) => [k, asString(personaBriefRaw[k], '')]),
  );

  const plan = {
    portrait_prompt: portraitPrompt,
    character_sheet_prompt: characterSheetPrompt,
    persona_brief: personaBrief,
    script: normalizedScript,
    scene_action: sceneActionResolved,
    setting: normalizedSetting,
    wardrobe: normalizedWardrobe,
    minimal_props: props,
    shot_preset: normalizedShotPreset,
    vibe: normalizedVibe,
    wireframe_prompt: wireframePrompt,
    seedance_prompt: seedancePrompt,
    duration: normalizeDuration(duration, 10),
    background_music: normalizeBackgroundMusic(parsed.background_music, {
      hasScript,
      requested: background_music,
    }),
    subtitles: typeof subtitles === 'boolean' ? subtitles : parsed.subtitles !== false,
    missing_details: asStringArray(parsed.missing_details),
    assumptions: asStringArray(parsed.assumptions),
  };

  console.log(`[selfie-orchestrator${jobId ? `:${jobId}` : ''}] model=${MODEL} assumptions=${plan.assumptions.length} missing=${plan.missing_details.length}`);
  return plan;
}
