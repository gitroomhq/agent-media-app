// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// A4 / Route 0: `make_ugc` with a `product_image` routes to the existing
// make_product_in_hands primitive (held/worn, staged in code), needs a holder
// (a saved character), and prices coherently (invariant 9). Pure — no DB import.

import { describe, it, expect } from 'vitest';
import { decideMakeUgcRoute } from '../skills/make-ugc-router.js';
import { MakeUgcSkillInputSchema } from '../skills/registry.js';
import { quoteSkillCredits } from '../skills/credit-quotes.js';

describe('make_ugc Route 0 — product videos', () => {
  it('routes product_image + saved character to make_product_in_hands', () => {
    const { slug, body } = decideMakeUgcRoute({
      product_image: 'https://cdn.example.com/product.jpg',
      character: 'char_abc',
      script: 'This gadget changed my morning routine.',
    });
    expect(slug).toBe('make_product_in_hands');
    expect(body.framing).toBe('close_up');
    expect(body.script).toBe('This gadget changed my morning routine.');
    expect(typeof body.duration).toBe('number');
    expect(body.character_sheet_url).toBeDefined(); // placeholder; dispatch resolves it
  });

  it('product takes precedence over a plain talking head', () => {
    const { slug } = decideMakeUgcRoute({
      product_image: 'https://x/p.png',
      character: 'char_1',
      scene_action: 'shows it to camera',
    });
    expect(slug).toBe('make_product_in_hands');
  });

  it('a non-product call is unaffected (still routes to make_ugc_video)', () => {
    const { slug } = decideMakeUgcRoute({ script: 'Just a quick talking-head take.' });
    expect(slug).toBe('make_ugc_video');
  });

  it('the facade accepts product_image but still requires script or scene_action', () => {
    expect(MakeUgcSkillInputSchema.safeParse({ product_image: 'https://x/p.png', character: 'char_1' }).success).toBe(
      false,
    );
    expect(
      MakeUgcSkillInputSchema.safeParse({
        product_image: 'https://x/p.png',
        character: 'char_1',
        script: 'Try it now — you will love it.',
      }).success,
    ).toBe(true);
  });

  it('quote(make_ugc) for a product equals make_product_in_hands price (invariant 9)', () => {
    const input = { product_image: 'https://x/p.png', character: 'char_1', script: 'Try it now — you will love it.' };
    const routed = decideMakeUgcRoute(input);
    expect(quoteSkillCredits('make_ugc', input)).toBe(quoteSkillCredits(routed.slug, routed.body));
  });
});
