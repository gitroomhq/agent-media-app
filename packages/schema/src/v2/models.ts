// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · The model catalog.
 *
 * One record per generation model agent-media can route to, in one file,
 * the way V2_GENERATORS is one record per product. Everything that talks
 * about models reads from here: GET /v1/models, the list_models MCP tool,
 * the per-model docs in docs/models/, the public skill pack, and the
 * pricing parity test.
 *
 * Why a catalog and not just an `engine` enum: the product direction is
 * "let the agent choose the model for the job". An agent chooses well only
 * when the choice is machine-readable — cost, limits, what it is good at
 * and what it is bad at — otherwise it picks the premium model for
 * everything and the margin is gone. So every field below exists to be
 * read by a model, not a human.
 *
 * Status rules, and they are strict:
 *   live       selectable in the API today. Has credits. Must have a docs
 *              file. `verified` records the run that proved it.
 *   candidate  in the catalog so the plan is visible, NOT selectable and
 *              NOT returned by list_models by default. No user credits
 *              until a real run is recorded and the cost is confirmed
 *              against the provider's detailed table (never the "from"
 *              price on the marketing page).
 *   retired    kept for old run rows to resolve; never selectable.
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

export const V2_MODEL_MODES = [
  'text-to-video',
  'image-to-video',
  'reference-to-video',
  'text-to-image',
  'image-edit',
  'text-to-speech',
  'music',
  'upscale',
] as const;
export type V2ModelMode = (typeof V2_MODEL_MODES)[number];

/** What WE pay the provider. Always from the detailed pricing table. */
export const V2ModelCostSchema = z.object({
  unit: z.enum(['second', 'image', 'video', 'character', 'track']),
  usd: z.number().nonnegative(),
  /** Where the number came from and any condition (resolution, ref type). */
  note: z.string().min(1),
});

/**
 * What the USER pays. Present only on live models. perUnit may be
 * fractional (per-character audio is 0.01); quoteGenerate() rounds the
 * TOTAL up to whole credits, never the rate.
 */
export const V2ModelCreditsSchema = z.object({
  unit: z.enum(['second', 'image', 'clip', 'character']),
  perUnit: z.number().nonnegative(),
  /** Fixed prelude per job (portrait, sheet, storage). */
  base: z.number().int().nonnegative().optional(),
});

export const V2ModelRecordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
    provider: z.enum(V2_MODEL_PROVIDERS),
    /** The identifier sent to the provider. */
    providerModel: z.string().min(1),
    kind: z.enum(V2_MODEL_KINDS),
    tier: z.enum(V2_MODEL_TIERS),
    status: z.enum(V2_MODEL_STATUSES),
    modes: z.array(z.enum(V2_MODEL_MODES)).min(1),
    features: z.array(z.string()).default([]),
    limits: z
      .object({
        minSeconds: z.number().positive().optional(),
        maxSeconds: z.number().positive().optional(),
        aspect: z.array(z.string()).optional(),
        resolutions: z.array(z.string()).optional(),
        /** Which reference inputs the model accepts. */
        refs: z.enum(['none', 'image', 'video', 'both']).optional(),
      })
      .default({}),
    cost: V2ModelCostSchema,
    credits: V2ModelCreditsSchema.optional(),
    quality: z.enum(['draft', 'good', 'premium']),
    speed: z.enum(['fast', 'medium', 'slow']),
    bestFor: z.array(z.string()).min(1),
    avoidFor: z.array(z.string()).default([]),
    /** Repo-relative path of the usage notes. Shipped in the skill pack. */
    docs: z.string().regex(/^docs\/models\/[a-z0-9.-]+\.md$/),
    /** The run that proved it. Required for live models. */
    verified: z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        runId: z.string().optional(),
        note: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((m, ctx) => {
    if (m.status === 'live' && !m.credits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${m.id}: live models must carry user credits` });
    }
    if (m.status !== 'live' && m.credits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${m.id}: only live models may carry user credits` });
    }
  });

export type V2ModelRecord = z.infer<typeof V2ModelRecordSchema>;

// ── The catalog ───────────────────────────────────────────────────────────
//
// Credit maths for live models: agent-media credit = $0.01, 70% margin
// floor. Seedance per-second credits match V2_GENERATORS.selfie /
// crazy_look engine tiers exactly; a test enforces that parity so a price
// can never drift between "the catalog says" and "the debit does".

