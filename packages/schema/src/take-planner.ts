// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Take planning — THE single source of truth for how a script becomes takes.
 *
 * This module exists because api-v2 (quote) and primitive-worker-vnext (execution)
 * each had their own copy of `chunkScript`, and the copies drifted by two
 * constants:
 *
 *              sentence-pack threshold   hard-split stride
 *   api-v2                        > 28                  22
 *   worker                        > 33                  33
 *
 * A 34-word sentence therefore quoted as two 10s takes (560 credits) but rendered
 * as one 15s take (420). Preflight only *checks* the balance while the worker does
 * the actual deduction, so the user was charged 420 and merely rejected if they
 * held less than 560 — a false 402 on work they could afford, and a direct
 * contradiction of the documented promise that the `/quote` number is the number
 * you are charged.
 *
 * The worker's constants are the correct ones: 33 words is the upper band of a
 * single 15s take, and packing to that bound emits the FEWEST takes, which is the
 * biggest lever against cross-take face drift (the decay only became objectionable
 * past ~2 takes).
 *
 * ⚠ INVARIANT: quote and run must plan identically. Both sides import from here.
 * Do not re-implement chunking anywhere else, and do not tune these constants
 * without re-running the parity tests in packages/schema/src/__tests__.
 */

/** Word bound used when PACKING sentences into takes. */
export const TAKE_MAX_WORDS = 33;

/** A take shorter than this has too little speech to fill even a 5s clip. */
export const TAKE_MIN_WORDS = 5;

/**
 * The ceiling any single take can reach. Equal to the packing bound.
 *
 * This was TAKE_MAX_WORDS + TAKE_MIN_WORDS - 1 = 37, on the reasoning that the
 * tail-merge folds a sub-minimum remainder (at most 4 words) back into the
 * preceding chunk, and that 37 is fine because "speech runs ~2.5 words/second, so
 * a 15s take holds floor(15 x 2.5) = 37".
 *
 * That was wrong, and it shipped. 2.5 w/s is the CHUNKING ceiling. The RENDERER
 * runs at ~1.5 w/s and SimpleSelfieToolInputSchema hard-rejects any take outside
 * [duration, round(duration x 2.2)] — so a 15s take holds 33 words, not 37. A
 * single 37-word sentence hard-split to [33, 4] then tail-merged back to [37]
 * produced one take the renderer refuses. The quote priced it at 420 credits and
 * the run failed on validation.
 *
 * The merge now rebalances instead of overflowing, so no chunk exceeds the
 * packing bound and every chunk is renderable. See chunkScript.
 *
 * (The generate.ts cross-check that used to sit here compared against
 * MAX_WORDS_PER_DURATION[15] = 37, which is that route's own script-generation
 * budget, not this one's render limit. Two different numbers; conflating them is
 * what produced the bug.)
 */
export const TAKE_ABSOLUTE_MAX_WORDS = TAKE_MAX_WORDS;

/**
 * Split a word list into the fewest equal-sized chunks that each fit a take.
 * Same shape as the podcast chunker's balanced split, which never had this bug.
 */
function balancedSplit(words: string[]): string[] {
  const n = Math.ceil(words.length / TAKE_MAX_WORDS);
  if (n <= 1) return [words.join(' ')];
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

/** The only durations the pipeline renders. */
export type TakeDuration = 5 | 10 | 15;

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Map a single take's script to its rendered duration.
 *
 * ⚠ These thresholds set the PRICE (5s=140, 10s=280, 15s=420 credits). The public
 * pacing doc (public-skill/reference/pacing.md) publishes this exact table and is
 * generated from it — keep them in step.
 */
export function fitDuration(script: string): TakeDuration {
  const w = countWords(script);
  if (w <= 11) return 5;
  if (w <= 22) return 10;
  return 15;
}

/**
 * Pack a script into the fewest sentence-aligned chunks that each still fit a
 * single <=15s take. Long sentences are hard-split; sub-minimum tails are merged
 * so no chunk falls below TAKE_MIN_WORDS.
 */
export function chunkScript(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const sentences =
    clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];

  // Pack sentences until the next would overflow one take → fewest takes.
  const grouped: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const candidate = cur ? `${cur} ${s}` : s;
    if (cur && countWords(candidate) > TAKE_MAX_WORDS) {
      grouped.push(cur);
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur) grouped.push(cur);

  // Hard-split anything still larger than one take can hold.
  const sized: string[] = [];
  for (const p of grouped) {
    if (countWords(p) <= TAKE_MAX_WORDS) {
      sized.push(p);
      continue;
    }
    const words = p.split(/\s+/);
    for (let i = 0; i < words.length; i += TAKE_MAX_WORDS) {
      sized.push(words.slice(i, i + TAKE_MAX_WORDS).join(' '));
    }
  }

  // Merge a sub-minimum tail backwards, then a sub-minimum head forwards.
  //
  // A plain merge can push the receiving chunk past TAKE_MAX_WORDS — [33, 4]
  // becomes [37], which the renderer rejects. So merge, and if the result
  // overflows, rebalance the merged words into equal takes instead. Both halves
  // of a rebalanced pair are >= TAKE_MIN_WORDS, so this cannot reintroduce the
  // sub-minimum chunk it was called to remove.
  for (let i = sized.length - 1; i > 0; i -= 1) {
    if (countWords(sized[i]) < TAKE_MIN_WORDS) {
      const merged = `${sized[i - 1]} ${sized[i]}`.split(/\s+/).filter(Boolean);
      if (merged.length <= TAKE_MAX_WORDS) {
        sized.splice(i - 1, 2, merged.join(' '));
      } else {
        sized.splice(i - 1, 2, ...balancedSplit(merged));
      }
    }
  }
  if (sized.length > 1 && countWords(sized[0]) < TAKE_MIN_WORDS) {
    const merged = `${sized[0]} ${sized[1]}`.split(/\s+/).filter(Boolean);
    if (merged.length <= TAKE_MAX_WORDS) {
      sized.splice(0, 2, merged.join(' '));
    } else {
      sized.splice(0, 2, ...balancedSplit(merged));
    }
  }

  return sized.length ? sized : [clean];
}

/** Seconds the intro phase occupies in the review-style (`---`) shape. */
export const INTRO_SECONDS = 5;

/**
 * Split a script into INTRO and MOVES halves on a line that is exactly `---`.
 * Returns null when there is no marker, either side is empty, or the total
 * duration is too short for two phases.
 */
export function splitIntroMoves(
  script: string,
  duration: number,
): { intro: string; moves: string } | null {
  if (duration < INTRO_SECONDS * 2) return null;
  const parts = script.split(/(?:^|\n)\s*---\s*(?:\n|$)/);
  if (parts.length < 2) return null;
  const intro = parts[0].trim();
  const moves = parts.slice(1).join(' ').trim();
  if (!intro || !moves) return null;
  return { intro, moves };
}

/**
 * The full take plan for a b-roll / talking-head script: the exact chunk sequence
 * both the quote and the worker must agree on.
 */
export function planTakes(script: string, duration: number): string[] {
  const split = splitIntroMoves(script, duration);
  return split
    ? [...chunkScript(split.intro), ...chunkScript(split.moves)]
    : chunkScript(script);
}

/** Durations for each planned take — what the price is summed from. */
export function planTakeDurations(script: string, duration: number): TakeDuration[] {
  return planTakes(script, duration).map(fitDuration);
}
