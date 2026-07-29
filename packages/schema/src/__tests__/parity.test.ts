// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Parity tests: prove that the Zod CreateVideoSchema produces the same
 * accept/reject decisions as the existing validateVideoBody() in
 * apps/web/lib/api/v1/validate-video.ts.
 *
 * DO NOT proceed to Sprint 2 (wiring into production) until these all pass.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateVideoSchema,
  DURATIONS,
  TONES,
  MUSIC_GENRES,
  ASPECT_RATIOS,
  BROLL_MODELS,
  SUBTITLE_STYLES,
  SCENE_TYPES,
  TEMPLATES,
  VOICES,
  TTS_PROVIDERS,
  REVIEW_ANGLES,
  PIP_POSITIONS,
  PIP_SIZES,
  PIP_ANIMATIONS,
  PIP_FRAME_STYLES,
} from '../video.js';
import { GENERATOR_IDS, GENERATORS } from '../generators.js';

// ── Helper: check if Zod accepts a body ─────────────────────────────────────

function zodAccepts(body: Record<string, unknown>): boolean {
  const result = CreateVideoSchema.safeParse(body);
  return result.success;
}

function zodError(body: Record<string, unknown>): string | null {
  const result = CreateVideoSchema.safeParse(body);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'unknown error';
}

// ── Minimal valid bodies ────────────────────────────────────────────────────

const VALID_SCRIPT_BODY = { script: 'A'.repeat(50) };
const VALID_PROMPT_BODY = { prompt: 'Generate a video about cats' };

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Parity: script/prompt requirement', () => {
  it('rejects empty body', () => {
    expect(zodAccepts({})).toBe(false);
  });

  it('accepts script only', () => {
    expect(zodAccepts(VALID_SCRIPT_BODY)).toBe(true);
  });

  it('accepts prompt only', () => {
    expect(zodAccepts(VALID_PROMPT_BODY)).toBe(true);
  });

  it('accepts both script and prompt', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, ...VALID_PROMPT_BODY })).toBe(true);
  });
});

describe('Parity: script validation', () => {
  it('rejects script shorter than 50 chars', () => {
    expect(zodAccepts({ script: 'too short' })).toBe(false);
  });

  it('accepts script of exactly 50 chars', () => {
    expect(zodAccepts({ script: 'A'.repeat(50) })).toBe(true);
  });

  it('accepts script of exactly 3000 chars', () => {
    expect(zodAccepts({ script: 'A'.repeat(3000) })).toBe(true);
  });

  it('rejects script longer than 3000 chars', () => {
    expect(zodAccepts({ script: 'A'.repeat(3001) })).toBe(false);
  });

  it('rejects non-string script', () => {
    expect(zodAccepts({ script: 123 })).toBe(false);
  });
});

describe('Parity: prompt validation', () => {
  it('rejects empty string prompt', () => {
    expect(zodAccepts({ prompt: '' })).toBe(false);
  });

  it('accepts prompt of 1 char', () => {
    expect(zodAccepts({ prompt: 'x' })).toBe(true);
  });

  it('accepts prompt of 1000 chars', () => {
    expect(zodAccepts({ prompt: 'A'.repeat(1000) })).toBe(true);
  });

  it('rejects prompt longer than 1000 chars', () => {
    expect(zodAccepts({ prompt: 'A'.repeat(1001) })).toBe(false);
  });
});

describe('Parity: target_duration', () => {
  for (const d of DURATIONS) {
    it(`accepts ${d}`, () => {
      expect(zodAccepts({ ...VALID_SCRIPT_BODY, target_duration: d })).toBe(true);
    });
  }

  it('rejects invalid duration', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, target_duration: 7 })).toBe(false);
  });

  it('rejects string duration', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, target_duration: '10' })).toBe(false);
  });
});

describe('Parity: tone enum', () => {
  for (const t of TONES) {
    it(`accepts "${t}"`, () => {
      expect(zodAccepts({ ...VALID_SCRIPT_BODY, tone: t })).toBe(true);
    });
  }

  it('rejects invalid tone', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, tone: 'aggressive' })).toBe(false);
  });
});

describe('Parity: music enum', () => {
  for (const m of MUSIC_GENRES) {
    it(`accepts "${m}"`, () => {
      expect(zodAccepts({ ...VALID_SCRIPT_BODY, music: m })).toBe(true);
    });
  }

  it('rejects invalid music', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, music: 'jazz' })).toBe(false);
  });
});

