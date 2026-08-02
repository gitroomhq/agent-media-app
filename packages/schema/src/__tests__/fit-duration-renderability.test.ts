// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * fitDuration must only ever return a duration the renderer will actually accept.
 *
 * WHY THIS EXISTS. The 11 / 22 word thresholds in fitDuration look arbitrary next
 * to the 2.5 words/second constant in the same file, and an attempt was made to
 * "correct" them to 12 / 25 on the grounds that 12 words is only 4.8 seconds of
 * speech and was therefore being overcharged a tier.
 *
 * That reasoning was wrong, and nothing in the suite caught it. The 2.5 w/s figure
 * is the CHUNKING ceiling — the point past which a script must be split into more
 * takes. The RENDERING cadence is ~1.5 w/s, and SimpleSelfieToolInputSchema hard-
 * rejects any take whose script falls outside [duration, round(duration * 2.2)]:
 *
 *     5s → 5-11 words       10s → 10-22 words       15s → 15-33 words
 *
 * 11 and 22 are exactly those upper bounds. Raising them to 12 / 25 would have
 * routed a 12-word script to a 5s take, failed `12 <= 11`, and broken every short
 * video in production — while the credit quote happily charged for it.
 *
 * So this test does not assert the constants. It asserts the property that makes
 * them correct: whatever fitDuration returns, the renderer accepts. Change the
 * thresholds however you like; if the result cannot render, this fails.
 */

import { describe, expect, it } from 'vitest';
import { SimpleSelfieToolInputSchema } from '../tooling/contracts.js';
import {
  chunkScript,
  countWords,
  fitDuration,
  planTakeDurations,
  TAKE_ABSOLUTE_MAX_WORDS,
} from '../take-planner.js';

/** A script of exactly n words, shaped like real speech (no sentence breaks). */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i + 1}`).join(' ');
}

/** The renderer's own band, restated from SimpleSelfieToolInputSchema. */
function band(duration: number): [number, number] {
  return [duration, Math.round(duration * 2.2)];
}

/** Does the real zod contract accept this script at this duration? */
function renderable(script: string, duration: 5 | 10 | 15): boolean {
  return SimpleSelfieToolInputSchema.safeParse({
    character_sheet_url: 'https://example.com/sheet.png',
    duration,
    script,
    aspect_ratio: '9:16',
  }).success;
}

describe('fitDuration produces renderable takes', () => {
  // Below TAKE_MIN_WORDS a take is merged into its neighbour by chunkScript, so
  // the meaningful domain starts at 5.
  const LOWEST_RENDERABLE = 5;

  it('accepts every word count a single take can hold', () => {
    const rejected: Array<{ n: number; duration: number; band: [number, number] }> = [];
    for (let n = LOWEST_RENDERABLE; n <= TAKE_ABSOLUTE_MAX_WORDS; n += 1) {
      const script = words(n);
      const duration = fitDuration(script);
      if (!renderable(script, duration)) {
        rejected.push({ n, duration, band: band(duration) });
      }
    }
    expect(rejected).toEqual([]);
  });

  it('never returns a duration whose lower bound exceeds the word count', () => {
    // The failure mode of raising a threshold is a script too SHORT for its take
    // (dead air); of lowering one, too LONG (rushed). Both are caught above, but
    // state the lower bound separately so a regression names itself.
    for (let n = LOWEST_RENDERABLE; n <= TAKE_ABSOLUTE_MAX_WORDS; n += 1) {
      const duration = fitDuration(words(n));
      expect(n, `${n} words routed to a ${duration}s take, which needs >= ${duration}`).
        toBeGreaterThanOrEqual(duration);
    }
  });

  it('pins the current thresholds so a change is deliberate', () => {
    // Not a correctness assertion — the tests above are. This is a tripwire: if
    // you move a boundary, you must come here and say so, having read why 11 and
    // 22 are the renderer's numbers and not a pricing choice.
    expect(fitDuration(words(11))).toBe(5);
    expect(fitDuration(words(12))).toBe(10);
    expect(fitDuration(words(22))).toBe(10);
    expect(fitDuration(words(23))).toBe(15);
  });

  it('keeps every planned take of a long script renderable', () => {
    // The multi-take path is where a bad threshold would surface as a mid-run
    // failure rather than a rejected submit: earlier takes render and get
    // charged, then one fails validation.
    const long = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of a fairly long monologue.`).join(' ');
    const chunks = chunkScript(long);
    const durations = planTakeDurations(long, 60);

    expect(chunks.length).toBe(durations.length);
    chunks.forEach((chunk, i) => {
      const d = durations[i];
      expect(
        renderable(chunk, d),
        `take ${i + 1}: ${countWords(chunk)} words at ${d}s, band ${band(d).join('-')}`,
      ).toBe(true);
    });
  });
});
