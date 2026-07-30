// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Subtitle pricing must be ONE number across every surface.
//
// /v2/subtitle used to bill a hardcoded 30s placeholder (3 credits/sec = 90) and
// relied on a webhook "reconciliation" that was never implemented, while the
// make_subtitles skill charged a flat 15 — the same operation at 6x apart
// depending on which door the caller came through.

import { describe, it, expect } from 'vitest';
import { quoteV2Credits, V2_GENERATORS } from '../v2/generators.js';

/** SUBTITLES_CREDITS in services/api-v2/src/skills/credit-quotes.ts. */
const SKILL_PATH_CREDITS = 15;

describe('subtitle pricing', () => {
  it('matches the make_subtitles skill price', () => {
    expect(quoteV2Credits('subtitle')).toBe(SKILL_PATH_CREDITS);
  });

  it('is flat — duration cannot change the price', () => {
    const flat = quoteV2Credits('subtitle');
    for (const durationSeconds of [1, 5, 8, 30, 60, 600]) {
      expect(quoteV2Credits('subtitle', { durationSeconds })).toBe(flat);
    }
  });

  it('never reproduces the old 90-credit placeholder', () => {
    expect(quoteV2Credits('subtitle', { durationSeconds: 30 })).not.toBe(90);
  });

  it('is declared one_shot so no caller has to supply a duration', () => {
    expect(V2_GENERATORS.subtitle.pricing?.basis).toBe('one_shot');
  });

  it('stays comfortably above cost (~$0.02 worst case at ~$0.0147/credit)', () => {
    const revenueUsd = quoteV2Credits('subtitle') * 0.0147;
    expect(revenueUsd).toBeGreaterThan(0.02 * 5); // >5x our worst-case cost
  });
});
