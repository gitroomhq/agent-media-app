// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// make_podcast: the two-actor podcast skill. Validates the user-facing schema,
// the credit quote (must sum the exact per-turn talking takes the worker renders),
// and that the skill is registered as a composed, agent-facing skill.

import { describe, it, expect } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { MakePodcastSkillInputSchema, SKILLS, PODCAST_MAX_TURNS } from '../skills/registry.js';
import { quoteSkillCredits } from '../skills/credit-quotes.js';

describe('make_podcast skill', () => {
  it('is registered as a composed, agent-facing skill', () => {
    const s = SKILLS.make_podcast;
    expect(s).toBeDefined();
    expect(s.workflowType).toBe('makePodcastWorkflow');
    expect(s.primitive).toBe('composed:make_podcast');
    expect(s.agentFacing).toBe(true);
  });

  it('accepts a valid two-speaker script and defaults captions OFF', () => {
    const r = MakePodcastSkillInputSchema.safeParse({
      character_a: 'char_ABCDE12345',
      character_b: 'char_ZYXWV98765',
      script: [
        { speaker: 'A', line: 'Hey welcome back to the show today.' },
        { speaker: 'B', line: 'I am so excited to be here with all of you wonderful people tonight.' },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.aspect_ratio).toBe('9:16');
      expect(r.data.subtitles).toBe(false); // opt-in
    }
  });

  it('rejects the same character on both sides', () => {
    const r = MakePodcastSkillInputSchema.safeParse({
      character_a: 'char_SAME000001',
      character_b: 'char_SAME000001',
      script: [{ speaker: 'A', line: 'this line has five words' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a turn under 5 words (a bare interjection cannot fill a clip)', () => {
    const r = MakePodcastSkillInputSchema.safeParse({
      character_a: 'char_ABCDE12345',
      character_b: 'char_ZYXWV98765',
      script: [
        { speaker: 'A', line: 'Welcome back to the show everyone.' },
        { speaker: 'B', line: 'Exactly.' }, // 1 word → must be rejected
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty script and too many turns', () => {
    expect(
      MakePodcastSkillInputSchema.safeParse({ character_a: 'char_a1', character_b: 'char_b2', script: [] }).success,
    ).toBe(false);
    const many = Array.from({ length: PODCAST_MAX_TURNS + 1 }, (_, k) => ({ speaker: k % 2 ? 'B' : 'A', line: 'line one' }));
    expect(
      MakePodcastSkillInputSchema.safeParse({ character_a: 'char_a1', character_b: 'char_b2', script: many }).success,
    ).toBe(false);
  });

  it('quotes credits = sum of per-turn takes (+ optional captions)', () => {
    const script = [
      { speaker: 'A', line: 'Hey welcome back to the show today.' }, // 7 words → 5s → 140
      { speaker: 'B', line: 'I am so excited to be here with all of you wonderful people tonight.' }, // 14 words → 10s → 280
    ];
    expect(quoteSkillCredits('make_podcast', { script })).toBe(420);
    expect(quoteSkillCredits('make_podcast', { script, subtitles: true })).toBe(435);
  });

  it('quotes a multi-sentence turn on the SAME take plan the worker renders (no under-charge)', () => {
    // The 21/8/14-word 3-sentence turn the review used: the worker groups it into
    // [29, 14] words → one 15s take (420) + one 10s take (280) = 700. The old quote
    // (28-word grouping) said 560 → under-charge → mid-run INSUFFICIENT_CREDITS.
    const w = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    const line = `${w(21)}. ${w(8)}. ${w(14)}.`;
    expect(quoteSkillCredits('make_podcast', { script: [{ speaker: 'A', line }] })).toBe(700);
  });

  it('produces a JSON schema for tool listing without throwing', () => {
    expect(() => zodToJsonSchema(MakePodcastSkillInputSchema, 'make_podcast')).not.toThrow();
  });
});
