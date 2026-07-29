// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Composed skill workflow: broll_talking_head.
 *
 * Builds an up-to-30s talking-head video with a user-supplied b-roll video
 * overlaid on the lower half of the actor (face stays in the upper portion).
 *
 * Two shapes, chosen by the script:
 *
 *   1. INTRO + MOVES (review style) — when the script contains a line that is
 *      exactly `---`, the text before it is the INTRO (actor speaks to camera,
 *      no b-roll) and the text after is the MOVES narration (the b-roll appears
 *      and plays through this whole phase). This is the "Today we're reviewing
 *      X vs Y … now watch move 1 …" structure: the intro is its own take and
 *      the moves are one or more <=15s takes (packed into the FEWEST takes so
 *      there are as few seams as possible). Every take is generated PRISTINE —
 *      purely from the references (portrait-led + character sheet) + one
 *      render-wide seed, with NO frame/video conditioning between takes (any
 *      conditioning frame bleeds grain forward and the face decays). Continuity
 *      across the seam is handled by a short cross-dissolve at the compose step,
 *      not by the model. The b-roll auto-starts when the moves phase begins,
 *      plays once, then freezes its last frame and fades out (lingers, not vanishes).
 *
 *   2. PLAIN — no `---`: a single (<=15s) or two-take (16-30s) talking head,
 *      script split word-proportionally, b-roll placed per broll_start_time and
 *      shown once (legacy behavior, unchanged).
 *
 * Speech paths:
 *   - script    → Seedance-native voice per take (chained simple_selfie).
 *   - audio_url → bring-your-own audio. v1 supports a single clip (duration<=15);
 *                 multi-segment audio splitting is a documented fast-follow.
 *
 * Each primitive Activity records its own primitive_runs row tied to the parent
 * skill_run_id; the compose step records the final composite run + artifact.
 */

import { proxyActivities, ApplicationFailure } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import type { SimpleSelfieActivityInput, SimpleSelfieActivityResult } from '../activities/simple-selfie.js';
import type { LipSyncActivityInput, LipSyncActivityResult } from '../activities/lip-sync.js';
import type { ExtractAudioActivityResult } from '../activities/extract-audio.js';
import type { ComposeBrollOverlayInput, ComposeBrollOverlayResult } from '../activities/compose-broll-overlay.js';
import type { SubtitlesActivityInput, SubtitlesActivityResult } from '../activities/subtitles.js';

type SelfieAspect = '9:16' | '1:1';

export interface BrollTalkingHeadWorkflowInput {
  skill_run_id: string;
  user_id: string;
  actor_image_url: string;
  /** Optional clean portrait of the same person — a second identity reference for higher-fidelity faces. */
  portrait_url?: string;
  /** Optional b-roll overlay. Omit → plain multi-take talking head, no overlay. */
  broll_video_url?: string;
  script?: string;
  audio_url?: string;
  duration: 10 | 15 | 20 | 25 | 30;
  aspect_ratio: '9:16' | '1:1' | '16:9';
  subtitles?: boolean;
  overlay_size: 'small' | 'medium' | 'large' | 'full';
  overlay_position: 'bottom' | 'bottom_left' | 'bottom_right' | 'center';
  broll_width_rate?: number;
  broll_start_time?: number;
  broll_fade_out?: boolean;
}

export interface BrollTalkingHeadWorkflowResult {
  skill_run_id: string;
  video_url: string;
  duration_seconds: number;
  credits_actual_usd: number;
}

const NON_RETRYABLE = [
  'INVALID_INPUT', 'BUDGET_CAP_PRIMITIVE', 'BUDGET_CAP_DAY',
  'REFERENCE_FETCH_FAILED', 'REFERENCE_NOT_IMAGE', 'REFERENCE_URL_NOT_ALLOWED',
  'REFERENCE_NOT_VIDEO', 'PROVIDER_UNCONFIGURED', 'INSUFFICIENT_CREDITS',
  'OPENAI_400', 'OPENAI_401', 'OPENAI_403', 'OPENAI_404', 'OPENAI_413', 'OPENAI_415', 'OPENAI_422', 'OPENAI_451',
  'EVOLINK_400', 'EVOLINK_401', 'EVOLINK_403', 'EVOLINK_404', 'EVOLINK_413', 'EVOLINK_415', 'EVOLINK_422', 'EVOLINK_451',
  'TRANSCRIBE_EMPTY',
];

