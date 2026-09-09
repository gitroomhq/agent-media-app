// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · The model catalog.
 *
 * One record per generation model agent-media can route to, in one file,
 * the way V2_GENERATORS is one record per product. Everything that talks
 * about models reads from here: GET /v1/models, the list_models MCP tool,
 * the per-model docs in docs/models/, the public skill pack, the website
 * Docs section and the pricing tests.
 *
 * Why a catalog and not just an `engine` enum: the product direction is
 * "let the agent choose the model for the job". An agent chooses well only
 * when the choice is machine-readable: which MODES a model has (text,
 * first frame, references), the exact limits of each mode, the price per
 * quality, what it is good at and what it is bad at. So every field below
 * exists to be read by a model, not a human.
 *
 * Every limit on a video mode comes from the provider's OpenAPI spec for
 * that exact provider model id (EvoLink /v1/videos/generations), not from
 * a marketing page. When a spec and this file disagree, the spec wins and
 * this file is wrong: fix it here, everything downstream regenerates.
 *
 * Status rules, and they are strict:
 *   live       selectable in the API today. Has credits. Must have a docs
 *              file. `verified` on a mode records the run that proved it.
 *   candidate  in the catalog so the plan is visible, NOT selectable and
 *              NOT returned by list_models by default. No user credits
 *              until a real run is recorded.
 *   retired    kept for old run rows to resolve; never selectable.
 *
 * What we pay providers is NOT in this file and must never be: it is
 * internal. Prices here are what the user pays, in credits (1 = $0.01).
 */

import { z } from 'zod';

export const V2_MODEL_KINDS = ['image', 'video', 'audio'] as const;
export type V2ModelKind = (typeof V2_MODEL_KINDS)[number];

export const V2_MODEL_TIERS = ['draft', 'standard', 'premium'] as const;
export type V2ModelTier = (typeof V2_MODEL_TIERS)[number];

export const V2_MODEL_STATUSES = ['live', 'candidate', 'retired'] as const;
export type V2ModelStatus = (typeof V2_MODEL_STATUSES)[number];

export const V2_MODEL_PROVIDERS = ['evolink', 'openai', 'elevenlabs'] as const;
export type V2ModelProvider = (typeof V2_MODEL_PROVIDERS)[number];

/** Coarse capability tags (all kinds). The video detail lives in `video.modes`. */
export const V2_MODEL_MODES = [
  'text-to-video',
  'image-to-video',
  'reference-to-video',
  'lipsync',
  'text-to-image',
  'image-edit',
  'text-to-speech',
  'music',
  'upscale',
] as const;
export type V2ModelMode = (typeof V2_MODEL_MODES)[number];

// ── Video modes (the loose surface) ──────────────────────────────────────

/**
 * How a video request is routed. The mode is DERIVED from the request:
 *   image      first_frame (and optional last_frame) given: animate that frame
 *   reference  refs / video_refs / audio_refs given: keep that identity, look, motion or sound
 *   text       neither: the prompt alone
 * One provider model id per (catalog model, mode).
 */
export const V2_VIDEO_MODES = ['text', 'image', 'reference'] as const;
export type V2VideoMode = (typeof V2_VIDEO_MODES)[number];

export const V2_VIDEO_ASPECTS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9', 'adaptive'] as const;
export type V2VideoAspect = (typeof V2_VIDEO_ASPECTS)[number];

export const V2_VIDEO_QUALITIES = ['480p', '720p', '1080p'] as const;
export type V2VideoQuality = (typeof V2_VIDEO_QUALITIES)[number];
export const V2_DEFAULT_VIDEO_QUALITY: V2VideoQuality = '720p';

export const V2VerifiedSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runId: z.string().optional(),
  note: z.string().optional(),
});
export type V2Verified = z.infer<typeof V2VerifiedSchema>;

