// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Video-related enums, types, and validation schemas.
 *
 * This is the SINGLE SOURCE OF TRUTH for all video option values.
 * Every consumer (API, CLI, dashboard, edge functions, docs, MCP, SDKs)
 * must import from here — never hardcode these values.
 *
 * IMPORTANT: Values must exactly match what is currently in production.
 * Any change to this file will propagate to all consumers on next build.
 */

import { z } from 'zod';

// ── Enums (as const + derived types) ────────────────────────────────────────

export const DURATIONS = [5, 10, 15] as const;
export type Duration = (typeof DURATIONS)[number];

export const TONES = ['energetic', 'calm', 'confident', 'dramatic'] as const;
export type Tone = (typeof TONES)[number];

export const MUSIC_GENRES = ['chill', 'energetic', 'corporate', 'dramatic', 'upbeat'] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number];

export const SUBTITLE_STYLES = [
  'hormozi', 'minimal', 'bold', 'karaoke', 'clean',
  'tiktok', 'neon', 'fire', 'glow', 'pop', 'aesthetic',
  'impact', 'pastel', 'electric', 'boxed', 'gradient', 'spotlight',
] as const;
export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];

export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * Currently supported scene types. The API validator previously accepted
 * 'narration', 'image', and 'transition' but the backend only processes
 * these two. Additional types will be added here once backend handlers exist.
 */
export const SCENE_TYPES = ['talking_head', 'broll'] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const TEMPLATES = [
  'monologue', 'testimonial', 'product-review', 'problem-solution',
  'saas-review', 'before-after', 'listicle', 'product-demo',
] as const;
export type Template = (typeof TEMPLATES)[number];

export const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type Voice = (typeof VOICES)[number];

export const TTS_PROVIDERS = ['openai', 'elevenlabs', 'hume'] as const;
export type TTSProvider = (typeof TTS_PROVIDERS)[number];

export const REVIEW_ANGLES = ['honest', 'enthusiastic', 'roast', 'tutorial', 'comparison'] as const;
export type ReviewAngle = (typeof REVIEW_ANGLES)[number];

export const PIP_POSITIONS = ['bottom-center', 'bottom-left', 'bottom-right'] as const;
export type PIPPosition = (typeof PIP_POSITIONS)[number];

export const PIP_SIZES = ['small', 'medium', 'large'] as const;
export type PIPSize = (typeof PIP_SIZES)[number];

export const PIP_ANIMATIONS = ['slide-up', 'slide-left', 'slide-right', 'fade', 'scale'] as const;
export type PIPAnimation = (typeof PIP_ANIMATIONS)[number];

export const PIP_FRAME_STYLES = ['none', 'rounded', 'shadow'] as const;
export type PIPFrameStyle = (typeof PIP_FRAME_STYLES)[number];

export const COMPOSITION_MODES = ['pip'] as const;
export type CompositionMode = (typeof COMPOSITION_MODES)[number];

/**
 * B-roll model names. DEPRECATED — backend auto-selects the best model.
 * Kept in schema for backwards compatibility (accept but ignore).
 * Will be removed in schema v2.0.0.
 * @deprecated Use the default — backend auto-selects the best model.
 */
export const BROLL_MODELS = ['kling3', 'hailuo2', 'wan21'] as const;
export type BrollModel = (typeof BROLL_MODELS)[number];

// ── Validation constants ────────────────────────────────────────────────────

export const CREDITS_PER_SECOND = 30;
export const SCRIPT_GENERATION_CREDIT_SURCHARGE = 5;

// ── Zod schemas ─────────────────────────────────────────────────────────────

export const PipOptionsSchema = z.object({
  position: z.enum(PIP_POSITIONS).optional(),
  size: z.enum(PIP_SIZES).optional(),
  animation: z.enum(PIP_ANIMATIONS).optional(),
  frame_style: z.enum(PIP_FRAME_STYLES).optional(),
}).strict();

export type PipOptions = z.infer<typeof PipOptionsSchema>;