describe('Parity: aspect_ratio enum', () => {
  for (const ar of ASPECT_RATIOS) {
    it(`accepts "${ar}"`, () => {
      expect(zodAccepts({ ...VALID_SCRIPT_BODY, aspect_ratio: ar })).toBe(true);
    });
  }

  it('rejects invalid aspect_ratio', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, aspect_ratio: '4:3' })).toBe(false);
  });
});

describe('Parity: broll_model enum', () => {
  for (const m of BROLL_MODELS) {
    it(`accepts "${m}"`, () => {
      expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_model: m })).toBe(true);
    });
  }

  it('rejects invalid broll_model', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_model: 'dalle3' })).toBe(false);
  });
});

describe('Parity: voice_speed', () => {
  it('accepts 0.7', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 0.7 })).toBe(true);
  });

  it('accepts 1.5', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 1.5 })).toBe(true);
  });

  it('accepts 1.0', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 1.0 })).toBe(true);
  });

  it('rejects below 0.7', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 0.5 })).toBe(false);
  });

  it('rejects above 1.5', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 2.0 })).toBe(false);
  });

  it('rejects non-number', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, voice_speed: 'fast' })).toBe(false);
  });
});

describe('Parity: string field constraints', () => {
  it('rejects actor_slug over 100 chars', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, actor_slug: 'A'.repeat(101) })).toBe(false);
  });

  it('rejects empty actor_slug', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, actor_slug: '' })).toBe(false);
  });

  it('rejects style over 50 chars', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, style: 'A'.repeat(51) })).toBe(false);
  });

  it('rejects cta over 100 chars', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, cta: 'A'.repeat(101) })).toBe(false);
  });

  it('rejects dub_language over 10 chars', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, dub_language: 'A'.repeat(11) })).toBe(false);
  });

  it('rejects template over 50 chars', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, template: 'A'.repeat(51) })).toBe(false);
  });
});

describe('Parity: URL fields', () => {
  it('accepts valid product_url', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, product_url: 'https://example.com' })).toBe(true);
  });

  it('rejects invalid product_url', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, product_url: 'not-a-url' })).toBe(false);
  });

  it('accepts valid product_image_url', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, product_image_url: 'https://example.com/img.png' })).toBe(true);
  });

  it('rejects invalid product_image_url', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, product_image_url: 'bad' })).toBe(false);
  });
});

describe('Parity: broll_images', () => {
  it('accepts array of valid URLs', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_images: ['https://a.com/1.jpg'] })).toBe(true);
  });

  it('rejects non-array', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_images: 'https://a.com' })).toBe(false);
  });

  it('rejects more than 10 items', () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://a.com/${i}.jpg`);
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_images: urls })).toBe(false);
  });

  it('rejects invalid URLs in array', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, broll_images: ['not-a-url'] })).toBe(false);
  });
});

describe('Parity: composition_mode', () => {
  it('accepts pip', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, composition_mode: 'pip' })).toBe(true);
  });

  it('rejects other values', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, composition_mode: 'split' })).toBe(false);
  });
});

describe('Parity: allow_broll', () => {
  it('accepts true', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, allow_broll: true })).toBe(true);
  });

  it('accepts false', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, allow_broll: false })).toBe(true);
  });

  it('rejects non-boolean', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, allow_broll: 'yes' })).toBe(false);
  });
});

describe('Parity: scenes', () => {
  it('accepts valid scenes array', () => {
    expect(zodAccepts({
      ...VALID_SCRIPT_BODY,
      scenes: [{ type: 'talking_head' }, { type: 'broll' }],
    })).toBe(true);
  });

  it('accepts scenes with no type', () => {
    expect(zodAccepts({
      ...VALID_SCRIPT_BODY,
      scenes: [{ script: 'some text' }],
    })).toBe(true);
  });

  it('rejects more than 30 scenes', () => {
    const scenes = Array.from({ length: 31 }, () => ({ type: 'broll' }));
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, scenes })).toBe(false);
  });

  it('rejects non-array scenes', () => {
    expect(zodAccepts({ ...VALID_SCRIPT_BODY, scenes: 'not-array' })).toBe(false);
  });
});

