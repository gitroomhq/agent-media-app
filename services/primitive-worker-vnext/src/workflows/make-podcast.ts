// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Composed skill workflow: make_podcast.
 *
 * Two SAVED actors sit in ONE room recording a podcast; the camera cuts to
 * whoever is speaking, and each actor stays in their IDENTICAL seat / desk / mic
 * position across every cut. The founder's hard requirement is "keep identical
 * position + assets", so the pipeline locks one FRAME per actor and reuses it for
 * every one of that actor's turns:
 *
 *   1. podcastScene   — ONE master two-shot (both actors, shared desk + mics) via
 *                       a gpt-image-2 multi-reference edit. The single source of
 *                       truth for the shared set.
 *   2. podcastReframe — crop the master into a LOCKED 9:16 close-up per actor
 *                       (frame_A = left seat, frame_B = right seat), face re-locked
 *                       from each actor's own reference.
 *   3. per turn       — animate the SPEAKER's locked frame with simpleSelfie
 *                       (Seedance reference-to-video, native voice). Every A-turn
 *                       reuses frame_A + voice_ref_A + seed_A; every B-turn reuses
 *                       frame_B + voice_ref_B + seed_B → identical position + voice.
 *   4. compose        — HARD-cut the ordered A/B clips together on the 9:16 canvas
 *                       (a cross-dissolve would ghost one face into the other).
 *   5. subtitles      — optional burned captions.
 *
 * Voice consistency mirrors broll_talking_head but keyed PER SPEAKER: each actor's
 * first turn renders a native Seedance voice, extractAudio mints a voice ref, and
 * every later turn of that actor re-speaks new lines in that timbre (@Audio1).
 *
 * Each primitive Activity writes its own primitive_runs row tied to the parent
 * skill_run_id; a terminal failure refunds every charged child (idempotent).
 */

import { proxyActivities, ApplicationFailure } from '@temporalio/workflow';
import { countWords, fitDuration } from '@agentmedia/schema';
import type { PrimitiveActivities } from '../activities/index.js';
import type { SimpleSelfieActivityInput, SimpleSelfieActivityResult } from '../activities/simple-selfie.js';
import type { ExtractAudioActivityResult } from '../activities/extract-audio.js';
import type { ComposeBrollOverlayInput, ComposeBrollOverlayResult } from '../activities/compose-broll-overlay.js';
import type { SubtitlesActivityInput, SubtitlesActivityResult } from '../activities/subtitles.js';

export interface PodcastTurn {
  speaker: 'A' | 'B';
  line: string;
}

export interface MakePodcastWorkflowInput {
  skill_run_id: string;
  user_id: string;
  /** R2 reference image of actor A (portrait preferred, else character sheet). */
  character_a_ref_url: string;
  /** Optional pinned per-actor seed (locks A's look across all A turns). */
  character_a_seed?: number;
  /** R2 reference image of actor B. */
  character_b_ref_url: string;
  character_b_seed?: number;
  /** Ordered A/B dialogue turns. */
  script: PodcastTurn[];
  /** Optional shared studio description (desk / mics / lighting). */
  room?: string;
  aspect_ratio: '9:16';
  subtitles?: boolean;
  subtitles_style?: 'hormozi' | 'tiktok' | 'minimal';
}

export interface MakePodcastWorkflowResult {
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
const { composeBrollOverlay } = proxyActivities<PrimitiveActivities>(videoRetry);
// gpt-image steps: 2-5 min p100, so the video-shaped (20m / heartbeat) config fits.
const { podcastScene } = proxyActivities<PrimitiveActivities>(videoRetry);
const { podcastReframe } = proxyActivities<PrimitiveActivities>(videoRetry);
const { extractAudio } = proxyActivities<PrimitiveActivities>(utilRetry);
const { subtitles } = proxyActivities<PrimitiveActivities>(utilRetry);
const { composedSkillState } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});
const { refundCredits } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

interface PlannedTake {
  speaker: 'A' | 'B';
  script: string;
  duration: 5 | 10 | 15;
}