/**
 * Grouped parameter objects — better DX for new integrations.
 * These are optional alternatives to the flat params.
 * The preprocess step flattens them so downstream code stays unchanged.
 */
export const ActorConfigSchema = z.object({
  slug: z.string().min(1).max(100).optional(),
  persona_slug: z.string().min(1).max(100).optional(),
  face_photo_url: z.string().url().optional(),
  voice: z.string().max(100).optional(),
}).strict().optional();

export const OutputConfigSchema = z.object({
  duration: z.number().refine(
    (v) => (DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 5, 10, or 15' },
  ).optional(),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional(),
  style: z.string().max(50).optional(),
  music: z.enum(MUSIC_GENRES).optional(),
  cta: z.string().max(100).optional(),
}).strict().optional();

export const BrollConfigSchema = z.object({
  enabled: z.boolean().optional(),
  images: z.array(z.string().url()).max(10).optional(),
}).strict().optional();

/**
 * Preprocess: flatten grouped params into flat params.
 * Accepts BOTH flat and grouped — flat params take precedence.
 */
function flattenGroupedParams(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const data = { ...(input as Record<string, unknown>) };

  // Flatten actor config
  const actor = data.actor as Record<string, unknown> | undefined;
  if (actor) {
    if (actor.slug && !data.actor_slug) data.actor_slug = actor.slug;
    if (actor.persona_slug && !data.persona_slug) data.persona_slug = actor.persona_slug;
    if (actor.face_photo_url && !data.face_photo_url) data.face_photo_url = actor.face_photo_url;
    if (actor.voice && !data.voice) data.voice = actor.voice;
    delete data.actor;
  }

  // Flatten output config
  const output = data.output as Record<string, unknown> | undefined;
  if (output) {
    if (output.duration && !data.target_duration) data.target_duration = output.duration;
    if (output.aspect_ratio && !data.aspect_ratio) data.aspect_ratio = output.aspect_ratio;
    if (output.style && !data.style) data.style = output.style;
    if (output.music && !data.music) data.music = output.music;
    if (output.cta && !data.cta) data.cta = output.cta;
    delete data.output;
  }

  // Flatten broll config
  const broll = data.broll as Record<string, unknown> | undefined;
  if (broll) {
    if (broll.enabled !== undefined && data.allow_broll === undefined) data.allow_broll = broll.enabled;
    if (broll.images && !data.broll_images) data.broll_images = broll.images;
    delete data.broll;
  }

  return data;
}

/**
 * Zod schema for video generation.
 *
 * Accepts both flat params and grouped objects:
 *   Flat:    { actor_slug: "sofia", target_duration: 10, allow_broll: true }
 *   Grouped: { actor: { slug: "sofia" }, output: { duration: 10 }, broll: { enabled: true } }
 *   Mixed:   { actor: { slug: "sofia" }, target_duration: 10, allow_broll: true }
 *
 * Flat params take precedence over grouped when both are provided.
 */
export const CreateVideoSchema = z.preprocess(flattenGroupedParams, z.object({
  script: z.string().min(50).max(3000).optional(),
  prompt: z.string().min(1).max(1000).optional(),
  product_url: z.string().url().optional(),
  actor_slug: z.string().min(1).max(100).optional(),
  persona_slug: z.string().min(1).max(100).optional(),
  face_photo_url: z.string().url().optional(),
  voice: z.string().max(100).optional(),
  target_duration: z.number().refine(
    (v) => (DURATIONS as readonly number[]).includes(v),
    { message: 'target_duration must be 5, 10, or 15' },
  ).optional(),
  style: z.string().max(50).optional(),
  tone: z.enum(TONES).optional(),
  voice_speed: z.number().min(0.7).max(1.5).optional(),
  music: z.enum(MUSIC_GENRES).optional(),
  cta: z.string().max(100).optional(),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional(),
  template: z.string().max(50).optional(),
  composition_mode: z.literal('pip').optional(),
  pip_options: PipOptionsSchema.optional(),
  allow_broll: z.boolean().optional(),
  broll_model: z.enum(BROLL_MODELS).optional(),
  broll_images: z.array(z.string().url()).max(10).optional(),
  product_image_url: z.string().url().optional(),
  dub_language: z.string().max(10).optional(),
  webhook_url: z.string().url().optional(),
  scenes: z.array(
    z.object({
      type: z.enum(SCENE_TYPES).optional(),
    }).passthrough(),
  ).max(30).optional(),
}).refine(
  (data) => data.script !== undefined || data.prompt !== undefined,
  { message: 'Either script or prompt is required' },
));

export type CreateVideoInput = z.infer<typeof CreateVideoSchema>;

export const SubtitleSchema = z.object({
  video_url: z.string().url(),
  style: z.enum(SUBTITLE_STYLES).optional(),
});

export type SubtitleInput = z.infer<typeof SubtitleSchema>;

export const SaasReviewSchema = z.preprocess(flattenGroupedParams, z.object({
  script: z.string().min(50).max(3000).optional(),
  prompt: z.string().min(1).max(1000).optional(),
  product_url: z.string().url().optional(),
  angle: z.enum(REVIEW_ANGLES).optional(),
  actor_slug: z.string().min(1).max(100).optional(),
  persona_slug: z.string().min(1).max(100).optional(),
  face_photo_url: z.string().url().optional(),
  voice: z.string().max(100).optional(),
  target_duration: z.number().refine(
    (v) => (DURATIONS as readonly number[]).includes(v),
    { message: 'target_duration must be 5, 10, or 15' },
  ).optional(),
  style: z.string().max(50).optional(),
  tone: z.enum(TONES).optional(),
  voice_speed: z.number().min(0.7).max(1.5).optional(),
  music: z.enum(MUSIC_GENRES).optional(),
  cta: z.string().max(100).optional(),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional(),
  template: z.string().max(50).optional(),
  composition_mode: z.literal('pip').optional(),
  pip_options: PipOptionsSchema.optional(),
  allow_broll: z.boolean().optional(),
  broll_model: z.enum(BROLL_MODELS).optional(),
  broll_images: z.array(z.string().url()).max(10).optional(),
  dub_language: z.string().max(10).optional(),
  webhook_url: z.string().url().optional(),
  scenes: z.array(
    z.object({
      type: z.enum(SCENE_TYPES).optional(),
    }).passthrough(),
  ).max(30).optional(),
}).refine(
  (data) => data.script !== undefined || data.prompt !== undefined || data.product_url !== undefined,
  { message: 'script, prompt, or product_url is required' },
));

export type SaasReviewInput = z.infer<typeof SaasReviewSchema>;

/**
 * @deprecated Use SaasReviewSchema. Kept for API/SDK compatibility.
 */
export const ProductReviewSchema = SaasReviewSchema;

/**
 * @deprecated Use SaasReviewInput. Kept for API/SDK compatibility.
 */
export type ProductReviewInput = SaasReviewInput;

export const SHOW_YOUR_APP_WORDS_PER_SECOND = 3;
export const SHOW_YOUR_APP_DURATIONS = [5, 10, 15] as const;

export const ShowYourAppSchema = z.object({
  app_screenshot_url: z.string().url(),
  actor_slug: z.string().min(1).max(100).optional(),
  script: z.string().min(5).max(3000),
  duration: z.number().refine(
    (v) => (SHOW_YOUR_APP_DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 5, 10, or 15' },
  ).optional().default(5),
  subtitle_style: z.enum(['hormozi', 'none']).optional().default('hormozi'),
  webhook_url: z.string().url().optional(),
}).superRefine((val, ctx) => {
  const duration = val.duration ?? 5;
  const maxWords = duration * SHOW_YOUR_APP_WORDS_PER_SECOND;
  const wordCount = val.script.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > maxWords) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['script'],
      message: `Script has ${wordCount} words; max ${maxWords} for ${duration}s at ${SHOW_YOUR_APP_WORDS_PER_SECOND} words/sec`,
    });
  }
});

