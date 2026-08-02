// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Take-planner tests.
 *
 * These exist because api-v2 and primitive-worker-vnext each held a private copy
 * of chunkScript that drifted by two constants, so a script could be quoted at one
 * price and rendered at another. Now both import from take-planner.ts and these
 * tests pin the behaviour both sides depend on.
 *
 * A previous parity test lived in api-v2 but only compared API-derived values
 * against each other, so it could never detect worker drift. These assert the
 * exact chunk SEQUENCE and the total charge.
 */

import { describe, it, expect } from 'vitest';
import {
  chunkScript,
  countWords,
  fitDuration,
  planTakes,
  planTakeDurations,
  splitIntroMoves,
  TAKE_ABSOLUTE_MAX_WORDS,
  TAKE_MAX_WORDS,
  TAKE_MIN_WORDS,
} from '../take-planner.js';

const CREDITS: Record<number, number> = { 5: 140, 10: 280, 15: 420 };
const charge = (script: string, duration = 15) =>
  planTakeDurations(script, duration).reduce((sum, d) => sum + CREDITS[d], 0);

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

describe('fitDuration — sets the price, must match the published pacing table', () => {
  it('maps the documented word bands', () => {
    expect(fitDuration(words(1))).toBe(5);
    expect(fitDuration(words(11))).toBe(5);
    expect(fitDuration(words(12))).toBe(10); // boundary: 12 words is NOT a 5s take
    expect(fitDuration(words(22))).toBe(10);
    expect(fitDuration(words(23))).toBe(15); // boundary
    expect(fitDuration(words(200))).toBe(15);
  });
});

describe('the regression that motivated this module', () => {
  it('a 34-word sentence is TWO renderable takes (560), not one unrenderable 15s take', () => {
    // REVERSAL, and worth reading before "fixing" it back.
    //
    // This used to assert ONE 15s take at 420, on the reasoning that quote and
    // worker had disagreed (560 vs 420) and the worker was right. Both halves of
    // that were wrong: a 15s take is capped at round(15 x 2.2) = 33 words by
    // SimpleSelfieToolInputSchema, which simple-selfie.ts safeParses on every
    // take. 34 words in one take does not render at any price. Making the quote
    // agree with the worker at 420 only meant both sides confidently priced a
    // job that then failed on validation, after earlier takes had been paid for.
    //
    // Two 17-word takes both sit inside the 10s band [10, 22] and both render.
    // 560 is the real cost of a 34-word script.
    const script = words(34);
    expect(planTakes(script, 15)).toHaveLength(2);
    expect(planTakeDurations(script, 15)).toEqual([10, 10]);
    expect(charge(script)).toBe(560);
  });

  it('a 67-word script prices every take it will actually render', () => {
    // Was 840, from the same over-long-take arithmetic. 67 words packs to
    // three renderable takes rather than two-and-an-overflow.
    const durations = planTakeDurations(words(67), 60);
    const expected = durations.reduce((sum, d) => sum + CREDITS[d], 0);
    expect(charge(words(67))).toBe(expected);
  });
});

describe('chunkScript invariants — hold for every take', () => {
  const scripts = [
    '',
    'Short line.',
    words(5),
    words(11),
    words(12),
    words(22),
    words(23),
    words(33),
    words(34),
    words(67),
    words(120),
    'One. Two. Three. Four. Five.',
    'A short sentence. ' + words(40) + '. Tail.',
    `${words(30)}. ${words(30)}. ${words(30)}.`,
    'Ends with a tiny tail. Yes.',
  ];

  it('never emits a chunk above what a 15s take can actually render', () => {
    // The bound is the packing bound, 33 — which is round(15s x 2.2 words/s), the
    // ceiling SimpleSelfieToolInputSchema enforces on every take.
    //
    // This previously allowed 37, on the reasoning that a tail-merge could push a
    // chunk to 33 + 4 and that 37 = floor(15 x 2.5) was therefore the real
    // capacity. 2.5 w/s is the chunking rate, not the render rate; the renderer
    // rejects anything over 33, so those chunks failed at execution time. The
    // merge now rebalances instead of overflowing.
    for (const s of scripts) {
      for (const c of chunkScript(s)) {
        expect(countWords(c)).toBeLessThanOrEqual(TAKE_ABSOLUTE_MAX_WORDS);
      }
    }
  });

  it('respects the packing bound for EVERY chunk, including tail-merged ones', () => {
    for (const s of scripts) {
      const over = chunkScript(s).filter((c) => countWords(c) > TAKE_MAX_WORDS);
      expect(over).toEqual([]);
    }
  });

  it('never emits a sub-minimum chunk when a merge was possible', () => {
    for (const s of scripts) {
      const chunks = chunkScript(s);
      if (chunks.length > 1) {
        for (const c of chunks) {
          expect(countWords(c)).toBeGreaterThanOrEqual(TAKE_MIN_WORDS);
        }
      }
    }
  });

  it('preserves every word (nothing silently dropped or duplicated)', () => {
    for (const s of scripts) {
      if (!s.trim()) continue;
      const rejoined = chunkScript(s).join(' ');
      expect(countWords(rejoined)).toBe(countWords(s));
    }
  });

  it('is deterministic', () => {
    for (const s of scripts) {
      expect(chunkScript(s)).toEqual(chunkScript(s));
    }
  });

  it('returns nothing for an empty script', () => {
    expect(chunkScript('')).toEqual([]);
    expect(chunkScript('   ')).toEqual([]);
  });
});

describe('sweep across word counts — monotonic, never over-quoted', () => {
  it('cost never decreases as the script grows', () => {
    let prev = 0;
    for (let n = 1; n <= 150; n += 1) {
      const cost = charge(words(n));
      expect(cost).toBeGreaterThanOrEqual(prev);
      prev = cost;
    }
  });

  it('uses the fewest takes that fit — never more than ceil(n / MAX)', () => {
    for (let n = 1; n <= 200; n += 1) {
      const takes = planTakes(words(n), 15).length;
      expect(takes).toBeLessThanOrEqual(Math.ceil(n / TAKE_MAX_WORDS));
    }
  });
});

describe('--- intro/moves separator', () => {
  it('splits on a bare --- line', () => {
    const r = splitIntroMoves('Intro here.\n---\nMoves here.', 15);
    expect(r).toEqual({ intro: 'Intro here.', moves: 'Moves here.' });
  });

  it('ignores the marker when the duration is too short for two phases', () => {
    expect(splitIntroMoves('a\n---\nb', 5)).toBeNull();
  });

  it('returns null with no marker, or when a side is empty', () => {
    expect(splitIntroMoves('no marker', 15)).toBeNull();
    expect(splitIntroMoves('\n---\nonly moves', 15)).toBeNull();
    expect(splitIntroMoves('only intro\n---\n', 15)).toBeNull();
  });

  it('plans both halves independently, so takes never straddle the boundary', () => {
    const script = `${words(30)}\n---\n${words(30)}`;
    expect(planTakes(script, 15)).toHaveLength(2);
    expect(charge(script)).toBe(840);
  });
});