/** Flatten A/B turns into ordered <=15s takes; long turns chunk into several. */
export function planPodcastTakes(script: PodcastTurn[]): {
  takes: PlannedTake[];
  perSpeaker: { A: number; B: number };
} {
  const takes: PlannedTake[] = [];
  const perSpeaker = { A: 0, B: 0 };
  for (const turn of script) {
    for (const chunk of chunkPodcastTurn(turn.line)) {
      takes.push({ speaker: turn.speaker, script: chunk, duration: fitDuration(chunk) });
      perSpeaker[turn.speaker] += 1;
    }
  }
  return { takes, perSpeaker };
}

export async function makePodcastWorkflow(
  input: MakePodcastWorkflowInput,
): Promise<MakePodcastWorkflowResult> {
  const skillRunId = input.skill_run_id;
  // Every child run id we mint, so the catch can refund exactly what was charged
  // (image steps refund as no-ops; only the paid selfie/subtitle takes matter).
  const refundIds: string[] = [];
  const mint = (step: string): string => {
    const id = makeChildRunId(skillRunId, step);
    refundIds.push(id);
    return id;
  };

  await composedSkillState({
    skill_run_id: skillRunId,
    status: 'running',
    current_step: 'scene',
    started_at_now: true,
  });

  try {
    // ── 1. Master two-shot scene ──────────────────────────────────────────────
    const scene = await podcastScene({
      primitive_run_id: mint('scene'),
      user_id: input.user_id,
      skill_run_id: skillRunId,
      a_ref_url: input.character_a_ref_url,
      b_ref_url: input.character_b_ref_url,
      room: input.room,
    });

    // ── 2. Locked per-actor close-ups (left = A, right = B) ───────────────────
    await composedSkillState({ skill_run_id: skillRunId, current_step: 'reframe' });
    const frameA = await podcastReframe({
      primitive_run_id: mint('frame_a'),
      user_id: input.user_id,
      skill_run_id: skillRunId,
      master_url: scene.master_url,
      actor_ref_url: input.character_a_ref_url,
      side: 'left',
    });
    const frameB = await podcastReframe({
      primitive_run_id: mint('frame_b'),
      user_id: input.user_id,
      skill_run_id: skillRunId,
      master_url: scene.master_url,
      actor_ref_url: input.character_b_ref_url,
      side: 'right',
    });

    // ── 3. Plan + render the ordered A/B takes ────────────────────────────────
    const { takes, perSpeaker } = planPodcastTakes(input.script);
    if (takes.length === 0) {
      throw ApplicationFailure.nonRetryable('podcast script produced no takes', 'INVALID_INPUT');
    }
    // Defense in depth: never submit a take the provider will reject on word-band
    // pacing AFTER we've already paid for earlier takes. The chunker guarantees the
    // [5,33] band for >=5-word turns and the API enforces >=5 words/turn, so this
    // is unreachable — but it fails fast (before any spend) if either guard slips.
    for (const t of takes) {
      const w = t.script.trim().split(/\s+/).filter(Boolean).length;
      if (w < t.duration || w > Math.round(t.duration * 2.2)) {
        throw ApplicationFailure.nonRetryable(
          `a podcast turn could not be split into a valid ${t.duration}s take (${w} words); keep each turn ~5-33 words`,
          'INVALID_INPUT',
        );
      }
    }

    const frameUrl = { A: frameA.frame_url, B: frameB.frame_url };
    const seed = {
      A: pinSeed(input.character_a_seed, skillRunId, 'A'),
      B: pinSeed(input.character_b_seed, skillRunId, 'B'),
    };
    // Per-speaker voice lock: minted from each actor's FIRST take, reused after.
    const voiceRef: { A?: string; B?: string } = {};

    const clipUrls: string[] = [];
    let totalCredits = 0;

    for (let i = 0; i < takes.length; i += 1) {
      const take = takes[i];
      const s = take.speaker;
      await composedSkillState({ skill_run_id: skillRunId, current_step: `clip_${i + 1}` });

      const selfieInput: SimpleSelfieActivityInput = {
        primitive_run_id: mint(`${s}_t${i}`),
        user_id: input.user_id,
        skill_run_id: skillRunId,
        voice_ref_audio_url: voiceRef[s],
        // The LOCKED frame is the whole appearance target — do NOT also pass the
        // original portrait, or it competes with the framed desk/mic composition.
        seed: seed[s],
        // Podcast turns are spoken at a natural pace then the host pauses/listens
        // — never pad a short line with gibberish to fill the clip.
        natural_pacing: true,
        input: {
          character_sheet_url: frameUrl[s],
          duration: take.duration,
          script: take.script,
          location: 'a two-person podcast studio, seated across from a co-host',
          // Keep <=120 chars (SimpleSelfieToolInputSchema caps pose/location at 120).
          pose: '3/4 profile turned to the co-host, looking at the other person not the camera, gesturing while speaking',
          aspect_ratio: '9:16',
        },
      };
      const r: SimpleSelfieActivityResult = await simpleSelfie(selfieInput);
      clipUrls.push(r.video_url);
      totalCredits += r.credits_actual_usd;

      // Bootstrap this speaker's voice from their first take (only worth it when
      // they have more than one take — a lone take needs no carry-over).
      if (voiceRef[s] === undefined && perSpeaker[s] > 1) {
        await composedSkillState({ skill_run_id: skillRunId, current_step: `voice_ref_${s}` });
        const extracted: ExtractAudioActivityResult = await extractAudio({
          primitive_run_id: mint(`voiceref_${s}`),
          user_id: input.user_id,
          skill_run_id: skillRunId,
          video_url: r.video_url,
          max_seconds: 15,
        });
        voiceRef[s] = extracted.audio_url;
      }
    }

    // ── 4. Hard-cut the ordered A/B clips onto the 9:16 canvas ────────────────
    await composedSkillState({ skill_run_id: skillRunId, current_step: 'compose' });
    const composeInput: ComposeBrollOverlayInput = {
      primitive_run_id: mint('compose'),
      user_id: input.user_id,
      skill_run_id: skillRunId,
      clip_urls: clipUrls,
      // No b-roll: the concatenated talking clips ARE the podcast.
      aspect_ratio: '9:16',
      overlay_size: 'large',
      overlay_position: 'bottom',
      hard_cut: true,
    };
    const composed: ComposeBrollOverlayResult = await composeBrollOverlay(composeInput);

    // ── 5. Optional captions ──────────────────────────────────────────────────
    let finalUrl = composed.video_url;
    if (input.subtitles) {
      await composedSkillState({ skill_run_id: skillRunId, current_step: 'subtitles' });
      const subsInput: SubtitlesActivityInput = {
        primitive_run_id: mint('subs'),
        user_id: input.user_id,
        skill_run_id: skillRunId,
        input: {
          video_url: composed.video_url,
          // The full spoken text in order, so captions match the dialogue exactly.
          transcript: input.script.map((t) => t.line).join(' '),
          style: input.subtitles_style ?? 'hormozi',
          aspect_ratio: '9:16',
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
      skill_run_id: skillRunId,
      status: 'succeeded',
      current_step: 'done',
      finished_at_now: true,
      final_output: finalOutput,
    });
    return { skill_run_id: skillRunId, ...finalOutput };
  } catch (err) {
    // Refund every charged child (idempotent — no-ops on the free image steps and
    // on any take that never charged), then mark the run failed so it never sits
    // stuck on "running". Rethrow so Temporal records the failure too.
    for (const rid of refundIds) {
      await refundCredits({ primitive_run_id: rid });
    }
    await composedSkillState({
      skill_run_id: skillRunId,
      status: 'failed',
      finished_at_now: true,
      error_code: err instanceof ApplicationFailure ? (err.type ?? 'WORKFLOW_FAILED') : 'WORKFLOW_FAILED',
      error_message: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
}

// ── deterministic helpers (safe inside the workflow isolate: no crypto/Date/random) ──

/** FNV-1a 32-bit hash. Deterministic + side-effect-free. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic non-negative 31-bit seed from a string (never 0). */
function seedFromString(s: string): number {
  return (fnv1a(s) % 2147483646) + 1;
}

/** Use the actor's pinned seed when valid, else derive one deterministically so A
 *  and B each stay individually consistent across their own cuts. */
function pinSeed(provided: number | undefined, skillRunId: string, speaker: string): number {
  if (typeof provided === 'number' && Number.isFinite(provided) && provided >= 1 && provided <= 2147483646) {
    return Math.floor(provided);
  }
  return seedFromString(`${skillRunId}:${speaker}`);
}

/** Deterministic child primitive_run_id from skill_run_id + step (unique per step). */
function makeChildRunId(skillRunId: string, step: string): string {
  const suffix = (fnv1a(step).toString(16).padStart(8, '0') + '0000').slice(0, 12);
  const base = skillRunId.replace(/[^a-f0-9-]/gi, '').toLowerCase();
  return base.slice(0, base.length - 12) + suffix;
}

/**
 * Pick the take length whose word band [d, d*2.2] holds the chunk (5s:5-11,
 * 10s:10-22, 15s:15-33), matching simple_selfie's pacing validation.
 *
 * Re-exported from @agentmedia/schema rather than reimplemented. This module
 * used to hold a third private copy of fitDuration/countWords alongside the one
 * in the schema package and the one in api-v2's make-ugc-router. All three
 * agreed, but only by hand, and the credit quote reads one while the worker
 * renders from another.
 */
export { countWords, fitDuration };

// A single Seedance take must fill 5/10/15s at ~1-2.2 words/sec, so simpleSelfie
// validates word_count ∈ [duration, duration*2.2] — i.e. every take's script must
// land in [5, 33] words. The chunker below GUARANTEES that band for any turn of
// >= PODCAST_MIN_TURN_WORDS words, so a valid take always renders.
export const TAKE_MAX_WORDS = 33; // upper band of a 15s take
export const TAKE_MIN_WORDS = 5; //  lower band of a 5s take
export const PODCAST_MIN_TURN_WORDS = TAKE_MIN_WORDS; // enforced by the API schema

/** Split an over-long word list into N balanced pieces, each <= TAKE_MAX_WORDS
 *  (and, because N = ceil(len/33), each also comfortably >= TAKE_MIN_WORDS). */
function balancedSplit(words: string[]): string[] {
  const n = Math.ceil(words.length / TAKE_MAX_WORDS);
  const base = Math.floor(words.length / n);
  const rem = words.length % n;
  const out: string[] = [];
  let i = 0;
  for (let k = 0; k < n; k += 1) {
    const size = base + (k < rem ? 1 : 0);
    out.push(words.slice(i, i + size).join(' '));
    i += size;
  }
  return out;
}

/**
 * Chunk ONE dialogue turn into ordered <=15s takes, each guaranteed to fall in
 * simpleSelfie's [5, 33]-word band. Sentence-aligned where possible (nicer seams),
 * balance-split only when a single run-on group exceeds a take, and any sub-5-word
 * tail is merged into a neighbour (re-balancing if that would overflow 33). For a
 * turn of >= 5 words this NEVER emits a <5 or >33 word chunk — the two failure
 * modes the pre-deploy review caught (short interjection turn, 34-37 word run-on).
 * The credit quote (api-v2 credit-quotes.ts) uses a byte-identical copy so the
 * preflight charge always matches the takes the worker renders.
 */
export function chunkPodcastTurn(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const groups: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const candidate = cur ? `${cur} ${s}` : s;
    if (cur && countWords(candidate) > TAKE_MAX_WORDS) {
      groups.push(cur);
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur) groups.push(cur);
  // Balance-split any group longer than a single take.
  let pieces: string[] = [];
  for (const g of groups) {
    const w = g.split(/\s+/).filter(Boolean);
    if (w.length <= TAKE_MAX_WORDS) pieces.push(g);
    else pieces.push(...balancedSplit(w));
  }
  // Merge any sub-5-word tail into its previous neighbour; re-balance if the
  // merged pair overflows a take (this is what the old code got wrong — it left a
  // 34-word chunk that then failed validation).
  for (let i = pieces.length - 1; i > 0; i -= 1) {
    if (countWords(pieces[i]) < TAKE_MIN_WORDS) {
      const merged = `${pieces[i - 1]} ${pieces[i]}`.split(/\s+/).filter(Boolean);
      if (merged.length <= TAKE_MAX_WORDS) pieces.splice(i - 1, 2, merged.join(' '));
      else pieces.splice(i - 1, 2, ...balancedSplit(merged));
    }
  }
  // A sub-5 FIRST piece can only merge forward.
  if (pieces.length > 1 && countWords(pieces[0]) < TAKE_MIN_WORDS) {
    const merged = `${pieces[0]} ${pieces[1]}`.split(/\s+/).filter(Boolean);
    if (merged.length <= TAKE_MAX_WORDS) pieces.splice(0, 2, merged.join(' '));
    else pieces.splice(0, 2, ...balancedSplit(merged));
  }
  return pieces.length ? pieces : [clean];
}