export type ShowYourAppInput = z.infer<typeof ShowYourAppSchema>;

// ── Laptop UGC ──────────────────────────────────────────────────────────────

export const LAPTOP_UGC_WORDS_PER_SECOND = 3;
export const LAPTOP_UGC_DURATIONS = [15, 20] as const;
export const LAPTOP_UGC_MAX_RECORDING_BYTES = 10 * 1024 * 1024; // 10 MB
export const LAPTOP_UGC_MAX_RECORDING_SECONDS = 10;
export const LAPTOP_UGC_RECORDING_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const LAPTOP_UGC_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const LAPTOP_UGC_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const LaptopUgcSchema = z.object({
  app_screen_recording_url: z.string().url().optional().describe('Public URL of a screen recording of your app (mp4 or mov). Max 10 MB, max 10 seconds. Provide this OR app_screen_image_url, not both.'),
  app_screen_image_url: z.string().url().optional().describe('Public URL of a static screenshot of your app (png, jpeg, or webp). Max 5 MB. Provide this OR app_screen_recording_url, not both.'),
  actor_slug: z.string().min(1).max(100).optional().describe('Actor slug from GET /v1/actors. Random actor if omitted.'),
  script: z.string().min(5).max(3000).describe('Full voiceover script. Auto-split at sentence boundary into two halves for the two face shots.'),
  duration: z.number().refine(
    (v) => (LAPTOP_UGC_DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 15 or 20' },
  ).optional().default(20),
  subtitle_style: z.enum(['hormozi', 'none']).optional().default('hormozi'),
  webhook_url: z.string().url().optional(),
}).superRefine((val, ctx) => {
  // Exactly one of recording / image must be provided
  const hasRecording = !!val.app_screen_recording_url;
  const hasImage = !!val.app_screen_image_url;
  if (hasRecording && hasImage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['app_screen_recording_url'],
      message: 'Provide app_screen_recording_url OR app_screen_image_url, not both',
    });
  }
  if (!hasRecording && !hasImage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['app_screen_recording_url'],
      message: 'Either app_screen_recording_url or app_screen_image_url is required',
    });
  }
  // Word-count cap
  const duration = val.duration ?? 20;
  const maxWords = duration * LAPTOP_UGC_WORDS_PER_SECOND;
  const wordCount = val.script.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > maxWords) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['script'],
      message: `Script has ${wordCount} words; max ${maxWords} for ${duration}s at ${LAPTOP_UGC_WORDS_PER_SECOND} words/sec`,
    });
  }
});