const videoRetry = {
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '5 minutes',
  retry: { initialInterval: '10s', maximumInterval: '2m', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
} as const;
const utilRetry = {
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '90 seconds',
  retry: { initialInterval: '5s', maximumInterval: '60s', backoffCoefficient: 2, maximumAttempts: 3, nonRetryableErrorTypes: NON_RETRYABLE },
} as const;

const { simpleSelfie } = proxyActivities<PrimitiveActivities>(videoRetry);
const { lipSync } = proxyActivities<PrimitiveActivities>(videoRetry);
const { composeBrollOverlay } = proxyActivities<PrimitiveActivities>(videoRetry);
const { extractAudio } = proxyActivities<PrimitiveActivities>(utilRetry);
const { subtitles } = proxyActivities<PrimitiveActivities>(utilRetry);
const { composedSkillState } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

/**
 * Plan talking-head segments. Seedance 2.0 renders a single coherent clip up to
 * 15s, so we use the FEWEST possible generations — one generation = one
 * consistent character + one consistent voice (no cross-clip drift):
 *   - <=15s  → a single generation (zero cuts, perfect consistency)
 *   - 16-30s → exactly two generations (15 + remainder), never more
 * Capping at two segments (down from up to three independent clips) is what
 * kills the "character changes at every cut" problem. The two segments share a
 * seed + the same reference image to keep identity stable across the one cut.
 */
export function planSegments(duration: number): Array<5 | 10 | 15> {
  if (duration <= 5) return [5];
  if (duration <= 10) return [10];
  if (duration <= 15) return [15];
  const rest = duration - 15;
  return [15, rest <= 5 ? 5 : rest <= 10 ? 10 : 15];
}


/** Split a script into N parts, word-proportional to each segment's duration,
 *  nudged to the nearest sentence boundary so no segment cuts mid-sentence. */
export function splitScript(script: string, segDurations: number[]): string[] {
  const n = segDurations.length;
  if (n <= 1) return [script.trim()];
  const words = script.trim().split(/\s+/).filter(Boolean);
  const totalDur = segDurations.reduce((s, d) => s + d, 0);
  const parts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      parts.push(words.slice(cursor).join(' '));
      break;
    }
    const targetCount = Math.round((segDurations[i] / totalDur) * words.length);
    let end = Math.min(words.length, cursor + Math.max(1, targetCount));
    // Nudge forward to the next word ending a sentence (., !, ?), within a small window.
    for (let j = end; j < Math.min(words.length, end + 4); j += 1) {
      if (/[.!?]$/.test(words[j - 1])) { end = j; break; }
    }
    parts.push(words.slice(cursor, end).join(' '));
    cursor = end;
  }
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Minimum span (seconds) needed to carve a separate intro phase. */
export const INTRO_SECONDS = 5;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Pick the take length whose allowed word band [d, d*2.2] contains the script's
 *  word count (5s: 5-11, 10s: 10-22, 15s: 15-33), matching simple_selfie's
 *  validation so every chunk passes. */
export function fitDuration(script: string): 5 | 10 | 15 {
  const w = countWords(script);
  if (w <= 11) return 5;
  if (w <= 22) return 10;
  return 15;
}

/** Pack a script into the FEWEST sentence-aligned chunks that each still fit a
 *  single <=15s take (<=33 words). Fewer chunks = fewer takes = fewer seams =
 *  fewer continuity hops, which is the biggest lever against cross-take face
 *  drift (the decay only became objectionable past ~2 takes). Long sentences are
 *  hard-split; tiny tails (<5 words) are merged so no chunk is below 5 words. */
