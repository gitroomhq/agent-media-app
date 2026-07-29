// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Manual validation for POST /api/v1/videos request body.
 *
 * Zod is not in the web app's dependencies, so we use plain runtime checks.
 * Each validator returns null on success or a human-readable error string.
 */

const VALID_DURATIONS = new Set([5, 10, 15]);
const VALID_TONES = new Set(['energetic', 'calm', 'confident', 'dramatic']);
const VALID_MUSIC = new Set(['chill', 'energetic', 'corporate', 'dramatic', 'upbeat']);
const VALID_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1']);
const VALID_BROLL_MODELS = new Set(['kling3', 'hailuo2', 'wan21']);
const VALID_SCENE_TYPES = new Set(['narration', 'broll', 'image', 'transition']);

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isUrl(v: unknown): boolean {
  if (!isString(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function isHttpsUrl(v: unknown): boolean {
  if (!isString(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

function pass(): ValidationResult {
  return { ok: true };
}

function fail(message: string): ValidationResult {
  return { ok: false, error: message };
}

/**
 * Validate the whitelisted body fields for POST /api/v1/videos.
 * Returns { ok: true } when valid, or { ok: false, error: "..." }.
 */
export function validateVideoBody(body: Record<string, unknown>): ValidationResult {
  // ── Require at least script or prompt ──────────────────────────────────
  if (!body.script && !body.prompt) {
    return fail('Either script or prompt is required');
  }

  // ── script ─────────────────────────────────────────────────────────────
  if (body.script !== undefined) {
    if (!isString(body.script)) return fail('script must be a string');
    if (body.script.length < 50) return fail('script must be at least 50 characters');
    if (body.script.length > 3000) return fail('script must be 3000 characters or fewer');
  }

  // ── prompt ─────────────────────────────────────────────────────────────
  if (body.prompt !== undefined) {
    if (!isString(body.prompt)) return fail('prompt must be a string');
    if (body.prompt.length < 1) return fail('prompt must be at least 1 character');
    if (body.prompt.length > 1000) return fail('prompt must be 1000 characters or fewer');
  }

  // ── product_url ────────────────────────────────────────────────────────
  if (body.product_url !== undefined) {
    if (!isUrl(body.product_url)) return fail('product_url must be a valid URL');
  }

  // ── actor_slug ─────────────────────────────────────────────────────────
  if (body.actor_slug !== undefined) {
    if (!isString(body.actor_slug)) return fail('actor_slug must be a string');
    if (body.actor_slug.length < 1) return fail('actor_slug must not be empty');
    if (body.actor_slug.length > 100) return fail('actor_slug must be 100 characters or fewer');
  }

  // ── target_duration ────────────────────────────────────────────────────
  if (body.target_duration !== undefined) {
    if (typeof body.target_duration !== 'number' || !VALID_DURATIONS.has(body.target_duration)) {
      return fail('target_duration must be 5, 10, or 15');
    }
  }

  // ── style ──────────────────────────────────────────────────────────────
  if (body.style !== undefined) {
    if (!isString(body.style)) return fail('style must be a string');
    if (body.style.length > 50) return fail('style must be 50 characters or fewer');
  }

  // ── tone ───────────────────────────────────────────────────────────────
  if (body.tone !== undefined) {
    if (!isString(body.tone) || !VALID_TONES.has(body.tone)) {
      return fail(`tone must be one of: ${[...VALID_TONES].join(', ')}`);
    }
  }

  // ── voice_speed ────────────────────────────────────────────────────────
  if (body.voice_speed !== undefined) {
    if (typeof body.voice_speed !== 'number') return fail('voice_speed must be a number');
    if (body.voice_speed < 0.7 || body.voice_speed > 1.5) {
      return fail('voice_speed must be between 0.7 and 1.5');
    }
  }

  // ── music ──────────────────────────────────────────────────────────────
  if (body.music !== undefined) {
    if (!isString(body.music) || !VALID_MUSIC.has(body.music)) {
      return fail(`music must be one of: ${[...VALID_MUSIC].join(', ')}`);
    }
  }

  // ── cta ────────────────────────────────────────────────────────────────
  if (body.cta !== undefined) {
    if (!isString(body.cta)) return fail('cta must be a string');
    if (body.cta.length > 100) return fail('cta must be 100 characters or fewer');
  }

  // ── aspect_ratio ───────────────────────────────────────────────────────
  if (body.aspect_ratio !== undefined) {
    if (!isString(body.aspect_ratio) || !VALID_ASPECT_RATIOS.has(body.aspect_ratio)) {
      return fail(`aspect_ratio must be one of: ${[...VALID_ASPECT_RATIOS].join(', ')}`);
    }
  }

  // ── template ───────────────────────────────────────────────────────────
  if (body.template !== undefined) {
    if (!isString(body.template)) return fail('template must be a string');
    if (body.template.length > 50) return fail('template must be 50 characters or fewer');
  }

  // ── composition_mode ───────────────────────────────────────────────────
  if (body.composition_mode !== undefined) {
    if (body.composition_mode !== 'pip') {
      return fail("composition_mode must be 'pip'");
    }
  }

  // ── pip_options ────────────────────────────────────────────────────────
  if (body.pip_options !== undefined) {
    if (typeof body.pip_options !== 'object' || body.pip_options === null || Array.isArray(body.pip_options)) {
      return fail('pip_options must be an object');
    }
    const pip = body.pip_options as Record<string, unknown>;
    for (const key of Object.keys(pip)) {
      if (!['position', 'size', 'animation', 'frame_style'].includes(key)) {
        return fail(`pip_options contains unknown field: ${key}`);
      }
    }
  }

  // ── allow_broll ────────────────────────────────────────────────────────
  if (body.allow_broll !== undefined) {
    if (typeof body.allow_broll !== 'boolean') return fail('allow_broll must be a boolean');
  }

  // ── broll_model ────────────────────────────────────────────────────────
  if (body.broll_model !== undefined) {
    if (!isString(body.broll_model) || !VALID_BROLL_MODELS.has(body.broll_model)) {
      return fail(`broll_model must be one of: ${[...VALID_BROLL_MODELS].join(', ')}`);
    }
  }

  // ── broll_images ───────────────────────────────────────────────────────
  if (body.broll_images !== undefined) {
    if (!Array.isArray(body.broll_images)) return fail('broll_images must be an array');
    if (body.broll_images.length > 10) return fail('broll_images must have 10 or fewer items');
    for (const item of body.broll_images) {
      if (!isUrl(item)) return fail('Each broll_images entry must be a valid URL');
    }
  }

  // ── product_image_url ──────────────────────────────────────────────────
  if (body.product_image_url !== undefined) {
    if (!isUrl(body.product_image_url)) return fail('product_image_url must be a valid URL');
  }

  // ── dub_language ───────────────────────────────────────────────────────
  if (body.dub_language !== undefined) {
    if (!isString(body.dub_language)) return fail('dub_language must be a string');
    if (body.dub_language.length > 10) return fail('dub_language must be 10 characters or fewer');
  }

  // ── webhook_url ────────────────────────────────────────────────────────
  if (body.webhook_url !== undefined) {
    if (!isString(body.webhook_url)) return fail('webhook_url must be a string');
    if (!isUrl(body.webhook_url)) return fail('webhook_url must be a valid URL');
    if (!isHttpsUrl(body.webhook_url)) return fail('webhook_url must use HTTPS');
    if (body.webhook_url.length > 2048) return fail('webhook_url must be 2048 characters or fewer');
  }

  // ── scenes ─────────────────────────────────────────────────────────────
  if (body.scenes !== undefined) {
    if (!Array.isArray(body.scenes)) return fail('scenes must be an array');
    if (body.scenes.length > 30) return fail('scenes must have 30 or fewer items');
    for (let i = 0; i < body.scenes.length; i++) {
      const scene = body.scenes[i] as Record<string, unknown>;
      if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
        return fail(`scenes[${i}] must be an object`);
      }
      if (scene.type !== undefined && isString(scene.type) && !VALID_SCENE_TYPES.has(scene.type)) {
        return fail(`scenes[${i}].type must be one of: ${[...VALID_SCENE_TYPES].join(', ')}`);
      }
    }
  }

  return pass();
}