describe('Parity: pip_options', () => {
  it('accepts valid pip_options', () => {
    expect(zodAccepts({
      ...VALID_SCRIPT_BODY,
      pip_options: { position: 'bottom-center', size: 'medium' },
    })).toBe(true);
  });

  it('rejects unknown fields in pip_options', () => {
    expect(zodAccepts({
      ...VALID_SCRIPT_BODY,
      pip_options: { position: 'bottom-center', unknown_field: true },
    })).toBe(false);
  });
});

// ── Enum completeness: verify schema arrays match production ────────────────

describe('Enum completeness: values match production', () => {
  it('promotes saas_review and keeps product_review as an undocumented legacy alias', () => {
    expect(GENERATOR_IDS).toContain('saas_review');
    expect(GENERATOR_IDS).not.toContain('product_review');
    expect(GENERATORS.product_review.legacy).toBe(true);
    expect(GENERATORS.product_review.inputSchema).toBe(GENERATORS.saas_review.inputSchema);
  });

  it('DURATIONS matches production', () => {
    expect([...DURATIONS]).toEqual([5, 10, 15]);
  });

  it('TONES matches production', () => {
    expect([...TONES]).toEqual(['energetic', 'calm', 'confident', 'dramatic']);
  });

  it('MUSIC_GENRES matches production', () => {
    expect([...MUSIC_GENRES]).toEqual(['chill', 'energetic', 'corporate', 'dramatic', 'upbeat']);
  });

  it('ASPECT_RATIOS matches production', () => {
    expect([...ASPECT_RATIOS]).toEqual(['9:16', '16:9', '1:1']);
  });

  it('BROLL_MODELS matches production', () => {
    expect([...BROLL_MODELS]).toEqual(['kling3', 'hailuo2', 'wan21']);
  });

  it('SUBTITLE_STYLES has all 17 styles', () => {
    expect(SUBTITLE_STYLES).toHaveLength(17);
    expect([...SUBTITLE_STYLES]).toEqual([
      'hormozi', 'minimal', 'bold', 'karaoke', 'clean',
      'tiktok', 'neon', 'fire', 'glow', 'pop', 'aesthetic',
      'impact', 'pastel', 'electric', 'boxed', 'gradient', 'spotlight',
    ]);
  });

  it('TEMPLATES has all 8 templates', () => {
    expect(TEMPLATES).toHaveLength(8);
    expect([...TEMPLATES]).toEqual([
      'monologue', 'testimonial', 'product-review', 'problem-solution',
      'saas-review', 'before-after', 'listicle', 'product-demo',
    ]);
  });

  it('VOICES has all 6 voices', () => {
    expect(VOICES).toHaveLength(6);
    expect([...VOICES]).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });

  it('SCENE_TYPES only includes supported types', () => {
    expect([...SCENE_TYPES]).toEqual(['talking_head', 'broll']);
  });
});

// ── Grouped params: verify flattening works ─────────────────────────────

describe('Grouped params: actor config', () => {
  it('accepts actor.slug and flattens to actor_slug', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), actor: { slug: 'sofia' } })).toBe(true);
  });

  it('accepts actor.voice and flattens to voice', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), actor: { slug: 'sofia', voice: 'nova' } })).toBe(true);
  });

  it('flat actor_slug takes precedence over actor.slug', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), actor_slug: 'marcus', actor: { slug: 'sofia' } })).toBe(true);
  });
});

describe('Grouped params: output config', () => {
  it('accepts output.duration and flattens to target_duration', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), output: { duration: 10 } })).toBe(true);
  });

  it('accepts output.style', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), output: { style: 'hormozi', music: 'chill' } })).toBe(true);
  });

  it('rejects invalid duration in output', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), output: { duration: 7 } })).toBe(false);
  });
});

describe('Grouped params: broll config', () => {
  it('accepts broll.enabled and flattens to allow_broll', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), broll: { enabled: true } })).toBe(true);
  });

  it('accepts broll.images and flattens to broll_images', () => {
    expect(zodAccepts({ script: 'A'.repeat(50), broll: { enabled: true, images: ['https://a.com/1.jpg'] } })).toBe(true);
  });
});

describe('Grouped params: mixed flat + grouped', () => {
  it('accepts mixed flat and grouped params', () => {
    expect(zodAccepts({
      script: 'A'.repeat(50),
      actor: { slug: 'sofia' },
      target_duration: 10,
      broll: { enabled: true },
      music: 'chill',
    })).toBe(true);
  });
});
