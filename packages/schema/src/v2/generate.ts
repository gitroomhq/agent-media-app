// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · The loose surface: generate_image / generate_video / generate_audio.
 *
 * The fixed skills (selfie, crazy look, make_ugc) each bake one recipe
 * into one tool. That is the right shape for a dashboard button and the
 * wrong shape for an agent: the agent already knows what it wants, and a
 * fixed recipe either matches or gets in the way. So the agent-facing
 * surface is three primitives that say what they are and nothing more,
 * a prompt, an optional model, optional references or frames, plus the
 * model catalog (list_models) telling it what each model is good for and
 * what it costs, and `quote` so it can say the price before it spends.
 *
 * Design rules, and they are the whole design:
 *   - The agent picks the model. We recommend (catalog.usage), we never
 *     force. Omitted model ⇒ the catalog default for that kind.
 *   - Only `status: 'live'` models are accepted. A candidate id is a 400
 *     that names the live options, never a silent fallback.
 *   - The video MODE is derived from the inputs (first_frame ⇒ image,
 *     refs/video_refs/audio_refs ⇒ reference, else text) and every limit
 *     is checked HERE against the catalog cell for that (model, mode), so
 *     an agent gets one clear error at submit instead of a provider
 *     failure minutes later.
 *   - Refs are https URLs (upload_image first). Never inline bytes.
 *   - Credits are computed HERE from V2_MODELS so the REST quote, the MCP
 *     quote and the debit are one function.
 *
 * The three fixed generators stay on REST for the dashboard; this file
 * does not touch them.
 */

import { z } from 'zod';
import {
  V2_DEFAULT_VIDEO_QUALITY,
  V2_MODELS,
  V2_VIDEO_ASPECTS,
  V2_VIDEO_QUALITIES,
  liveModels,
  type V2ModelKind,
  type V2ModelRecord,
  type V2VideoAspect,
  type V2VideoMode,
  type V2VideoModeSpec,
  type V2VideoQuality,
} from './models.js';

// ── Shared pieces ─────────────────────────────────────────────────────────

const HttpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https URL (call upload_image first for raw bytes)');

/** Live model ids of one kind, what the schemas accept. */
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

/**
 * `model: "auto"`, let agent-media pick from the live catalog using the
 * last 30 days of results (see pickAuto). Resolved server-side BEFORE the
 * quote, so the price the agent sees is the price of the model that runs.
 */
export const V2_MODEL_AUTO = 'auto';

