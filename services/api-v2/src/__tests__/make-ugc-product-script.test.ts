// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * make_ugc + product_image: the script word-count contract.
 *
 * An external agent session spent ten turns re-encoding a product image
 * because every submit returned `invalid_input`. The image was never the
 * problem: the product route caps the script, and one of its bounds was
 * impossible to satisfy at all.
 */

import { describe, expect, it } from 'vitest';
import { MakeProductInHandsSkillInputSchema } from '../skills/registry.js';
import { fitDuration } from '@agentmedia/schema';

const base = {
  character_sheet_url: 'https://example.com/sheet.png',
  product_image_url: 'https://example.com/product.png',
};

const words = (n: number) => Array(n).fill('great').join(' ');
const accepts = (script: string, duration?: number) =>
  MakeProductInHandsSkillInputSchema.safeParse({
    ...base,
    script,
    duration: duration ?? fitDuration(script),
  }).success;

describe('product video script bounds', () => {
  it('accepts a SHORT script — the old lower bound made 1-4 words impossible', () => {
    // fitDuration puts <=11 words at 5s, then the old rule demanded >= 5
    // words, so a 1-4 word script could not validate at ANY duration.
    for (const n of [1, 2, 3, 4]) {
      expect(accepts(words(n)), `${n} words must be accepted`).toBe(true);
    }
  });

  it('still accepts the ordinary range', () => {
    for (const n of [8, 12, 20, 30, 33]) {
      expect(accepts(words(n)), `${n} words`).toBe(true);
    }
  });

  it('rejects a script that cannot fit one 15s take', () => {
    for (const n of [40, 50, 80]) {
      expect(accepts(words(n)), `${n} words must be rejected`).toBe(false);
    }
  });

  it('says WHY and HOW to fix it — the message is the agent\'s only clue', () => {
    const r = MakeProductInHandsSkillInputSchema.safeParse({
      ...base,
      script: words(50),
      duration: fitDuration(words(50)),
    });
    expect(r.success).toBe(false);
    const msg = r.success ? '' : r.error.issues.map((i) => i.message).join(' ');
    expect(msg).toMatch(/too long/i);
    expect(msg).toMatch(/SINGLE take/i);
    expect(msg).toMatch(/drop product_image/i);
  });
});