export const V2VideoModeSpecSchema = z.object({
  /** The exact id sent to the provider for this mode. From the spec. */
  providerModel: z.string().min(1),
  /** Inclusive clip length range in seconds. */
  seconds: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  aspects: z.array(z.enum(V2_VIDEO_ASPECTS)).min(1),
  aspectDefault: z.enum(V2_VIDEO_ASPECTS),
  qualities: z.array(z.enum(V2_VIDEO_QUALITIES)).min(1),
  /** image mode: whether a last_frame is accepted next to first_frame. */
  lastFrame: z.boolean().optional(),
  /** reference mode: how many of each reference the provider takes. */
  refs: z
    .object({
      images: z.number().int().nonnegative(),
      videos: z.number().int().nonnegative(),
      audios: z.number().int().nonnegative(),
      /** Provider caps on the SUM of reference clip lengths. */
      videoSecondsTotal: z.number().positive().optional(),
      audioSecondsTotal: z.number().positive().optional(),
      /** false: audio references need an image or video reference beside them. */
      audioAlone: z.boolean(),
    })
    .optional(),
  /** How the prompt addresses the references, e.g. "@image1 @video1 @audio1". */
  promptSyntax: z.string().optional(),
  /** Whether the provider accepts a seed in this mode. */
  seed: z.boolean().default(false),
  /** Provider gotchas an agent must know before calling. */
  notes: z.array(z.string()).default([]),
  /** The run that proved this exact cell. */
  verified: V2VerifiedSchema.optional(),
});
export type V2VideoModeSpec = z.infer<typeof V2VideoModeSpecSchema>;

export const V2VideoSpecSchema = z.object({
  modes: z.record(z.enum(V2_VIDEO_MODES), V2VideoModeSpecSchema),
  /**
   * Credits per OUTPUT second at each quality. Reference VIDEO seconds
   * (video_refs) are billed at the same rate as output seconds because the
   * provider bills them; the quote says so.
   */
  creditsPerSecond: z.record(z.enum(V2_VIDEO_QUALITIES), z.number().int().positive()).optional(),
  /** Wall-clock budget the worker waits for one clip. */
  timeoutMinutes: z.number().int().positive(),
});
export type V2VideoSpec = z.infer<typeof V2VideoSpecSchema>;

/**
 * What the USER pays. Present only on live models. perUnit may be
 * fractional (per-character audio is 0.01); quoteGenerate() rounds the
 * TOTAL up to whole credits, never the rate. For video, perUnit is the
 * rate at the default quality (720p); video.creditsPerSecond has the rest.
 */
export const V2ModelCreditsSchema = z.object({
  unit: z.enum(['second', 'image', 'clip', 'character']),
  perUnit: z.number().nonnegative(),
  /** Fixed prelude per job (portrait, sheet, storage). */
  base: z.number().int().nonnegative().optional(),
});

/** The "how to use it" card. Read by list_models, the skill pack and the docs. */
export const V2ModelUsageSchema = z.object({
  /** One line: "pick this when ...". Agents pattern-match on this first. */
  pickWhen: z.string().min(1),
  /** How to write the prompt for this model. */
  promptTips: z.array(z.string()).min(1),
  /** Expected wall-clock, as measured. */
  latency: z.string().min(1),
});