export type LaptopUgcInput = z.infer<typeof LaptopUgcSchema>;

export const PRODUCT_ACTING_WORDS_PER_SECOND = 3;
export const PRODUCT_ACTING_DURATIONS = [5, 10, 15] as const;
export const PRODUCT_ACTING_TEMPLATES = [
  'product-in-hand',
  'mirror-selfie',
  'bathroom-reaction',
  'kitchen-counter',
  'car-selfie',
  'couch-review',
  'expert-interview',
  'product-closeup',
] as const;
export const PRODUCT_ACTING_STYLES = [
  'raw-selfie',
  'shocked',
  'angry',
  'excited',
  'dramatic',
  'weird-hook',
  'casual-demo',
  'honest-review',
] as const;

export const ProductActingSchema = z.object({
  product_image_url: z.string().url().describe('Public URL of the product image to place in the actor scene. PNG, JPEG, or WebP recommended.'),
  actor_slug: z.string().min(1).max(100).describe('Actor slug from GET /v1/actors. This actor is used as the creator reference.'),
  actor_variant_id: z.string().uuid().optional().describe('Optional actor variant UUID for a specific outfit, framing, expression, or background.'),
  product_name: z.string().min(1).max(120).optional().describe('Optional product name used for prompt/script context.'),
  product_description: z.string().min(1).max(1000).optional().describe('Product context used to generate a short script when script is omitted. Required when script is omitted.'),
  script: z.string().min(5).max(3000).optional().describe('Exact words the actor should say. If omitted, the API generates a short script from product_description.'),
  template: z.enum(PRODUCT_ACTING_TEMPLATES).optional().default('product-in-hand').describe('UGC scenario template for the generated frame and motion.'),
  acting_style: z.enum(PRODUCT_ACTING_STYLES).optional().default('raw-selfie').describe('Acting energy and delivery style.'),
  visual_style: z.string().max(200).optional().describe('Extra camera, pose, environment, or framing direction.'),
  duration: z.number().refine(
    (v) => (PRODUCT_ACTING_DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 5, 10, or 15' },
  ).optional().default(5).describe('Video duration in seconds. Valid values: 5, 10, or 15.'),
  subtitles: z.boolean().optional().default(true).describe('Whether to burn word-level synced subtitles into the final video.'),
  subtitle_style: z.enum(['hormozi', 'none']).optional().default('hormozi').describe('Subtitle style. Use none to disable subtitle rendering.'),
  webhook_url: z.string().url().optional().describe('HTTPS URL to receive a callback when the job completes or fails.'),
}).superRefine((val, ctx) => {
  if (!val.script && !val.product_description) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['product_description'],
      message: 'Either script or product_description is required',
    });
    return;
  }

  if (!val.script) return;

  const duration = val.duration ?? 5;
  const maxWords = duration * PRODUCT_ACTING_WORDS_PER_SECOND;
  const wordCount = val.script.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > maxWords) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['script'],
      message: `Script has ${wordCount} words; max ${maxWords} for ${duration}s at ${PRODUCT_ACTING_WORDS_PER_SECOND} words/sec`,
    });
  }
});

