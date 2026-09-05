// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · The loose surface: generate_image / generate_video / generate_audio.
 *
 * The fixed skills (selfie, crazy look, make_ugc) each bake one recipe
 * into one tool. That is the right shape for a dashboard button and the
 * wrong shape for an agent: the agent already knows what it wants, and a
 * fixed recipe either matches or gets in the way. So the agent-facing
 * surface is three primitives that say what they are and nothing more —
 * a prompt, an optional model, optional references — plus the model
 * catalog (list_models) telling it what each model is good for and what
 * it costs, and `quote` so it can say the price before it spends.
 *
 * Design rules, and they are the whole design:
 *   - The agent picks the model. We recommend (catalog.bestFor), we never
 *     force. Omitted model ⇒ the catalog default for that kind.
 *   - Only `status: 'live'` models are accepted. A candidate id is a 400
 *     that names the live options, never a silent fallback.
 *   - Refs are https URLs (upload_image first). Never inline bytes.
 *   - Credits are computed HERE from V2_MODELS so the REST quote, the MCP
 *     quote and the debit are one function.
 *
 * The three fixed generators stay on REST for the dashboard; this file
 * does not touch them.
 */

import { z } from 'zod';
import { V2_MODELS, liveModels, type V2ModelKind, type V2ModelRecord } from './models.js';

// ── Shared pieces ─────────────────────────────────────────────────────────

const HttpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL (call upload_image first for raw bytes)');

/** Live model ids of one kind — what the schemas accept. */
export function liveModelIds(kind: V2ModelKind): string[] {
  return liveModels()
    .filter((m) => m.kind === kind)
    .map((m) => m.id);
}

/** The model used when the agent does not name one. */
export const V2_DEFAULT_MODEL: Record<V2ModelKind, string> = {
  image: 'gpt-image-2',
  video: 'seedance-2.0',
  audio: 'elevenlabs-tts',
};