export const V2_MODELS: Record<string, V2ModelRecord> = {
  // ── live ───────────────────────────────────────────────────────────────
  'seedance-2.0': {
    id: 'seedance-2.0',
    provider: 'evolink',
    providerModel: 'seedance-2.0-reference-to-video',
    kind: 'video',
    tier: 'standard',
    status: 'live',
    modes: ['reference-to-video', 'text-to-video'],
    features: ['native-audio', 'lip-sync', 'character-sheet-reference'],
    limits: { minSeconds: 4, maxSeconds: 15, aspect: ['9:16', '1:1'], resolutions: ['480p', '720p', '1080p'], refs: 'image' },
    cost: { unit: 'second', usd: 0.1, note: 'EvoLink detailed table, 720p with image references. Marketing page shows $0.033/s "from" (480p).' },
    credits: { unit: 'second', perUnit: 30 },
    quality: 'good',
    speed: 'medium',
    bestFor: ['talking-head UGC', 'product in hands', 'crazy look', 'bulk daily posts'],
    avoidFor: ['clips over 15s', 'hero shots where 2.5 detail is worth 3x the price'],
    docs: 'docs/models/seedance-2.0.md',
    verified: { date: '2026-09-05', runId: '2749ee84-1835-4e69-947d-67034ead0890', note: 'make_ugc via Claude Code over the hosted connector, 5s, succeeded' },
  },
  'seedance-2.5': {
    id: 'seedance-2.5',
    provider: 'evolink',
    providerModel: 'seedance-2.5-reference-to-video',
    kind: 'video',
    tier: 'premium',
    status: 'live',
    modes: ['reference-to-video', 'text-to-video'],
    features: ['native-audio', 'lip-sync', 'character-sheet-reference'],
    limits: { minSeconds: 4, maxSeconds: 15, aspect: ['9:16', '1:1'], resolutions: ['480p', '720p', '1080p'], refs: 'image' },
    cost: { unit: 'second', usd: 0.296, note: 'EvoLink detailed table, 720p with IMAGE references bills at the text-to-video rate; the reference discount applies only to VIDEO references. Marketing page shows $0.084/s "from".' },
    credits: { unit: 'second', perUnit: 99 },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['hero product ads', 'close-up faces', 'one clip that has to be the best'],
    avoidFor: ['drafts', 'bulk', 'anything where 2.0 is good enough: it is ~3x the credits'],
    docs: 'docs/models/seedance-2.5.md',
    verified: undefined,
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
    limits: { resolutions: ['1024', '1536'], refs: 'image' },
    cost: { unit: 'image', usd: 0.06, note: 'OpenAI direct, quality "medium", 1024x1536 — the published gpt-image-1 rate ($0.063); gpt-image-2 assumed equal until an invoice line is checked. EvoLink lists $0.015 for its 1K tier.' },
    // Standalone price for generate_image. Inside the fixed video skills the
    // portrait/sheet stages are still included in the video credits.
    credits: { unit: 'image', perUnit: 20 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['portraits', 'character sheets', 'framing wireframes', 'product placement frames'],
    avoidFor: ['photoreal 4K hero stills'],
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
    cost: { unit: 'character', usd: 0.00003, note: 'ElevenLabs Creator tier, ~$0.30 per 10k characters. Used by tts.js / dubbing.js in media-worker-v2.' },
    // Standalone price for generate_audio: 1 credit per 100 characters,
    // total rounded up (min 1). Inside the fixed skills it stays included.
    credits: { unit: 'character', perUnit: 0.01 },
    quality: 'good',
    speed: 'fast',
    bestFor: ['voiceover on b-roll', 'dubbing', 'when Seedance native audio is not used'],
    avoidFor: ['lip-synced talking head: Seedance native audio is the default there'],
    docs: 'docs/models/elevenlabs-tts.md',
    verified: { date: '2026-09-05', note: 'wired in media-worker-v2 (tts.js, dubbing.js); standalone via generate_audio' },
  },

  // ── candidates: in the plan, not selectable ────────────────────────────
  'seedance-2.0-mini': {
    id: 'seedance-2.0-mini',
    provider: 'evolink',
    providerModel: 'seedance-2.0-mini',
    kind: 'video',
    tier: 'draft',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video'],
    features: ['native-audio'],
    limits: { minSeconds: 4, maxSeconds: 15, resolutions: ['480p', '720p'] },
    cost: { unit: 'second', usd: 0.011, note: 'FROM price on evolink.ai/models; confirm 720p + image-ref rate on the detailed table before going live.' },
    quality: 'draft',
    speed: 'fast',
    bestFor: ['drafts', 'previews', 'bulk variants before picking one to render on 2.0'],
    avoidFor: ['final deliverables'],
    docs: 'docs/models/seedance-2.0-mini.md',
  },
  'kling-o3': {
    id: 'kling-o3',
    provider: 'evolink',
    providerModel: 'kling-o3',
    kind: 'video',
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['editing', 'reference'],
    limits: { minSeconds: 3, maxSeconds: 15 },
    cost: { unit: 'second', usd: 0.08, note: 'FROM price on evolink.ai/models; confirm before going live.' },
    quality: 'premium',
    speed: 'medium',
    bestFor: ['second premium option next to seedance-2.5', 'edit an existing clip'],
    avoidFor: ['bulk'],
    docs: 'docs/models/kling-o3.md',
  },
  'wan-3.0': {
    id: 'wan-3.0',
    provider: 'evolink',
    providerModel: 'wan-3.0',
    kind: 'video',
    tier: 'standard',
    status: 'candidate',
    modes: ['text-to-video', 'image-to-video', 'reference-to-video'],
    features: ['reference', 'long-clip'],
    limits: { minSeconds: 2, maxSeconds: 30, resolutions: ['480p', '720p', '1080p'] },
    cost: { unit: 'second', usd: 0.038, note: 'FROM price on evolink.ai/models; confirm before going live.' },
    quality: 'good',
    speed: 'medium',
    bestFor: ['clips longer than 15s in one take'],
    avoidFor: ['lip-synced speech until verified'],
    docs: 'docs/models/wan-3.0.md',
  },
  'omnihuman-1.5': {
    id: 'omnihuman-1.5',
    provider: 'evolink',
    providerModel: 'omnihuman-1.5',
    kind: 'video',
    tier: 'premium',
    status: 'candidate',
    modes: ['image-to-video'],
    features: ['audio-driven-lip-sync', 'digital-human'],
    limits: {},
    cost: { unit: 'second', usd: 0.177, note: 'FROM price on evolink.ai/models; confirm before going live.' },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['talking head driven by an existing voice track'],
    avoidFor: ['silent clips', 'anything Seedance native audio already covers'],
    docs: 'docs/models/omnihuman-1.5.md',
  },
  'sora-2': {
    id: 'sora-2',
    provider: 'evolink',
    providerModel: 'sora-2',
    kind: 'video',
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-video'],
    features: ['native-audio'],
    limits: { minSeconds: 10, maxSeconds: 15 },
    cost: { unit: 'second', usd: 0.085, note: 'FROM price on evolink.ai/models; no reference input listed, so character consistency is unproven.' },
    quality: 'premium',
    speed: 'slow',
    bestFor: ['cinematic b-roll without a locked face'],
    avoidFor: ['anything that must keep a saved character identity'],
    docs: 'docs/models/sora-2.md',
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    provider: 'evolink',
    providerModel: 'nano-banana-2',
    kind: 'image',
    tier: 'standard',
    status: 'candidate',
    modes: ['text-to-image', 'image-edit'],
    features: ['editing', 'reference', 'prompt-adherence'],
    limits: { resolutions: ['1K'], refs: 'image' },
    cost: { unit: 'image', usd: 0.036, note: 'FROM price on evolink.ai/models.' },
    quality: 'good',
    speed: 'fast',
    bestFor: ['product placement into a character frame', 'character sheet edits'],
    avoidFor: [],
    docs: 'docs/models/nano-banana-2.md',
  },
  'seedream-5.0-pro': {
    id: 'seedream-5.0-pro',
    provider: 'evolink',
    providerModel: 'seedream-5.0-pro',
    kind: 'image',
    tier: 'premium',
    status: 'candidate',
    modes: ['text-to-image', 'image-edit'],
    features: ['multi-reference', 'editing'],
    limits: { resolutions: ['1K', '1.5K', '2K'], refs: 'image' },
    cost: { unit: 'image', usd: 0.034, note: 'FROM price on evolink.ai/models.' },
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
    features: ['ultra-fast'],
    limits: {},
    cost: { unit: 'image', usd: 0.0039, note: 'FROM price on evolink.ai/models.' },
    quality: 'draft',
    speed: 'fast',
    bestFor: ['framing wireframes', 'throwaway previews'],
    avoidFor: ['anything a user sees'],
    docs: 'docs/models/z-image-turbo.md',
  },
  'doubao-seed-audio-1.0': {
    id: 'doubao-seed-audio-1.0',
    provider: 'evolink',
    providerModel: 'doubao-seed-audio-1.0',
    kind: 'audio',
    tier: 'draft',
    status: 'candidate',
    modes: ['text-to-speech'],
    features: ['dialogue', 'effects', 'ambience'],
    limits: {},
    cost: { unit: 'second', usd: 0.003, note: 'FROM price on evolink.ai/models.' },
    quality: 'good',
    speed: 'fast',
    bestFor: ['cheap voiceover and ambience beds'],
    avoidFor: ['voice clones'],
    docs: 'docs/models/doubao-seed-audio-1.0.md',
  },
  suno: {
    id: 'suno',
    provider: 'evolink',
    providerModel: 'suno',
    kind: 'audio',
    tier: 'standard',
    status: 'candidate',
    modes: ['music'],
    features: ['vocals', 'lyrics'],
    limits: {},
    cost: { unit: 'track', usd: 0.059, note: 'FROM price on evolink.ai/models: $0.118 per 2 tracks.' },
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

/** Validate the whole catalog. Throws on the first bad record. Used by tests. */
export function validateCatalog(): void {
  for (const [key, rec] of Object.entries(V2_MODELS)) {
    if (key !== rec.id) throw new Error(`catalog key ${key} != record id ${rec.id}`);
    V2ModelRecordSchema.parse(rec);
  }
}