const TAKE_MAX_WORDS = 33; // upper word band of a single 15s take
export function chunkScript(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const grouped: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const candidate = cur ? `${cur} ${s}` : s;
    // Pack sentences until the next one would overflow a single 15s take, so we
    // emit the fewest possible takes.
    if (cur && countWords(candidate) > TAKE_MAX_WORDS) {
      grouped.push(cur);
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur) grouped.push(cur);
  // Hard-split any single chunk still longer than one take can hold, into the
  // fewest <=33-word (15s) pieces.
  const sized: string[] = [];
  for (const p of grouped) {
    if (countWords(p) <= TAKE_MAX_WORDS) {
      sized.push(p);
      continue;
    }
    const words = p.split(/\s+/);
    for (let i = 0; i < words.length; i += TAKE_MAX_WORDS) sized.push(words.slice(i, i + TAKE_MAX_WORDS).join(' '));
  }
  // Merge a sub-5-word tail into its neighbour (5s takes need >=5 words).
  for (let i = sized.length - 1; i > 0; i -= 1) {
    if (countWords(sized[i]) < 5) {
      sized[i - 1] = `${sized[i - 1]} ${sized[i]}`;
      sized.splice(i, 1);
    }
  }
  if (sized.length > 1 && countWords(sized[0]) < 5) {
    sized[1] = `${sized[0]} ${sized[1]}`;
    sized.shift();
  }
  return sized.length ? sized : [clean];
}

/**
 * Split a script into an INTRO part and a MOVES part for the review-style shape.
 * The author marks the boundary with a line that is exactly `---`. Returns null
 * when there's no marker (→ caller uses the plain word-proportional path), or
 * when either side is empty / the total duration is too short for two phases.
 */
export function splitIntroMoves(
  script: string,
  duration: number,
): { intro: string; moves: string } | null {
  if (duration < INTRO_SECONDS * 2) return null; // too short to carve an intro
  const m = script.split(/(?:^|\n)\s*---\s*(?:\n|$)/);
  if (m.length < 2) return null;
  const intro = m[0].trim();
  const moves = m.slice(1).join(' ').trim();
  if (!intro || !moves) return null;
  return { intro, moves };
}

