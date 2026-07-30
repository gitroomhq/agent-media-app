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
  it('a 34-word sentence is ONE 15s take (420), not two 10s takes (560)', () => {
    const script = words(34);
    expect(planTakes(script, 15)).toHaveLength(1);
    expect(planTakeDurations(script, 15)).toEqual([15]);
    expect(charge(script)).toBe(420);
  });

  it('a 67-word script does not over-quote', () => {
    // Previously quoted 980 while the worker executed 840.
    expect(charge(words(67))).toBe(840);
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
    // The bound is TAKE_ABSOLUTE_MAX_WORDS (37), not the packing bound (33):
    // merging a sub-minimum tail can legitimately push a chunk to 33 + 4, which is
    // exactly floor(15s x 2.5 words/s). Asserting 33 here would fail on a 34-word
    // script even though it renders correctly.
    for (const s of scripts) {
      for (const c of chunkScript(s)) {
        expect(countWords(c)).toBeLessThanOrEqual(TAKE_ABSOLUTE_MAX_WORDS);
      }
    }
  });

  it('respects the packing bound for every chunk except a tail-merged one', () => {
    for (const s of scripts) {
      const chunks = chunkScript(s);
      // Only the chunk that absorbed a tail may exceed the packing bound, so at
      // most one chunk per script can be over it.
      const over = chunks.filter((c) => countWords(c) > TAKE_MAX_WORDS);
      expect(over.length).toBeLessThanOrEqual(1);
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
