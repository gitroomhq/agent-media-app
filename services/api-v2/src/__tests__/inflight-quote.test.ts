// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// quoteInFlightPrimitiveRun prices a user's in-flight standalone primitive runs
// so preflight can reserve their cost (the burst-overdraw fix).

import { describe, it, expect } from 'vitest';
import { quoteInFlightPrimitiveRun } from '../skills/credit-quotes.js';

describe('quoteInFlightPrimitiveRun', () => {
  it('prices video primitives by duration', () => {
    expect(quoteInFlightPrimitiveRun('simple_selfie', { duration: 5 })).toBe(140);
    expect(quoteInFlightPrimitiveRun('simple_selfie', { duration: 10 })).toBe(280);
    expect(quoteInFlightPrimitiveRun('product_in_hands', { duration: 15 })).toBe(420);
    expect(quoteInFlightPrimitiveRun('lip_sync', {})).toBe(280); // default 10s
  });
  it('prices image/caption primitives flat', () => {
    expect(quoteInFlightPrimitiveRun('character_sheet_gpt2', null)).toBe(35);
    expect(quoteInFlightPrimitiveRun('wireframe_gpt2', null)).toBe(35);
    expect(quoteInFlightPrimitiveRun('subtitles_v2', null)).toBe(15);
  });
  it('free/unknown primitives cost 0 (portraits, compose children)', () => {
    expect(quoteInFlightPrimitiveRun('portrait_gpt2', null)).toBe(0);
    expect(quoteInFlightPrimitiveRun('broll_talking_head', null)).toBe(0);
    expect(quoteInFlightPrimitiveRun('whatever', null)).toBe(0);
  });
});