// Refund on terminal failure so a paid broll that never completes returns the
// user's credits. Idempotent (guards ALREADY_REFUNDED / NO_DEDUCTION_FOUND).
const { refundCredits } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function brollTalkingHeadWorkflow(
  input: BrollTalkingHeadWorkflowInput,
): Promise<BrollTalkingHeadWorkflowResult> {
  await composedSkillState({
    skill_run_id: input.skill_run_id,
    status: 'running',
    current_step: 'segment',
    started_at_now: true,
  });

  try {
  // simple_selfie / lip_sync only emit 9:16 or 1:1; compose normalizes onto the
  // final canvas (16:9 gets the 9:16 take pillarboxed).
  const selfieAspect: SelfieAspect = input.aspect_ratio === '1:1' ? '1:1' : '9:16';
  const useScript = Boolean(input.script);

  // audio_url path: v1 supports a single clip only (no silence-aware splitting yet).
  if (!useScript && input.duration > 15) {
    throw ApplicationFailure.nonRetryable(
      'audio_url path currently supports a single clip up to 15s; provide a script for longer seamless takes',
      'INVALID_INPUT',
    );
  }

  // ── Decide the SHAPE and build the ordered list of takes ──────────────────
  // Review style: a `---` line in the script splits an INTRO take (actor only)
  // from the MOVES narration (b-roll plays through it). The first MOVES take
  // continues from the intro's last frame — a REQUIRED continuity hop. Plain
  // style: one or two takes, word-proportional, b-roll shown once (legacy).
  const intro = useScript ? splitIntroMoves(input.script as string, input.duration) : null;

  interface PlannedTake { script: string; duration: 5 | 10 | 15 }
  let takes: PlannedTake[] = [];
  let brollStartDefault = input.broll_start_time ?? 0;

  if (intro) {
    // Each take's length is sized to its OWN word count so it always passes
    // simple_selfie's pacing validation (the fixed-5s intro was the bug).
    const introTakes = chunkScript(intro.intro).map((s) => ({ script: s, duration: fitDuration(s) }));
    const movesTakes = chunkScript(intro.moves).map((s) => ({ script: s, duration: fitDuration(s) }));
    takes = [...introTakes, ...movesTakes];
    // b-roll appears once the intro phase (its take[s]) ends.
    brollStartDefault = introTakes.reduce((sum, t) => sum + t.duration, 0);
  } else if (useScript) {
    takes = chunkScript(input.script as string).map((s) => ({ script: s, duration: fitDuration(s) }));
  }

  const imageUrl = input.actor_image_url;
  const clipUrls: string[] = [];
  let totalCredits = 0;
  // Voice carry-over: take 0 generates a natural voice (Seedance native audio);
  // we extract it once and feed it to every later take as a timbre reference so
  // the SAME voice speaks throughout — consistent across cuts, no TTS.
  let voiceRefAudioUrl: string | undefined;
  // Clean, CONSISTENT face: every take is generated PRISTINE — purely from the
  // same references (portrait-led + character sheet) + one render-wide seed, with
  // NO frame/video conditioning between takes. Feeding a prior take's frame/clip
  // (still OR @video1) makes the diffusion model inherit that take's grain and the
  // face decays (smooth → grainy across the seam); pristine is the only config
  // that rendered a clean face. Continuity (no visible cut) is handled downstream
  // by a short cross-dissolve at the compose step, not by conditioning the model.
  // Skin/outfit/voice are further pinned by the skin-lock + outfit-lock prompt
  // clauses and the voice carried over from take 0.
  const renderSeed = seedFromString(input.skill_run_id);

  if (useScript) {
    const lastIndex = takes.length - 1;
    for (let i = 0; i < takes.length; i += 1) {
      await composedSkillState({ skill_run_id: input.skill_run_id, current_step: `clip_${i + 1}` });
      const take = takes[i];
      const selfieInput: SimpleSelfieActivityInput = {
        primitive_run_id: makeChildRunId(input.skill_run_id, `seg${i}`),
        user_id: input.user_id,
        skill_run_id: input.skill_run_id,
        voice_ref_audio_url: voiceRefAudioUrl,
        portrait_url: input.portrait_url,
        // Same seed on every take → consistent look. No frame/video conditioning:
        // each take renders pristine so the face can't decay across the seam.
        seed: renderSeed,
        input: {
          character_sheet_url: imageUrl,
          duration: take.duration,
          script: take.script,
          aspect_ratio: selfieAspect,
        },
      };
      const r: SimpleSelfieActivityResult = await simpleSelfie(selfieInput);
      clipUrls.push(r.video_url);
      totalCredits += r.credits_actual_usd;

      // Voice carry-over: extract take 0's natural voice once and reuse it for
      // every later take so the SAME voice speaks throughout.
      if (i === 0 && lastIndex > 0) {
        await composedSkillState({ skill_run_id: input.skill_run_id, current_step: 'voice_ref' });
        const extracted: ExtractAudioActivityResult = await extractAudio({
          primitive_run_id: makeChildRunId(input.skill_run_id, 'voiceref'),
          user_id: input.user_id,
          skill_run_id: input.skill_run_id,
          video_url: r.video_url,
          max_seconds: 15,
        });
        voiceRefAudioUrl = extracted.audio_url;
      }
    }
  } else {
    // audio_url path: a single lip-synced clip (<=15s).
    await composedSkillState({ skill_run_id: input.skill_run_id, current_step: 'clip_1' });
    const lipInput: LipSyncActivityInput = {
      primitive_run_id: makeChildRunId(input.skill_run_id, 'seg0'),
      user_id: input.user_id,
      skill_run_id: input.skill_run_id,
      input: {
        image_url: imageUrl,
        audio_url: input.audio_url as string,
        duration: (input.duration <= 5 ? 5 : input.duration <= 10 ? 10 : 15) as 5 | 10 | 15,
        aspect_ratio: selfieAspect,
      },
    };
    const r: LipSyncActivityResult = await lipSync(lipInput);
    clipUrls.push(r.video_url);
    totalCredits += r.credits_actual_usd;
  }

  // Composite: concat the chained clips + overlay the b-roll on the lower half.
  // In review (intro) shape the b-roll auto-starts when the moves phase begins
  // and LOOP-FILLS to the end so the lower half is never empty while the actor
  // narrates; plain shape keeps the legacy "start_time, play once" placement.
  await composedSkillState({ skill_run_id: input.skill_run_id, current_step: 'compose' });
  const composeInput: ComposeBrollOverlayInput = {
    primitive_run_id: makeChildRunId(input.skill_run_id, 'compose'),
    user_id: input.user_id,
    skill_run_id: input.skill_run_id,
    clip_urls: clipUrls,
    broll_video_url: input.broll_video_url,
    aspect_ratio: input.aspect_ratio,
    overlay_size: input.overlay_size,
    overlay_position: input.overlay_position,
    broll_width_rate: input.broll_width_rate,
    broll_start_time: input.broll_start_time ?? brollStartDefault,
    broll_fade_out: input.broll_fade_out,
    broll_loop: Boolean(intro),
  };
  const composed: ComposeBrollOverlayResult = await composeBrollOverlay(composeInput);

  // Optional: burn captions.
  let finalUrl = composed.video_url;
  if (input.subtitles) {
    await composedSkillState({ skill_run_id: input.skill_run_id, current_step: 'subtitles' });
    const subsInput: SubtitlesActivityInput = {
      primitive_run_id: makeChildRunId(input.skill_run_id, 'subs'),
      user_id: input.user_id,
      skill_run_id: input.skill_run_id,
      input: {
        video_url: composed.video_url,
        // Feed the SPOKEN text only — strip the `---` intro/moves marker so the
        // transcript matches the actual narration word-for-word (exact-count
        // guard in the subtitles activity then trusts it instead of Whisper).
        transcript: useScript
          ? (intro ? `${intro.intro} ${intro.moves}` : (input.script as string))
          : undefined,
        style: 'hormozi',
        // Caption canvas must match the COMPOSITE's aspect (may be 16:9), not the
        // 9:16/1:1 of the raw selfie clips — otherwise captions are mis-placed.
        aspect_ratio: input.aspect_ratio,
      },
    };
    const subs: SubtitlesActivityResult = await subtitles(subsInput);
    totalCredits += subs.credits_actual_usd;
    finalUrl = subs.video_url;
  }

  const finalOutput = {
    video_url: finalUrl,
    duration_seconds: composed.duration_seconds,
    credits_actual_usd: totalCredits,
  };
  await composedSkillState({
    skill_run_id: input.skill_run_id,
    status: 'succeeded',
    current_step: 'done',
    finished_at_now: true,
    final_output: finalOutput,
  });

  return { skill_run_id: input.skill_run_id, ...finalOutput };
  } catch (err) {
    // Refund every charged child run so a broll that terminally fails returns the
    // user's credits. refundCredits is idempotent and no-ops on never-charged ids,
    // so refunding a generous fixed set of segment ids (plus voiceref/compose/subs)
    // is safe even though the exact segment count isn't in catch scope.
    const childSteps = ['voiceref', 'compose', 'subs'];
    for (let i = 0; i < 12; i += 1) childSteps.push(`seg${i}`);
    for (const step of childSteps) {
      await refundCredits({ primitive_run_id: makeChildRunId(input.skill_run_id, step) });
    }
    // Mark the skill_run failed so it never sits stuck on "running". The
    // workflow still rethrows so Temporal records the failure too.
    await composedSkillState({
      skill_run_id: input.skill_run_id,
      status: 'failed',
      finished_at_now: true,
      error_code: err instanceof ApplicationFailure ? (err.type ?? 'WORKFLOW_FAILED') : 'WORKFLOW_FAILED',
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
}

/** FNV-1a 32-bit hash. Deterministic + side-effect-free, so it is safe inside
 *  the Temporal workflow isolate (no crypto / Date / random). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic non-negative 31-bit seed from a string. The broll workflow
 * derives ONE seed per render (from skill_run_id) and passes the SAME value to
 * every take so Seedance pins the look (face/framing/wardrobe) across cuts.
 */
function seedFromString(s: string): number {
  // Map into [1, 2^31-1] — never 0, since some providers treat seed 0 as
  // "pick a random seed", which would defeat the cross-take consistency lock.
  return (fnv1a(s) % 2147483646) + 1;
}

/**
 * Deterministic child primitive_run_id derived from skill_run_id + step.
 * Replaces the last 12 hex chars of the uuid with a per-step hash so IDs stay
 * idempotent across workflow retries (no Node crypto inside the workflow isolate).
 * The hash is computed per step label so EVERY step — seg0, seg1, … seg9,
 * compose, subs, voiceref — gets a UNIQUE id. (The previous hardcoded map only
 * covered seg0-2 and collided on every take past the third, handing back a
 * cached/wrong clip for renders that chunk into 4+ takes.)
 */
function makeChildRunId(skillRunId: string, step: string): string {
  const suffix = (fnv1a(step).toString(16).padStart(8, '0') + '0000').slice(0, 12);
  const base = skillRunId.replace(/[^a-f0-9-]/gi, '').toLowerCase();
  return base.slice(0, base.length - 12) + suffix;
}
