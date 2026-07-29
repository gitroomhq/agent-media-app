// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// A12: the quote path and the run path must validate identically (so a quote can
// never accept input the run would reject) and price coherently (invariant 9 —
// the number the user confirms is the number dispatchMakeUgc will deduct).
//
// Both routes validate with the SAME schema (SKILLS[slug].inputSchema) and, for
// make_ugc, price through the SAME decider (decideMakeUgcRoute). These tests pin
// that shared behavior at the pure-module level (no server/DB import).

import { describe, it, expect } from 'vitest';
import { MakeUgcSkillInputSchema } from '../skills/registry.js';
import { quoteSkillCredits } from '../skills/credit-quotes.js';
import { decideMakeUgcRoute } from '../skills/make-ugc-router.js';

describe('quote/run validation parity (A12)', () => {
  it('the shared make_ugc schema rejects invalid input (both routes 400 identically)', () => {
    expect(MakeUgcSkillInputSchema.safeParse({ script: 42 }).success).toBe(false); // wrong type
    expect(MakeUgcSkillInputSchema.safeParse({ script: '' }).success).toBe(false); // min(1)
    expect(MakeUgcSkillInputSchema.safeParse({ script: 'x'.repeat(1201) }).success).toBe(false); // max(1200)
  });

  it('the shared make_ugc schema accepts a valid body', () => {
    expect(
      MakeUgcSkillInputSchema.safeParse({ script: 'Check out this product — you have to try it.' }).success,
    ).toBe(true);
  });
});

describe('quote/route credit coherence (invariant 9)', () => {
  const cases: Array<Record<string, unknown>> = [
    { script: 'Short punchy line about the product.' }, // short -> make_ugc_video
    { script: Array(60).fill('word').join(' ') }, // long -> make_broll_talking_head
    { character: 'char_abc', script: 'Reused character, quick take.' }, // saved char -> make_simple_selfie
  ];

  it('quote(make_ugc) equals the price of the skill it routes to', () => {
    for (const input of cases) {
      const routed = decideMakeUgcRoute(input);
      expect(quoteSkillCredits('make_ugc', input)).toBe(quoteSkillCredits(routed.slug, routed.body));
    }
  });
});
