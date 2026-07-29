// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// make_podcast take planning: flatten ordered A/B turns into <=15s takes and
// count takes per speaker. The chunker MUST guarantee every take lands in
// simpleSelfie's [5,33]-word band (the pre-deploy review caught two ways the old
// greedy chunker escaped it: short interjection turns and 34-37 word run-ons).

import { describe, it, expect } from 'vitest';
import { planPodcastTakes, chunkPodcastTurn, fitDuration } from '../workflows/make-podcast.js';

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('make_podcast take planning', () => {
  it('fitDuration picks the take length by word band', () => {
    expect(fitDuration('one two three')).toBe(5); // 3 words → 5s
    expect(fitDuration(words(15))).toBe(10); // 15 words → 10s
    expect(fitDuration(words(30))).toBe(15); // 30 words → 15s
  });

  it('every chunk lands in the [5,33]-word band for a range of turns', () => {
    const turns = [
      words(5), words(11), words(12), words(22), words(23), words(33), // exact boundaries
      words(34), words(35), words(37), words(66), words(67), words(100), // run-ons (finding 2)
      'Short opener line here today.',
      'A single run-on comma spliced sentence, that just keeps going and going, ' +
        'with no full stops at all, well past thirty three words, so it must be ' +
        'balance split into two valid takes without ever leaving a tiny tail piece here.',
    ];
    for (const t of turns) {
      const chunks = chunkPodcastTurn(t);
      expect(chunks.length).toBeGreaterThan(0);
      for (const c of chunks) {
        const n = wc(c);
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(33);
      }
      // fitDuration of each chunk must itself be a valid take (word count in band).
      for (const c of chunks) {
        const d = fitDuration(c);
        expect(wc(c)).toBeGreaterThanOrEqual(d);
        expect(wc(c)).toBeLessThanOrEqual(Math.round(d * 2.2));
      }
    }
  });

  it('a 34-word run-on splits into two valid takes, never a 34-word chunk', () => {
    const chunks = chunkPodcastTurn(words(34));
    expect(chunks.length).toBe(2);
    expect(chunks.map(wc)).toEqual([17, 17]);
  });

  it('groups the 21/8/14-sentence turn exactly as the credit quote does (29 + 14)', () => {
    const line = `${words(21)}. ${words(8)}. ${words(14)}.`;
    const chunks = chunkPodcastTurn(line);
    expect(chunks.map(wc)).toEqual([29, 14]);
    expect(chunks.map(fitDuration)).toEqual([15, 10]);
  });

  it('flattens A/B turns in order and counts takes per speaker', () => {
    const { takes, perSpeaker } = planPodcastTakes([
      { speaker: 'A', line: 'Short opener line here today.' },
      { speaker: 'B', line: 'A quick little reply here.' },
      { speaker: 'A', line: 'Another A line to keep the talk going.' },
    ]);
    expect(takes.map((t) => t.speaker)).toEqual(['A', 'B', 'A']);
    expect(perSpeaker.A).toBe(2);
    expect(perSpeaker.B).toBe(1);
    for (const t of takes) expect([5, 10, 15]).toContain(t.duration);
  });
});