function liveModelField(kind: V2ModelKind) {
  return z
    .string()
    .optional()
    .superRefine((id, ctx) => {
      if (id === undefined || id === V2_MODEL_AUTO) return;
      const m = V2_MODELS[id];
      if (!m || m.kind !== kind || m.status !== 'live') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown or not-live ${kind} model "${id}". Live ${kind} models: ${liveModelIds(kind).join(', ')} (or "auto"). Call list_models for the full catalog.`,
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
    model: liveModelField('image').describe('A live image model id from list_models, or "auto" to let agent-media pick from recent results. Omit for the default (gpt-image-2).'),
    refs: z.array(HttpsUrl).max(4).optional().describe('Reference images (https URLs, up to 4). With refs the model EDITS/composes from them (a product into a hand, a portrait re-lit); without, it paints from the prompt alone.'),
    size: z.enum(V2_IMAGE_SIZES).default('1024x1536').describe('1024x1536 portrait (default, for 9:16 video), 1024x1024 square, 1536x1024 landscape.'),
  })
  .strict();
export type GenerateImageInput = z.infer<typeof GenerateImageSchema>;

// ── generate_video ────────────────────────────────────────────────────────

export { V2_VIDEO_ASPECTS, V2_VIDEO_QUALITIES };
export type { V2VideoAspect, V2VideoQuality, V2VideoMode };

/** Words that make Seedance 2.5 reclassify a reference task as edit/extend and fail it late. */
export const EDIT_INTENT_RE = /\b(edit(?:ing)? (?:the|this) video|remove|delete|replace|swap out|extend(?:ed|ing)?(?: the video| forward| backward)?|continue (?:the|this) (?:video|clip))\b/i;

const VideoBase = z
  .object({
    prompt: z.string().min(3).max(4000).describe('The shot, as a director would say it: who (age, look), where (setting, light), what happens, camera (phone framing), and, if anyone speaks, the exact words in quotes. About 2.3 words per second. With references, address them as @image1, @video1, @audio1.'),
    model: liveModelField('video').describe('A live video model id from list_models, or "auto" to let agent-media pick from recent results. Omit for the default. Call list_models for what each model is good for, its modes, limits and price.'),
    first_frame: HttpsUrl.optional().describe('IMAGE-TO-VIDEO: an https image that becomes frame one of the clip (a still you want animated, a product shot, a portrait). Cannot be combined with refs, video_refs or audio_refs on Seedance.'),
    last_frame: HttpsUrl.optional().describe('Optional with first_frame: the image the clip ends on; the model animates from first to last.'),
    refs: z.array(HttpsUrl).max(30).optional().describe('REFERENCE-TO-VIDEO: image references (https URLs): a portrait, a character sheet from list_characters, a product photo. The model keeps that identity/look. Address them in the prompt as @image1, @image2...'),
    video_refs: z.array(HttpsUrl).max(10).optional().describe('Reference clips (https mp4/mov) whose motion, framing or look the model should follow; @video1... in the prompt. Their seconds are billed like output seconds.'),
    audio_refs: z.array(HttpsUrl).max(10).optional().describe('Reference audio (https wav/mp3): a voice or a sound the clip should carry; @audio1... in the prompt.'),
    seconds: z.number().int().min(1).max(60).default(5).describe('Clip length in seconds (the model sets the range; seedance: 4 to 15). Credits = seconds x the per-second rate at the chosen quality.'),
    aspect: z.enum(V2_VIDEO_ASPECTS).optional().describe('9:16 (default for text and reference), 16:9, 1:1, 4:3, 3:4, 21:9, or adaptive (follows the first frame or reference; the default and the only option in image mode on seedance-2.5).'),
    quality: z.enum(V2_VIDEO_QUALITIES).default(V2_DEFAULT_VIDEO_QUALITY).describe('480p (cheapest), 720p (default), 1080p (dearest). Price per second differs; see list_models.'),
    audio: z.boolean().default(true).describe('Render native audio (speech from the quoted words, ambience). false = silent clip.'),
    seed: z.number().int().min(0).max(2 ** 31 - 1).optional().describe('Only for models whose mode lists seed support (none of the live Seedance modes). Refused elsewhere.'),
  })
  .strict();

/** Which provider mode a video request resolves to. Pure. */
export function deriveVideoMode(v: { first_frame?: string; refs?: string[]; video_refs?: string[]; audio_refs?: string[] }): V2VideoMode {
  if (v.first_frame) return 'image';
  if (v.refs?.length || v.video_refs?.length || v.audio_refs?.length) return 'reference';
  return 'text';
}

export const GenerateVideoSchema = VideoBase.superRefine((v, ctx) => {
  const modelId = v.model ?? V2_DEFAULT_MODEL.video;
  if (modelId === V2_MODEL_AUTO) return; // resolved server-side, then re-validated
  const m = V2_MODELS[modelId];
  if (!m?.video) return;
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  const mode = deriveVideoMode(v);
  const spec = m.video.modes[mode];
  if (!spec) {
    issue(mode === 'image' ? 'first_frame' : mode === 'reference' ? 'refs' : 'model', `${m.id} has no ${mode} mode. Its modes: ${Object.keys(m.video.modes).join(', ')}. Call list_models.`);
    return;
  }

  if (v.last_frame && !v.first_frame) issue('last_frame', 'last_frame needs first_frame');
  if (mode === 'image') {
    if (v.last_frame && !spec.lastFrame) issue('last_frame', `${m.id} image mode takes a first frame only`);
    if (v.refs?.length || v.video_refs?.length || v.audio_refs?.length) {
      issue('first_frame', `${m.id} image mode takes frames only (first_frame, last_frame). To keep an identity, drop first_frame and pass the image in refs as @image1; to animate a still, drop the refs.`);
    }
  }
  if (mode === 'reference' && spec.refs) {
    const r = spec.refs;
    const n = (a?: string[]) => a?.length ?? 0;
    if (n(v.refs) > r.images) issue('refs', `${m.id} takes up to ${r.images} image references`);
    if (n(v.video_refs) > r.videos) issue('video_refs', r.videos ? `${m.id} takes up to ${r.videos} reference clips` : `${m.id} does not take reference clips`);
    if (n(v.audio_refs) > r.audios) issue('audio_refs', r.audios ? `${m.id} takes up to ${r.audios} reference audio files` : `${m.id} does not take reference audio`);
    if (!r.audioAlone && n(v.audio_refs) && !n(v.refs) && !n(v.video_refs)) issue('audio_refs', `${m.id} needs an image or video reference beside audio_refs`);
    if (n(v.video_refs) && EDIT_INTENT_RE.test(v.prompt)) {
      issue('prompt', `${m.id} reads "${v.prompt.match(EDIT_INTENT_RE)?.[0]}" as a video EDIT/EXTEND request and would fail the job after rendering. Describe the new clip you want instead (what @video1 should be used for), without edit or extend wording.`);
    }
  }

  const [minS, maxS] = spec.seconds;
  if (v.seconds < minS || v.seconds > maxS) issue('seconds', `${m.id} ${mode} mode renders ${minS} to ${maxS} seconds`);
  if (v.aspect && !spec.aspects.includes(v.aspect)) {
    issue('aspect', spec.aspects.length === 1 ? `${m.id} ${mode} mode only supports aspect "${spec.aspects[0]}" (leave aspect out)` : `${m.id} ${mode} mode supports aspect ${spec.aspects.join(', ')}`);
  }
  if (!spec.qualities.includes(v.quality)) issue('quality', `${m.id} ${mode} mode supports quality ${spec.qualities.join(', ')}`);
  if (v.seed !== undefined && !spec.seed) issue('seed', `${m.id} does not accept a seed (no live video model does); keep a series consistent with refs instead`);
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoSchema>;

/**
 * The fully resolved video request: what the worker sends to the provider.
 * Computed once (API side, after the schema passed) so the quote, the job
 * row and the provider call agree on mode, provider id, aspect and quality.
 */
export interface ResolvedVideoRequest {
  model: string;
  mode: V2VideoMode;
  providerModel: string;
  aspect: V2VideoAspect;
  quality: V2VideoQuality;
  spec: V2VideoModeSpec;
}

export function resolveVideoRequest(v: GenerateVideoInput & { model?: string }): ResolvedVideoRequest {
  const modelId = v.model ?? V2_DEFAULT_MODEL.video;
  const m = V2_MODELS[modelId];
  if (!m?.video) throw new Error(`cannot resolve: "${modelId}" is not a live video model`);
  const mode = deriveVideoMode(v);
  const spec = m.video.modes[mode];
  if (!spec) throw new Error(`${modelId} has no ${mode} mode`);
  return { model: m.id, mode, providerModel: spec.providerModel, aspect: v.aspect ?? spec.aspectDefault, quality: v.quality, spec };
}

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
    text: z.string().min(1).max(4000).describe('The words to speak. Emotion tags like [excited] or [whispers] are honoured. Priced per character; see list_models.'),
    model: liveModelField('audio').describe('A live audio model id from list_models, or "auto". Omit for the default (elevenlabs-tts).'),
    voice: z.string().min(1).default(V2_DEFAULT_VOICE).describe('A voice name: jessica (young female), sarah (female), liam (young male), chris (male), lily (elder female), bill (elder male), matilda (warm), or a raw ElevenLabs voice id.'),
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
  /** Human line, e.g. "5s on seedance-2.0 at 30 credits/s (720p)". */
  breakdown: string;
  /** Video only: the resolved mode and provider id. */
  mode?: V2VideoMode;
  quality?: V2VideoQuality;
}

/**
 * Facts the schema cannot know and the server measures at submit:
 * the length of each reference clip (billed like output seconds).
 */
export interface QuoteExtras {
  /** Sum of video_refs durations in seconds, measured with ffprobe. */
  inputVideoSeconds?: number;
}

/**
 * Credits for a validated input. Integer, never below 1 for a real job,
 * computed from V2_MODELS so the catalog IS the price list.
 */
export function quoteGenerate(kind: 'image', input: GenerateImageInput): GenerateQuote;
export function quoteGenerate(kind: 'video', input: GenerateVideoInput, extras?: QuoteExtras): GenerateQuote;
export function quoteGenerate(kind: 'audio', input: GenerateAudioInput): GenerateQuote;
export function quoteGenerate(kind: GenerateKind, input: GenerateImageInput | GenerateVideoInput | GenerateAudioInput, extras: QuoteExtras = {}): GenerateQuote {
  const modelId = (input as { model?: string }).model ?? V2_DEFAULT_MODEL[kind];
  if (modelId === V2_MODEL_AUTO) {
    throw new Error('cannot quote "auto": resolve it with pickAuto() first');
  }
  const m: V2ModelRecord | undefined = V2_MODELS[modelId];
  if (!m || m.status !== 'live' || !m.credits) {
    throw new Error(`cannot quote: "${modelId}" is not a live ${kind} model`);
  }
  const { perUnit, base = 0, unit } = m.credits;
  if (kind === 'video') {
    const v = input as GenerateVideoInput;
    const r = resolveVideoRequest(v);
    const rate = m.video?.creditsPerSecond?.[r.quality] ?? perUnit;
    const inputSeconds = v.video_refs?.length ? Math.ceil(extras.inputVideoSeconds ?? 0) : 0;
    const credits = Math.ceil(base + rate * (v.seconds + inputSeconds));
    const refNote = v.video_refs?.length
      ? inputSeconds
        ? ` + ${inputSeconds}s of reference video at the same rate`
        : ' + reference video seconds at the same rate (measured at submit)'
      : '';
    return {
      kind,
      model: m.id,
      credits,
      mode: r.mode,
      quality: r.quality,
      breakdown: `${v.seconds}s on ${m.id} (${r.mode} mode, ${r.quality}) at ${rate} credits/${unit}${refNote}${base ? ` + ${base} base` : ''}`,
    };
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

/** Parse + quote in one step; the shape /v2/quote and the `quote` tool return. `auto` resolves against `stats` (empty ⇒ the default). */
export function quoteAny(
  kind: GenerateKind,
  raw: unknown,
  stats: ModelStatsMap = {},
  extras: QuoteExtras = {},
): { ok: true; quote: GenerateQuote; input: GenerateImageInput | GenerateVideoInput | GenerateAudioInput; auto?: AutoPick } | { ok: false; issues: z.ZodIssue[] } {
  const schema = kind === 'image' ? GenerateImageSchema : kind === 'video' ? GenerateVideoSchema : GenerateAudioSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  const data = parsed.data as GenerateImageInput & { model?: string };
  if (data.model === V2_MODEL_AUTO) {
    const auto = pickAuto(kind, stats, kind === 'video' ? deriveVideoMode(data as unknown as GenerateVideoInput) : undefined);
    // Re-validate against the picked model: its limits may differ from the default's.
    const again = schema.safeParse({ ...(raw as object), model: auto.model });
    if (!again.success) return { ok: false, issues: again.error.issues };
    const input = again.data as GenerateImageInput;
    return { ok: true, quote: quoteGenerate(kind as 'video', input as unknown as GenerateVideoInput, extras), input, auto };
  }
  return { ok: true, quote: quoteGenerate(kind as 'video', data as unknown as GenerateVideoInput, extras), input: data };
}

// ── model: "auto" ─────────────────────────────────────────────────────────

/** One row of public.model_stats (last 30 days, loose-surface jobs only). */
export interface ModelRecentStats {
  runs: number;
  failed: number;
  avg_auto_score: number | null;
  scored: number;
  avg_user_score: number | null;
  rated: number;
  p50_seconds: number | null;
  avg_credits: number | null;
}
export type ModelStatsMap = Record<string, ModelRecentStats | undefined>;

export interface AutoPick {
  model: string;
  reason: string;
}

/** Below this many judged runs a model's score is not trusted. */
export const AUTO_MIN_SCORED = 10;
/** A challenger must beat the default by this much (0..1) to be picked. */
export const AUTO_MIN_GAIN = 0.1;
/** A challenger may cost at most this multiple of the default per unit. */
export const AUTO_MAX_PRICE_RATIO = 1.5;
/** Fail-rate above which the default is abandoned for a healthier model (needs AUTO_MIN_SCORED runs). */
export const AUTO_MAX_FAIL_RATE = 0.25;

/**
 * The whole policy, so it can be printed in list_models and argued with:
 *   1. Start from the kind's default. Only models that have the request's
 *      mode (video: text / image / reference) are candidates.
 *   2. If the default has ≥10 runs and >25% failed in the last 30 days, and
 *      another live model has ≥10 runs and <10% failed, use that one.
 *   3. Otherwise, among live models with ≥10 judged runs and a price ≤1.5x
 *      the default's, take the highest auto score if it beats the default's
 *      by ≥0.10 (a default with no score counts as 0.70).
 *   4. Otherwise the default.
 * Pure. Never returns a non-live model.
 */
export function pickAuto(kind: GenerateKind, stats: ModelStatsMap, videoMode?: V2VideoMode): AutoPick {
  const def = V2_MODELS[V2_DEFAULT_MODEL[kind]];
  const live = liveModels().filter((m) => m.kind === kind && m.credits && (!videoMode || m.video?.modes[videoMode]));
  const st = (id: string) => stats[id];
  const failRate = (s?: ModelRecentStats) => (s && s.runs >= AUTO_MIN_SCORED ? s.failed / s.runs : null);

  const defFail = failRate(st(def.id));
  if (defFail !== null && defFail > AUTO_MAX_FAIL_RATE) {
    const healthy = live
      .filter((m) => m.id !== def.id)
      .map((m) => ({ m, f: failRate(st(m.id)) }))
      .filter((x) => x.f !== null && x.f < 0.1)
      .sort((a, b) => a.f! - b.f!)[0];
    if (healthy) {
      return { model: healthy.m.id, reason: `${def.id} failed ${Math.round(defFail * 100)}% of its last ${st(def.id)!.runs} runs; ${healthy.m.id} failed ${Math.round(healthy.f! * 100)}%` };
    }
  }

  const defScore = st(def.id)?.scored! >= AUTO_MIN_SCORED ? st(def.id)!.avg_auto_score : null;
  const baseline = defScore ?? 0.7;
  const maxPrice = def.credits!.perUnit * AUTO_MAX_PRICE_RATIO;
  const best = live
    .filter((m) => m.id !== def.id && m.credits!.perUnit <= maxPrice)
    .map((m) => ({ m, s: st(m.id) }))
    .filter((x) => x.s && x.s.scored >= AUTO_MIN_SCORED && x.s.avg_auto_score !== null)
    .sort((a, b) => b.s!.avg_auto_score! - a.s!.avg_auto_score!)[0];
  if (best && best.s!.avg_auto_score! >= baseline + AUTO_MIN_GAIN) {
    return { model: best.m.id, reason: `${best.m.id} scores ${best.s!.avg_auto_score!.toFixed(2)} over ${best.s!.scored} judged runs vs ${baseline.toFixed(2)} for ${def.id}, within ${AUTO_MAX_PRICE_RATIO}x the price` };
  }
  return { model: def.id, reason: defScore === null ? `${def.id} is the default and no challenger has ${AUTO_MIN_SCORED} judged runs that beat it` : `${def.id} scores ${defScore.toFixed(2)}; no cheaper-or-close model beats it by ${AUTO_MIN_GAIN}` };
}