export const V2ModelRecordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
    provider: z.enum(V2_MODEL_PROVIDERS),
    /** The identifier sent to the provider (non-video kinds; video uses video.modes). */
    providerModel: z.string().min(1),
    kind: z.enum(V2_MODEL_KINDS),
    tier: z.enum(V2_MODEL_TIERS),
    status: z.enum(V2_MODEL_STATUSES),
    modes: z.array(z.enum(V2_MODEL_MODES)).min(1),
    features: z.array(z.string()).default([]),
    /** Non-video limits (image sizes, ref counts). Video limits live in `video`. */
    limits: z
      .object({
        resolutions: z.array(z.string()).optional(),
        refsMax: z.number().int().nonnegative().optional(),
      })
      .default({}),
    video: V2VideoSpecSchema.optional(),
    /**
     * Image models: the provider quality tier we send. It is not a user
     * choice (one price per image), it is the tier this model is priced
     * and verified at, so the worker never hardcodes it.
     */
    image: z.object({ quality: z.enum(['low', 'medium', 'high', 'xhigh']) }).optional(),
    credits: V2ModelCreditsSchema.optional(),
    quality: z.enum(['draft', 'good', 'premium']),
    speed: z.enum(['fast', 'medium', 'slow']),
    bestFor: z.array(z.string()).min(1),
    avoidFor: z.array(z.string()).default([]),
    usage: V2ModelUsageSchema.optional(),
    /** Repo-relative path of the usage notes. Shipped in the skill pack. */
    docs: z.string().regex(/^docs\/models\/[a-z0-9.-]+\.md$/),
    /** The run that proved the model (non-video kinds; video cells carry their own). */
    verified: V2VerifiedSchema.optional(),
  })
  .superRefine((m, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${m.id}: ${message}` });
    if (m.status === 'live' && !m.credits) issue('live models must carry user credits');
    if (m.status !== 'live' && m.credits) issue('only live models may carry user credits');
    if (m.status === 'live' && !m.usage) issue('live models must carry a usage card');
    if (m.kind === 'video') {
      if (!m.video) issue('video models must carry video.modes');
      else {
        if (m.status === 'live' && !m.video.creditsPerSecond) issue('live video models must price every quality');
        for (const [mode, spec] of Object.entries(m.video.modes)) {
          if (!spec.aspects.includes(spec.aspectDefault)) issue(`${mode}: aspectDefault not in aspects`);
          if (spec.seconds[0] > spec.seconds[1]) issue(`${mode}: seconds range inverted`);
          if (mode === 'reference' && !spec.refs) issue('reference mode needs refs limits');
          if (m.status === 'live' && m.video.creditsPerSecond) {
            for (const q of spec.qualities) if (!(q in m.video.creditsPerSecond)) issue(`${mode}: quality ${q} has no price`);
          }
        }
        if (m.credits && m.video.creditsPerSecond && m.credits.perUnit !== m.video.creditsPerSecond[V2_DEFAULT_VIDEO_QUALITY]) {
          issue(`credits.perUnit must equal creditsPerSecond[${V2_DEFAULT_VIDEO_QUALITY}]`);
        }
      }
    } else if (m.video) issue('only video models carry video.modes');
    if (m.kind === 'image' && m.status === 'live' && !m.image) issue('live image models must name the provider quality tier');
    if (m.kind !== 'image' && m.image) issue('only image models carry an image block');
  });

export type V2ModelRecord = z.infer<typeof V2ModelRecordSchema>;

// ── Shared spec fragments ─────────────────────────────────────────────────

const ALL_ASPECTS = [...V2_VIDEO_ASPECTS];
const ALL_QUALITIES = [...V2_VIDEO_QUALITIES];
const SEEDANCE_TAGS = '@image1 @video1 @audio1 (numbered per list, from 1)';
const SEEDANCE_20_REFS = { images: 9, videos: 3, audios: 3, videoSecondsTotal: 15, audioSecondsTotal: 15, audioAlone: false } as const;
const SEEDANCE_25_REFS = { images: 30, videos: 10, audios: 10, videoSecondsTotal: 30, audioSecondsTotal: 30, audioAlone: true } as const;

// ── The catalog ───────────────────────────────────────────────────────────
//
// Credit prices for the live models are the ones customers pay today. The
// per-quality ladder scales with the provider's own resolution ladder.
// Seedance per-second credits at 720p match V2_GENERATORS.selfie /
// crazy_look engine tiers exactly; a test enforces that parity so a price
// can never drift between "the catalog says" and "the debit does".

export const V2_MODELS: Record<string, V2ModelRecord> = {
  // ── live ───────────────────────────────────────────────────────────────
  'seedance-2.0': {
    id: 'seedance-2.0',
    provider: 'evolink',
    providerModel: 'seedance-2.0-text-to-video',
    kind: 'video',
    limits: {},
    tier: 'standard',
    status: 'live',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['native-audio', 'lip-sync', 'first-frame', 'first-and-last-frame', 'image-references', 'video-references', 'audio-references'],
    video: {
      timeoutMinutes: 30,
      creditsPerSecond: { '480p': 30, '720p': 60, '1080p': 150 },
      modes: {
        text: {
          providerModel: 'seedance-2.0-text-to-video',
          seconds: [4, 15],
          aspects: ALL_ASPECTS,
          aspectDefault: '9:16',
          qualities: ALL_QUALITIES,
          seed: false,
          notes: ['No seed. Every render is new; keep a series consistent with references, not seeds.'],
          verified: { date: '2026-09-06', runId: 'task-unified-1788681109-ghg38bm9', note: '4s, 16:9, 480p, native audio; rendered in 231 s' },
        },
        image: {
          providerModel: 'seedance-2.0-image-to-video',
          seconds: [4, 15],
          aspects: ALL_ASPECTS,
          aspectDefault: 'adaptive',
          qualities: ALL_QUALITIES,
          lastFrame: true,
          seed: false,
          notes: [
            'first_frame becomes frame one of the clip; last_frame (optional) becomes the final frame and the model animates between them.',
            'Frames only: refs, video_refs and audio_refs are not accepted in this mode. To keep an identity AND set the frame, put the frame image in refs and describe it as @image1.',
            'aspect "adaptive" (default) follows the first frame. Frame images: jpeg/png/webp, ratio between 0.4 and 2.5, 300 to 6000 px, up to 30 MB.',
          ],
          verified: { date: '2026-09-06', runId: 'task-unified-1788681109-qybq2r1j', note: 'first_frame only (4s, 480p, adaptive) and first_frame + last_frame (task-unified-1788681109-w09254uu); both rendered in about 3 to 5 min' },
        },
        reference: {
          providerModel: 'seedance-2.0-reference-to-video',
          seconds: [4, 15],
          aspects: ALL_ASPECTS,
          aspectDefault: '9:16',
          qualities: ALL_QUALITIES,
          refs: SEEDANCE_20_REFS,
          promptSyntax: SEEDANCE_TAGS,
          seed: false,
          notes: [
            'Address references in the prompt: "@image1 holds @image2 and says ...". Numbering is per list: refs are @image1.., video_refs are @video1.., audio_refs are @audio1...',
            'Reference clips: 2 to 15 s each, 15 s in total, mp4/mov 480p to 1080p, 24 to 60 fps, up to 50 MB. Their seconds are billed like output seconds.',
            'Audio references: wav/mp3, 2 to 15 s each, 15 s in total, up to 15 MB. Audio alone is not accepted: add an image or video reference.',
            'aspect "adaptive" follows the first video reference, else the first image, else the prompt.',
          ],
          verified: { date: '2026-09-06', runId: 'task-unified-1788681109-a6w7aq0y', note: 'image ref (4s, 480p) and image ref + 8 s reference clip (task-unified-1788681110-hdbufncn); earlier 5s 720p portrait run b0011e92 via Claude Code' },
        },
      },
    },
    credits: { unit: 'second', perUnit: 60 },
    quality: 'good',
    speed: 'medium',
    bestFor: ['talking-head UGC', 'product in hands', 'crazy look', 'bulk daily posts', 'animating a still (first frame) into a clip'],
    avoidFor: ['clips over 15s', 'hero shots where 2.5 detail is worth 2x the price', 'anything that needs a seed'],
    usage: {
      pickWhen: 'you need a real-looking person saying real words, or a still brought to life, at a normal budget',
      promptTips: [
        'Write the shot as a director: who (age, look), where (setting, light), what happens, phone framing, and the exact spoken words in quotes. About 2.3 words per second.',
        'Keep a person consistent across clips with refs (a portrait or a character sheet), addressed as @image1; the model has no seed.',
        'To animate a specific still, pass it as first_frame; add last_frame to control where the motion ends.',
      ],
      latency: 'about 3 minutes for a 5 s clip at 720p',
    },
    docs: 'docs/models/seedance-2.0.md',
  },
  'seedance-2.5': {
    id: 'seedance-2.5',
    provider: 'evolink',
    providerModel: 'seedance-2.5-text-to-video',
    kind: 'video',
    limits: {},
    tier: 'premium',
    status: 'live',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['native-audio', 'lip-sync', 'first-frame', 'first-and-last-frame', 'image-references', 'video-references', 'audio-references'],
    video: {
      timeoutMinutes: 90,
      creditsPerSecond: { '480p': 60, '720p': 125, '1080p': 225 },
      modes: {
        text: {
          providerModel: 'seedance-2.5-text-to-video',
          seconds: [4, 15],
          aspects: ALL_ASPECTS,
          aspectDefault: '9:16',
          qualities: ALL_QUALITIES,
          seed: false,
          notes: ['No seed.'],
          verified: { date: '2026-09-05', runId: '431f82ba-9e9e-4644-beb3-b1f67c0de91e', note: 'generate_video, text only, 4s, 720p, 396 credits; the provider took about 25 min' },
        },
        image: {
          providerModel: 'seedance-2.5-image-to-video',
          seconds: [4, 15],
          aspects: ['adaptive'],
          aspectDefault: 'adaptive',
          qualities: ALL_QUALITIES,
          lastFrame: true,
          seed: false,
          notes: [
            'first_frame becomes frame one; last_frame (optional) becomes the final frame.',
            'aspect must be "adaptive" on this model in image mode: the clip takes the frame\'s ratio. Any other aspect is refused.',
            'Frames only: refs, video_refs and audio_refs are not accepted in this mode.',
          ],
          verified: { date: '2026-09-06', runId: 'task-unified-1788681109-pzf704jd', note: 'first_frame, 4s, 480p, adaptive; rendered in 262 s' },
        },
        reference: {
          providerModel: 'seedance-2.5-reference-to-video',
          seconds: [4, 15],
          aspects: ALL_ASPECTS,
          aspectDefault: '9:16',
          qualities: ALL_QUALITIES,
          refs: SEEDANCE_25_REFS,
          promptSyntax: SEEDANCE_TAGS,
          seed: false,
          notes: [
            'Address references as @image1.., @video1.., @audio1.. (numbered per list).',
            'Reference clips: 2 to 30 s each, 30 s in total, up to 4K, up to 200 MB; their seconds are billed like output seconds. Audio references may stand alone here.',
            'Never write edit or extend intent ("edit the video", "add", "remove", "replace", "extend", "continue") into a reference prompt: the provider reclassifies the task and fails it minutes later. Describe the NEW clip you want.',
          ],
          verified: { date: '2026-09-06', note: 'generate_video with a product image ref via Claude Code, 8s, 720p (perfume UGC run)' },
        },
      },
    },
    credits: { unit: 'second', perUnit: 125 },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['hero product ads', 'close-up faces', 'one clip that has to be the best'],
    avoidFor: ['drafts', 'bulk', 'anything where 2.0 is good enough: it is about 2x the credits', 'anyone who cannot wait 15 to 30 minutes'],
    usage: {
      pickWhen: 'the user asked for the best possible single clip and accepts the wait and about 2x the price',
      promptTips: [
        'Same director-style prompt and @image1 references as seedance-2.0.',
        'In image mode leave aspect out (it is adaptive); the frame decides the ratio.',
        'Do not put edit or extend wording in a reference prompt.',
      ],
      latency: '12 to 25 minutes per clip; plan the wait',
    },
    docs: 'docs/models/seedance-2.5.md',
  },
  'gpt-image-2.5': {
    id: 'gpt-image-2.5',
    provider: 'openai',
    providerModel: 'gpt-image-2.5-sunburst',
    kind: 'image',
    tier: 'premium',
    status: 'live',
    modes: ['text-to-image', 'image-edit'],
    features: ['portrait', 'character-sheet', 'wireframe', 'identity-hold', 'multi-reference', 'prompt-adherence'],
    limits: { resolutions: ['1024x1024', '1024x1536', '1536x1024'], refsMax: 4 },
    image: { quality: 'high' },
    credits: { unit: 'image', perUnit: 20 },
    quality: 'premium',
    speed: 'fast',
    bestFor: ['portraits and character sheets that a video has to keep', 'the first frame of a clip', 'product in hand', 'edits that must not lose the face'],
    avoidFor: ['bulk throwaway drafts where gpt-image-2.5-flare is faster'],
    usage: {
      pickWhen: 'you are making the image a video will be built on: a portrait, a character sheet, a first frame, or an edit that has to keep the same person',
      promptTips: [
        'Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "four poses on a plain background" or "headroom for a caption".',
        'With refs it edits or composes from them and holds the identity across poses, which is what makes a character sheet usable as a video reference.',
        'Pass the result straight to generate_video as first_frame (to animate it) or in refs (to keep that person across clips).',
      ],
      latency: 'about 30 seconds, a little longer for an edit with references',
    },
    docs: 'docs/models/gpt-image-2.5.md',
  },
  'gpt-image-2.5-flare': {
    id: 'gpt-image-2.5-flare',
    provider: 'openai',
    providerModel: 'gpt-image-2.5-flare',
    kind: 'image',
    tier: 'standard',
    status: 'live',
    modes: ['text-to-image', 'image-edit'],
    features: ['portrait', 'character-sheet', 'wireframe', 'fast'],
    limits: { resolutions: ['1024x1024', '1024x1536', '1536x1024'], refsMax: 4 },
    image: { quality: 'high' },
    credits: { unit: 'image', perUnit: 20 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['variants and drafts at the same quality tier', 'batches of frames', 'anything where a few seconds matter'],
    avoidFor: ['the one sheet a whole series depends on, where gpt-image-2.5 edits hold identity a little better'],
    usage: {
      pickWhen: 'you want the same look as gpt-image-2.5 but faster, or you are making several images at once',
      promptTips: ['Same prompts as gpt-image-2.5; it is the speed tier of the same family.'],
      latency: 'about 15 to 30 seconds',
    },
    docs: 'docs/models/gpt-image-2.5-flare.md',
  },
  'gpt-image-2': {
    id: 'gpt-image-2',
    provider: 'openai',
    providerModel: 'gpt-image-2',
    kind: 'image',
    tier: 'standard',
    status: 'live',
    modes: ['text-to-image', 'image-edit'],
    features: ['portrait', 'character-sheet', 'wireframe', 'prompt-adherence'],
    limits: { resolutions: ['1024x1024', '1024x1536', '1536x1024'], refsMax: 4 },
    image: { quality: 'medium' },
    // Standalone price for generate_image. Inside the fixed video skills the
    // portrait/sheet stages are still included in the video credits.
    credits: { unit: 'image', perUnit: 20 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['the previous generation, kept selectable for runs that were built on it'],
    avoidFor: ['new work: gpt-image-2.5 is the default and holds identity better'],
    usage: {
      pickWhen: 'you are reproducing something that was made on gpt-image-2; otherwise take the default',
      promptTips: [
        'Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "headroom for a caption".',
        'With refs it EDITS or composes from them (a product into a hand, a portrait re-lit); without refs it paints from the prompt alone.',
      ],
      latency: 'under a minute',
    },
    docs: 'docs/models/gpt-image-2.md',
    verified: { date: '2026-09-05', note: 'every video pipeline stage A-C; portrait + sheet produced on run 2749ee84; standalone via generate_image' },
  },
  'elevenlabs-tts': {
    id: 'elevenlabs-tts',
    provider: 'elevenlabs',
    providerModel: 'eleven_multilingual_v2',
    kind: 'audio',
    tier: 'standard',
    status: 'live',
    modes: ['text-to-speech'],
    features: ['voice-clone', 'multilingual', 'dubbing'],
    limits: {},
    // Standalone price for generate_audio: 1 credit per 100 characters,
    // total rounded up (min 1). Inside the fixed skills it stays included.
    credits: { unit: 'character', perUnit: 0.01 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['voiceover on b-roll', 'narration', 'a standalone voice file', 'an audio reference for generate_video'],
    avoidFor: ['lip-synced talking head: generate_video renders speech natively'],
    usage: {
      pickWhen: 'you need a clean voice track and no face',
      promptTips: ['Emotion tags like [excited] or [whispers] are honoured; keep sentences short for pacing.', 'Seven named voices (sarah default) or a raw ElevenLabs voice id.'],
      latency: 'seconds',
    },
    docs: 'docs/models/elevenlabs-tts.md',
    verified: { date: '2026-09-05', note: 'wired in media-worker-v2 (tts.js, dubbing.js); standalone via generate_audio' },
  },

  // ── candidates: in the plan, not selectable. Limits from the specs. ────
  'seedance-2.0-mini': {
    id: 'seedance-2.0-mini',
    provider: 'evolink',
    providerModel: 'seedance-2.0-mini-text-to-video',
    kind: 'video',
    limits: {},
    tier: 'draft',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['native-audio', 'first-frame', 'image-references', 'video-references', 'audio-references'],
    video: {
      timeoutMinutes: 30,
      modes: {
        text: { providerModel: 'seedance-2.0-mini-text-to-video', seconds: [4, 15], aspects: ALL_ASPECTS, aspectDefault: '9:16', qualities: ['480p', '720p'], seed: false, notes: [] },
        image: { providerModel: 'seedance-2.0-mini-image-to-video', seconds: [4, 15], aspects: ALL_ASPECTS, aspectDefault: 'adaptive', qualities: ['480p', '720p'], lastFrame: true, seed: false, notes: [] },
        reference: { providerModel: 'seedance-2.0-mini-reference-to-video', seconds: [4, 15], aspects: ALL_ASPECTS, aspectDefault: '9:16', qualities: ['480p', '720p'], refs: SEEDANCE_20_REFS, promptSyntax: SEEDANCE_TAGS, seed: false, notes: [] },
      },
    },
    quality: 'draft',
    speed: 'fast',
    bestFor: ['drafts', 'previews', 'bulk variants before picking one to render on 2.0'],
    avoidFor: ['final deliverables', '1080p (not offered)'],
    docs: 'docs/models/seedance-2.0-mini.md',
  },
  'kling-o3': {
    id: 'kling-o3',
    provider: 'evolink',
    providerModel: 'kling-o3-text-to-video',
    kind: 'video',
    limits: {},
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['first-frame', 'first-and-last-frame', 'image-references', 'video-reference', 'sound-effects'],
    video: {
      timeoutMinutes: 30,
      modes: {
        text: { providerModel: 'kling-o3-text-to-video', seconds: [3, 15], aspects: ['16:9', '9:16', '1:1'], aspectDefault: '9:16', qualities: ['720p', '1080p'], seed: false, notes: ['Prompt up to 2500 characters. Sound is effects, not verified lip-sync.'] },
        image: { providerModel: 'kling-o3-image-to-video', seconds: [3, 15], aspects: ['16:9', '9:16', '1:1'], aspectDefault: '9:16', qualities: ['720p', '1080p'], lastFrame: true, seed: false, notes: ['last_frame needs first_frame and is refused when style refs are also given.'] },
        reference: { providerModel: 'kling-o3-reference-to-video', seconds: [3, 10], aspects: ['16:9', '9:16', '1:1'], aspectDefault: '9:16', qualities: ['720p', '1080p'], refs: { images: 4, videos: 1, audios: 0, audioAlone: false }, promptSyntax: '<<<image_1>>> <<<video_1>>>', seed: false, notes: ['Exactly one reference video (3 s or longer); sound is forced off with a video reference.'] },
      },
    },
    quality: 'premium',
    speed: 'medium',
    bestFor: ['1080p hero shots with a non-Seedance look', 'first-to-last-frame moves'],
    avoidFor: ['bulk', 'speech-driven UGC until verified'],
    docs: 'docs/models/kling-o3.md',
  },
  'wan-3.0': {
    id: 'wan-3.0',
    provider: 'evolink',
    providerModel: 'wan3.0-text-to-video',
    kind: 'video',
    limits: {},
    tier: 'standard',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['first-frame', 'first-and-last-frame', 'image-references', 'video-references', 'audio-references', 'seed', 'long-clip'],
    video: {
      timeoutMinutes: 30,
      modes: {
        text: { providerModel: 'wan3.0-text-to-video', seconds: [2, 30], aspects: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4'], aspectDefault: '9:16', qualities: ALL_QUALITIES, seed: true, notes: [] },
        image: { providerModel: 'wan3.0-image-to-video', seconds: [2, 30], aspects: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4'], aspectDefault: 'adaptive', qualities: ALL_QUALITIES, lastFrame: true, seed: true, notes: ['Frames only; references are refused next to a first frame.'] },
        reference: { providerModel: 'wan3.0-reference-video', seconds: [2, 30], aspects: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4'], aspectDefault: '9:16', qualities: ALL_QUALITIES, refs: { images: 10, videos: 5, audios: 5, videoSecondsTotal: 15, audioSecondsTotal: 15, audioAlone: true }, promptSyntax: '"Image 1", "Video 1", "Audio 1" (capitalised, space before the number)', seed: true, notes: ['Each reference image should contain a single character.', 'Reference video seconds plus output seconds may not exceed 30.'] },
      },
    },
    quality: 'good',
    speed: 'medium',
    bestFor: ['single takes of 15 to 30 s', 'reproducible series via seed'],
    avoidFor: ['lip-synced speech until verified', '21:9'],
    docs: 'docs/models/wan-3.0.md',
  },
  'omnihuman-1.5': {
    id: 'omnihuman-1.5',
    provider: 'evolink',
    providerModel: 'omnihuman-1.5',
    kind: 'video',
    limits: {},
    tier: 'premium',
    status: 'candidate',
    modes: ['lipsync'],
    features: ['audio-driven-lip-sync', 'digital-human'],
    video: {
      timeoutMinutes: 30,
      modes: {
        reference: { providerModel: 'omnihuman-1.5', seconds: [1, 35], aspects: ['adaptive'], aspectDefault: 'adaptive', qualities: ['720p'], refs: { images: 1, videos: 0, audios: 1, audioSecondsTotal: 35, audioAlone: false }, seed: true, notes: ['One photo of a person plus one audio file (mp3/wav, up to 35 s). The clip is as long as the audio; seconds is not a parameter.'] },
      },
    },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['lip-syncing one photo to an existing recording'],
    avoidFor: ['silent clips', 'audio over 35 s', 'more than one person'],
    docs: 'docs/models/omnihuman-1.5.md',
  },
  'sora-2': {
    id: 'sora-2',
    provider: 'evolink',
    providerModel: 'sora-2-preview',
    kind: 'video',
    limits: {},
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video'],
    features: ['native-audio'],
    video: {
      timeoutMinutes: 30,
      modes: {
        text: { providerModel: 'sora-2-preview', seconds: [4, 12], aspects: ['16:9', '9:16'], aspectDefault: '9:16', qualities: ['720p'], seed: false, notes: ['Only 4, 8 or 12 s. Strict content moderation; real people are not accepted.'] },
        image: { providerModel: 'sora-2-preview', seconds: [4, 12], aspects: ['16:9', '9:16'], aspectDefault: '9:16', qualities: ['720p'], lastFrame: false, seed: false, notes: ['One image; its pixel size must match the aspect exactly (1280x720 or 720x1280). No real people.'] },
      },
    },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['cinematic b-roll without a locked face'],
    avoidFor: ['anything that must keep a saved character identity', 'real people'],
    docs: 'docs/models/sora-2.md',
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    provider: 'evolink',
    providerModel: 'gemini-3.1-flash-image-preview',
    kind: 'image',
    tier: 'standard',
    status: 'candidate',
    modes: ['text-to-image', 'image-edit'],
    features: ['editing', 'reference', 'prompt-adherence'],
    limits: { resolutions: ['1K', '2K'], refsMax: 14 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['product placement into a character frame', 'character sheet edits', 'composites with many references'],
    avoidFor: ['more than 4 real-person images per request'],
    docs: 'docs/models/nano-banana-2.md',
  },
  'seedream-5.0-pro': {
    id: 'seedream-5.0-pro',
    provider: 'evolink',
    providerModel: 'doubao-seedream-5.0-pro',
    kind: 'image',
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-image', 'image-edit'],
    features: ['multi-reference', 'editing', 'transparent-background'],
    limits: { resolutions: ['1K', '1.5K', '2K'], refsMax: 10 },
    quality: 'premium',
    speed: 'medium',
    bestFor: ['multi-reference composites: person + product + setting'],
    avoidFor: ['wireframes'],
    docs: 'docs/models/seedream-5.0-pro.md',
  },
  'z-image-turbo': {
    id: 'z-image-turbo',
    provider: 'evolink',
    providerModel: 'z-image-turbo',
    kind: 'image',
    tier: 'draft',
    status: 'candidate',
    modes: ['text-to-image'],
    features: ['ultra-fast', 'seed'],
    limits: { refsMax: 0 },
    quality: 'draft',
    speed: 'fast',
    bestFor: ['framing wireframes', 'throwaway previews'],
    avoidFor: ['anything a user sees', 'edits (no references)'],
    docs: 'docs/models/z-image-turbo.md',
  },
  'doubao-seed-audio-1.0': {
    id: 'doubao-seed-audio-1.0',
    provider: 'evolink',
    providerModel: 'doubao-seed-audio-1-0',
    kind: 'audio',
    tier: 'draft',
    status: 'candidate',
    modes: ['text-to-speech'],
    features: ['voice-clone-from-url', 'speech-rate', 'pitch'],
    limits: { refsMax: 3 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['cloning a voice from a short reference clip', 'up to 120 s of speech per request'],
    avoidFor: ['plain narration (elevenlabs-tts is live and cheaper for the user)'],
    docs: 'docs/models/doubao-seed-audio-1.0.md',
  },
  suno: {
    id: 'suno',
    provider: 'evolink',
    providerModel: 'suno-v5-beta',
    kind: 'audio',
    tier: 'standard',
    status: 'candidate',
    modes: ['music'],
    features: ['vocals', 'lyrics'],
    limits: {},
    quality: 'good',
    speed: 'medium',
    bestFor: ['a music bed under a clip'],
    avoidFor: [],
    docs: 'docs/models/suno.md',
  },
};

export const V2_MODEL_IDS = Object.keys(V2_MODELS);

/** Live models only, the ones list_models returns by default. */
export function liveModels(): V2ModelRecord[] {
  return Object.values(V2_MODELS).filter((m) => m.status === 'live');
}

/** Resolve a model id, or an old `engine` value, to its record. */
export function resolveModel(idOrEngine: string | undefined): V2ModelRecord | undefined {
  if (!idOrEngine) return undefined;
  return V2_MODELS[idOrEngine];
}

/** The spec of one (model, video mode) cell, or undefined when the model lacks the mode. */
export function videoModeSpec(modelId: string, mode: V2VideoMode): V2VideoModeSpec | undefined {
  return V2_MODELS[modelId]?.video?.modes[mode];
}

/** Validate the whole catalog. Throws on the first bad record. Used by tests. */
export function validateCatalog(): void {
  for (const [key, rec] of Object.entries(V2_MODELS)) {
    if (key !== rec.id) throw new Error(`catalog key ${key} != record id ${rec.id}`);
    V2ModelRecordSchema.parse(rec);
  }
}