export type ProductActingInput = z.infer<typeof ProductActingSchema>;

// ── Character Video ────────────────────────────────────────────────────────
//
// 3-step pipeline:
//   Step 1: Character reference sheet (PNG)
//             — POST /v1/character/sheet-generate
//             — actor_slug returns portrait_url (free), description calls
//               gpt-image-2 (~$0.04)
//   Step 2: Storyboard sheet (PNG)
//             — POST /v1/character/storyboard-generate
//             — gpt-image-2 paints numbered panels using the character
//               sheet as a reference so panels stay on-character (~$0.04)
//   Step 3: Final video (this generator)
//             — Seedance 2.0 multimodal: image_urls = [character, storyboard]
//               + short action_prompt + duration/ratio settings
//
// All three URLs must be public HTTPS so Seedance can fetch them.

export const CHARACTER_VIDEO_DURATIONS = [5, 10] as const;
export const CHARACTER_VIDEO_RATIOS = ['9:16', '16:9', '1:1'] as const;

export const CharacterVideoSchema = z.object({
  character_sheet_url: z.string().url().describe(
    'Public HTTPS URL of the character reference sheet PNG. Generate one via POST /v1/character/sheet-generate or upload your own.',
  ),
  storyboard_url: z.string().url().describe(
    'Public HTTPS URL of the storyboard panels PNG. Generate one via POST /v1/character/storyboard-generate or upload your own.',
  ),
  action_prompt: z.string().min(1).max(2000).optional().describe(
    'Optional scene/action description sent to Seedance as the primary scene driver (e.g. "Marco the chef in his Brooklyn kitchen at golden hour, takes a bite of fresh bread"). When omitted, the api-v2 server backstops it from the same session\'s storyboard job (script or beats) — without a real scene description Seedance picks the location arbitrarily.',
  ),
  duration: z.number().refine(
    (v) => (CHARACTER_VIDEO_DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 5 or 10' },
  ).optional().default(10).describe('Video duration in seconds. Valid values: 5 or 10. Max 10s — Seedance i2v quality degrades past 10s with multimodal inputs.'),
  aspect_ratio: z.enum(CHARACTER_VIDEO_RATIOS).optional().default('9:16').describe('Output aspect ratio. Default 9:16.'),
  generate_audio: z.boolean().optional().default(true).describe('Whether Seedance synthesizes synchronized audio (ambient sounds, breath, etc.).'),
  session_id: z.string().uuid().optional().describe('Optional UUID linking the three pipeline steps (sheet → storyboard → video) into one wizard session. Same value across calls makes inserts idempotent and lets api-v2 backstop action_prompt from the storyboard step.'),
  webhook_url: z.string().url().optional().describe('HTTPS URL to receive a callback when the job completes or fails.'),
});

export type CharacterVideoInput = z.infer<typeof CharacterVideoSchema>;

// ── Text-to-Video (pure prompt, no character / no storyboard) ──────────────
//
// Drives Seedance 2.0 text-to-video. The prompt IS the whole creative —
// style, subject, mood, composition all baked into one string. Used by
// the "Use prompts" batch-schedule mode and as a one-shot generator
// for Claude Code / MCP / CLI workflows where the agent already has a
// fully-formed video prompt.

export const TEXT_TO_VIDEO_DURATIONS = [5, 10, 15] as const;
export const TEXT_TO_VIDEO_RATIOS = ['9:16', '16:9', '1:1'] as const;

export const TextToVideoSchema = z.object({
  prompt: z.string().min(20).max(1000).describe(
    'The full video prompt. Style, subject, mood, composition, lighting, lens, motion — all in one string. Seedance reads this verbatim. Min 20 / max 1000 chars.',
  ),
  duration: z.number().refine(
    (v) => (TEXT_TO_VIDEO_DURATIONS as readonly number[]).includes(v),
    { message: 'duration must be 5, 10, or 15' },
  ).optional().default(10).describe('Video duration in seconds. Valid: 5, 10, or 15.'),
  aspect_ratio: z.enum(TEXT_TO_VIDEO_RATIOS).optional().default('9:16').describe(
    'Output aspect ratio. 9:16 portrait (TikTok / Reels / Shorts), 1:1 square (feed posts), 16:9 landscape (YouTube / X / LinkedIn). Default 9:16.',
  ),
  generate_audio: z.boolean().optional().default(true).describe(
    'Whether Seedance synthesizes synchronized audio. No extra charge.',
  ),
  webhook_url: z.string().url().optional().describe(
    'HTTPS URL to receive a callback when the job completes or fails.',
  ),
  /** When set, on completion the webhook-provider fans the rendered MP4
   *  out to these Postiz integrations (X, LinkedIn, etc.). Use the IDs
   *  returned from GET /v1/integrations/postiz/accounts. */
  postiz_integration_ids: z.array(z.string()).optional().describe(
    'Postiz integration IDs to auto-publish to once the video is rendered. Get them from GET /v1/integrations/postiz/accounts.',
  ),
  /** How to compose the social caption. 'static' = use `caption` verbatim. 'ai' = Claude writes one using `caption_guidance` as bias. */
  caption_mode: z.enum(['ai', 'static']).optional().default('static').describe(
    "Caption mode for auto-publish. 'static' (default) uses the literal `caption` string. 'ai' has Claude Opus generate one each time, biased by `caption_guidance`.",
  ),
  caption: z.string().min(1).max(2000).optional().describe(
    'Literal caption text for the social post. Only used when caption_mode is omitted or "static".',
  ),
  caption_guidance: z.string().min(1).max(1000).optional().describe(
    'Tone / hashtag / length hints for the AI caption writer. Only used when caption_mode is "ai".',
  ),
});

export type TextToVideoInput = z.infer<typeof TextToVideoSchema>;

// ── Step 1 of 3: Character Sheet generation ─────────────────────────────────
//
// POST /v1/character/sheet-generate. Async — returns 202 + job_id.
// Pricing: 12 credits ($0.12) for actor/reference (1 gpt-image-2 call),
//          20 credits ($0.20) for description-only (paint portrait + sheet).

export const CharacterSheetSchema = z.object({
  description: z.string().min(3).max(400).optional().describe(
    'Free-text description of the character (e.g. "Marco, a 35yo Italian chef with curly black hair, white uniform"). When provided alongside a reference image, it adds context. When provided alone (no actor_slug, no reference_image_url), the worker first paints a portrait via gpt-image-2 text-to-image, then turns it into the sheet.',
  ),
  actor_slug: z.string().min(1).optional().describe(
    'Slug of an actor from the agent-media library. The actor\'s portrait is used as the reference image. List actors via GET /v1/actors. Mutually exclusive with reference_image_url.',
  ),
  reference_image_url: z.string().url().optional().describe(
    'Public HTTPS URL of a portrait/reference image (PNG/JPEG/WebP, <5MB recommended). Mutually exclusive with actor_slug.',
  ),
  session_id: z.string().uuid().optional().describe('Optional UUID linking the three pipeline steps. Same value across calls makes inserts idempotent.'),
}).refine(
  (v) => Boolean(v.description) || Boolean(v.actor_slug) || Boolean(v.reference_image_url),
  { message: 'Provide at least one of: description, actor_slug, or reference_image_url' },
).refine(
  (v) => !(v.actor_slug && v.reference_image_url),
  { message: 'actor_slug and reference_image_url are mutually exclusive' },
);

export type CharacterSheetInput = z.infer<typeof CharacterSheetSchema>;

// ── Step 2 of 3: Storyboard generation ──────────────────────────────────────
//
// POST /v1/character/storyboard-generate. Async — returns 202 + job_id.
// Pricing: 12 credits ($0.12).
// Provide EITHER `beats` (3-10 short strings, gpt-image-2 paints them as
// numbered panels) OR `script` (free-text up to 1500 chars; gpt-image-2
// splits it into 4-6 panels itself).

export const STORYBOARD_RATIOS = ['9:16', '16:9', '1:1'] as const;

export const CharacterStoryboardSchema = z.object({
  character_sheet_url: z.string().url().describe(
    'Public HTTPS URL of the character sheet PNG (from /v1/character/sheet-generate). Used as the visual reference so the character stays on-model across panels.',
  ),
  beats: z.array(z.string().min(3).max(200)).min(3).max(10).optional().describe(
    'Ordered list of 3-10 short beat descriptions, one per panel (e.g. ["Marco walks into kitchen", "pulls bread from oven", "takes a bite", "thumbs up"]). Mutually exclusive with `script`.',
  ),
  script: z.string().min(10).max(1500).optional().describe(
    'Free-text script (10-1500 chars). gpt-image-2 splits it into 4-6 sequential panels itself. Mutually exclusive with `beats`.',
  ),
  ratio: z.enum(STORYBOARD_RATIOS).optional().default('9:16').describe('Storyboard sheet aspect ratio. Default 9:16.'),
  session_id: z.string().uuid().optional().describe('Optional UUID linking the three pipeline steps.'),
}).refine(
  (v) => Boolean(v.beats) !== Boolean(v.script),
  { message: 'Provide exactly one of: beats or script' },
);

export type CharacterStoryboardInput = z.infer<typeof CharacterStoryboardSchema>;

// ── Helper: AI-suggested beats ─────────────────────────────────────────────
//
// POST /v1/character/storyboard-suggest. Sync — returns immediately.
// No credits. Returns 3 distinct beat-sequence options for the wizard.

export const StoryboardSuggestSchema = z.object({
  actor_slug: z.string().min(1).optional().describe('Library actor whose persona drives the suggestions. Mutually exclusive with character_description.'),
  character_description: z.string().min(1).max(200).optional().describe('1-200 char description of the character. Mutually exclusive with actor_slug.'),
  vibe: z.string().min(1).max(200).optional().describe('Optional vibe note that biases all 3 options (e.g. "wholesome", "chaotic", "cinematic").'),
  duration: z.number().refine((v) => v === 5 || v === 10, { message: 'duration must be 5 or 10' }).optional().default(10),
  n_panels: z.number().int().min(4).max(10).optional().default(6).describe('Panels per option (the storyboard sheet will be an n_panels-panel grid).'),
}).refine(
  (v) => Boolean(v.actor_slug) !== Boolean(v.character_description),
  { message: 'Provide exactly one of: actor_slug or character_description' },
);

export type StoryboardSuggestInput = z.infer<typeof StoryboardSuggestSchema>;