function liveModelField(kind: V2ModelKind) {
  return z
    .string()
    .optional()
    .superRefine((id, ctx) => {
      if (id === undefined) return;
      const m = V2_MODELS[id];
      if (!m || m.kind !== kind || m.status !== 'live') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown or not-live ${kind} model "${id}". Live ${kind} models: ${liveModelIds(kind).join(', ')}. Call list_models for the full catalog.`,
        });
      }
    });
}

// ── generate_image ────────────────────────────────────────────────────────

export const V2_IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const;
export type V2ImageSize = (typeof V2_IMAGE_SIZES)[number];

export const GenerateImageSchema = z
  .object({
    prompt: z.string().min(3).max(4000).describe('What to paint. Be concrete: subject, age, framing, light, lens, mood, what the hands do.'),
    model: liveModelField('image').describe('A live image model id from list_models. Omit for the default (gpt-image-2).'),
    refs: z.array(HttpsUrl).max(4).optional().describe('Reference images (https URLs, up to 4). With refs the model EDITS/composes from them (a product into a hand, a portrait re-lit); without, it paints from the prompt alone.'),
    size: z.enum(V2_IMAGE_SIZES).default('1024x1536').describe('1024x1536 portrait (default, for 9:16 video), 1024x1024 square, 1536x1024 landscape.'),
  })
  .strict();
export type GenerateImageInput = z.infer<typeof GenerateImageSchema>;

// ── generate_video ────────────────────────────────────────────────────────

// 16:9 is deliberately absent until a live run on a live model proves it.
export const V2_VIDEO_ASPECTS = ['9:16', '1:1'] as const;
export type V2VideoAspect = (typeof V2_VIDEO_ASPECTS)[number];

export const GenerateVideoSchema = z
  .object({
    prompt: z.string().min(3).max(4000).describe('The shot, as a director would say it: who (age, look), where (setting, light), what happens, camera (phone framing), and — if anyone speaks — the exact words in quotes. ~2.3 words per second.'),
    model: liveModelField('video').describe('A live video model id from list_models. Omit for the default (seedance-2.0). seedance-2.5 is ~3x the credits — hero clips only.'),
    refs: z.array(HttpsUrl).max(4).optional().describe('Reference images (https URLs, up to 4): a portrait, a character sheet, a product shot. The model keeps that identity/look across clips. Omit to let the model invent the person.'),
    seconds: z.number().int().min(4).max(15).default(5).describe('Clip length in seconds, 4–15. Credits = seconds x the model rate.'),
    aspect: z.enum(V2_VIDEO_ASPECTS).default('9:16').describe('9:16 vertical (default) or 1:1.'),
    audio: z.boolean().default(true).describe('Render native audio (speech from the quoted words, ambience). false = silent clip.'),
    seed: z.number().int().min(0).max(2 ** 31 - 1).optional().describe('Same seed + same inputs = the same clip (best effort). Reuse across a series.'),
  })
  .strict()
  .superRefine((v, ctx) => {
    const m = V2_MODELS[v.model ?? V2_DEFAULT_MODEL.video];
    if (!m) return;
    const { minSeconds, maxSeconds, aspect } = m.limits;
    if (minSeconds !== undefined && v.seconds < minSeconds) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seconds'], message: `${m.id} renders at least ${minSeconds}s` });
    }
    if (maxSeconds !== undefined && v.seconds > maxSeconds) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seconds'], message: `${m.id} renders at most ${maxSeconds}s` });
    }
    if (aspect && !aspect.includes(v.aspect)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aspect'], message: `${m.id} supports aspect ${aspect.join(', ')}` });
    }
  });
export type GenerateVideoInput = z.infer<typeof GenerateVideoSchema>;

// ── generate_audio ────────────────────────────────────────────────────────

/**
 * Named voices. The ids are ElevenLabs pre-made voices, the same set
 * media-worker-v2/src/tts.js treats as pre-made (v3 model). An agent
 * passes the friendly name; the worker maps it.
 */
export const V2_VOICES = {
  jessica: { id: 'cgSgspJ2msm6clMCkdW9', note: 'young female' },
  sarah: { id: 'EXAVITQu4vr4xnSDxMaL', note: 'female' },
  liam: { id: 'TX3LPaxmHKxFdv7VOQHJ', note: 'young male' },
  chris: { id: 'iP95p4xoKVk53GoZ742B', note: 'male' },
  lily: { id: 'pFZP5JQG7iQjIQuC4Bku', note: 'elder female' },
  bill: { id: 'pqHfZKP75CvOlQylNhV4', note: 'elder male' },
  matilda: { id: 'XrExE9yKIg1WjnnlVkGX', note: 'warm, mom' },
} as const;
export type V2VoiceName = keyof typeof V2_VOICES;
export const V2_VOICE_NAMES = Object.keys(V2_VOICES) as V2VoiceName[];
export const V2_DEFAULT_VOICE: V2VoiceName = 'sarah';

export const V2_AUDIO_TONES = ['energetic', 'calm', 'confident', 'dramatic'] as const;

export const GenerateAudioSchema = z
  .object({
    text: z.string().min(1).max(4000).describe('The words to speak. Emotion tags like [excited] or [whispers] are honoured. 1 credit per 100 characters.'),
    model: liveModelField('audio').describe('A live audio model id from list_models. Omit for the default (elevenlabs-tts).'),
    voice: z.string().min(1).default(V2_DEFAULT_VOICE).describe('A voice name: jessica (young female), sarah (female), liam (young male), chris (male), lily (elder female), bill (elder male), matilda (warm) — or a raw ElevenLabs voice id.'),
    tone: z.enum(V2_AUDIO_TONES).optional().describe('energetic | calm | confident | dramatic.'),
  })
  .strict();
export type GenerateAudioInput = z.infer<typeof GenerateAudioSchema>;

// ── Quote: one function for REST, MCP and the debit ───────────────────────

export type GenerateKind = V2ModelKind;

export interface GenerateQuote {
  kind: GenerateKind;
  model: string;
  credits: number;
  /** Human line, e.g. "5s on seedance-2.0 at 30 credits/s". */
  breakdown: string;
}

/**
 * Credits for a validated input. Integer, never below 1 for a real job,
 * computed from V2_MODELS so the catalog IS the price list.
 */
export function quoteGenerate(kind: 'image', input: GenerateImageInput): GenerateQuote;
export function quoteGenerate(kind: 'video', input: GenerateVideoInput): GenerateQuote;
export function quoteGenerate(kind: 'audio', input: GenerateAudioInput): GenerateQuote;
export function quoteGenerate(kind: GenerateKind, input: GenerateImageInput | GenerateVideoInput | GenerateAudioInput): GenerateQuote {
  const modelId = (input as { model?: string }).model ?? V2_DEFAULT_MODEL[kind];
  const m: V2ModelRecord | undefined = V2_MODELS[modelId];
  if (!m || m.status !== 'live' || !m.credits) {
    throw new Error(`cannot quote: "${modelId}" is not a live ${kind} model`);
  }
  const { perUnit, base = 0, unit } = m.credits;
  if (kind === 'video') {
    const seconds = (input as GenerateVideoInput).seconds;
    const credits = Math.ceil(base + perUnit * seconds);
    return { kind, model: m.id, credits, breakdown: `${seconds}s on ${m.id} at ${perUnit} credits/${unit}${base ? ` + ${base} base` : ''}` };
  }
  if (kind === 'image') {
    // One image per call. Agents wanting variants call again (each call is
    // its own job with its own URL; the job row stores exactly one output).
    const credits = Math.ceil(base + perUnit);
    return { kind, model: m.id, credits, breakdown: `1 image on ${m.id} at ${perUnit} credits/${unit}` };
  }
  const chars = (input as GenerateAudioInput).text.length;
  const credits = Math.max(1, Math.ceil(base + perUnit * chars));
  return { kind, model: m.id, credits, breakdown: `${chars} characters on ${m.id} at ${perUnit} credits/${unit}` };
}

/** Parse + quote in one step; the shape /v2/quote and the `quote` tool return. */
export function quoteAny(kind: GenerateKind, raw: unknown): { ok: true; quote: GenerateQuote } | { ok: false; issues: z.ZodIssue[] } {
  const schema = kind === 'image' ? GenerateImageSchema : kind === 'video' ? GenerateVideoSchema : GenerateAudioSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  return { ok: true, quote: quoteGenerate(kind as 'image', parsed.data as GenerateImageInput) };
}
