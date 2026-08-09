// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Crazy Look: schema validation, registry contract, pricing, and a
 * drift gate that keeps the worker's LOOK_BRIEFS in sync with the
 * schema's V2_LOOK_PRESETS (same split as shot presets: keys in the
 * schema, prompt briefs in the worker — drift here means a preset
 * validates but silently fails at generation time).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CrazyLookSchema,
  V2_LOOK_PRESETS,
  V2_CRAZY_LOOK_DURATIONS,
  V2_GENERATORS,
  V2_GENERATOR_IDS,
  quoteV2Credits,
} from '../v2/index.js';

function accepts(body: Record<string, unknown>): boolean {
  return CrazyLookSchema.safeParse(body).success;
}

function firstError(body: Record<string, unknown>): string | null {
  const r = CrazyLookSchema.safeParse(body);
  return r.success ? null : (r.error.issues[0]?.message ?? 'unknown');
}

const CAPTION = "WAIT there's an app that LOCKS your phone until you PRAY???";
const CHAR = { character_id: 'char_8x2vqpAb12', caption: CAPTION };
const DESC = { description: '21yo woman, long brown wavy hair, argyle cardigan', caption: CAPTION };

// ── Character input shapes (same contract as SelfieSchema) ──────────────────

describe('CrazyLookSchema · character inputs', () => {
  it('accepts character_id + caption', () => {
    expect(accepts(CHAR)).toBe(true);
  });

  it('accepts description + caption (no photo)', () => {
    expect(accepts(DESC)).toBe(true);
  });

  it('accepts description + photo_url + caption', () => {
    expect(accepts({ ...DESC, photo_url: 'https://example.com/me.png' })).toBe(true);
  });

  it('rejects when neither character_id nor description is given', () => {
    expect(accepts({ caption: CAPTION })).toBe(false);
    expect(firstError({ caption: CAPTION })).toMatch(/character_id, OR description/);
  });

  it('rejects character_id combined with description or photo_url', () => {
    expect(accepts({ ...CHAR, description: DESC.description })).toBe(false);
    expect(accepts({ ...CHAR, photo_url: 'https://example.com/me.png' })).toBe(false);
  });

  it('rejects photo_url without description', () => {
    expect(accepts({ character_id: undefined, photo_url: 'https://example.com/me.png', caption: CAPTION })).toBe(false);
  });

  it('rejects malformed character ids', () => {
    expect(accepts({ character_id: 'char_short', caption: CAPTION })).toBe(false);
    expect(accepts({ character_id: 'not-a-char-id', caption: CAPTION })).toBe(false);
  });
});

// ── Caption ─────────────────────────────────────────────────────────────────

describe('CrazyLookSchema · caption', () => {
  it('requires a caption — it IS the content', () => {
    expect(accepts({ character_id: CHAR.character_id })).toBe(false);
  });

  it('rejects a 1-char caption and one over 220 chars', () => {
    expect(accepts({ ...CHAR, caption: 'x' })).toBe(false);
    expect(accepts({ ...CHAR, caption: 'x'.repeat(221) })).toBe(false);
    expect(accepts({ ...CHAR, caption: 'x'.repeat(220) })).toBe(true);
  });

  it('accepts multi-line captions (explicit \\n)', () => {
    expect(accepts({ ...CHAR, caption: 'WAIT\nthere is an app for that' })).toBe(true);
  });
});

// ── Look ────────────────────────────────────────────────────────────────────

describe('CrazyLookSchema · look', () => {
  it('accepts every registered preset', () => {
    for (const look of V2_LOOK_PRESETS) {
      expect(accepts({ ...CHAR, look })).toBe(true);
    }
  });

  it('accepts the custom:<text> escape hatch', () => {
    expect(accepts({ ...CHAR, look: 'custom:slowly raises one eyebrow, then grins' })).toBe(true);
  });

  it('rejects custom: with no real text', () => {
    expect(accepts({ ...CHAR, look: 'custom:' })).toBe(false);
    expect(accepts({ ...CHAR, look: 'custom:ab' })).toBe(false);
  });

  it('rejects unregistered looks', () => {
    expect(accepts({ ...CHAR, look: 'confused-dog' })).toBe(false);
  });

  it('is optional — omitted means the worker picks a random preset', () => {
    expect(accepts(CHAR)).toBe(true);
  });
});

// ── Duration / polish ───────────────────────────────────────────────────────

describe('CrazyLookSchema · duration & polish', () => {
  it('accepts 5 and 10, defaults to 5', () => {
    for (const d of V2_CRAZY_LOOK_DURATIONS) {
      expect(accepts({ ...CHAR, duration: d })).toBe(true);
    }
    const parsed = CrazyLookSchema.parse(CHAR);
    expect(parsed.duration).toBe(5);
  });

  it('rejects selfie-only durations (15) and off-menu values', () => {
    expect(accepts({ ...CHAR, duration: 15 })).toBe(false);
    expect(accepts({ ...CHAR, duration: 8 })).toBe(false);
    expect(accepts({ ...CHAR, duration: 0 })).toBe(false);
  });

  it('accepts the shared polish intensities and rejects junk', () => {
    for (const p of ['off', 'default', 'heavy']) {
      expect(accepts({ ...CHAR, polish: p })).toBe(true);
    }
    expect(accepts({ ...CHAR, polish: 'maximum' })).toBe(false);
  });
});

// ── Registry contract ───────────────────────────────────────────────────────

describe('V2_GENERATORS · crazy_look', () => {
  const def = V2_GENERATORS.crazy_look;

  it('is registered with every surface declared', () => {
    expect(V2_GENERATOR_IDS).toContain('crazy_look');
    expect(def.output).toBe('video_url');
    expect(def.cli?.command).toBe('crazy-look');
    expect(def.mcp?.toolName).toBe('create_crazy_look');
    expect(def.rest).toEqual({ method: 'POST', path: '/v2/crazy-look' });
  });

  it('ships as beta', () => {
    expect(def.status).toBe('beta');
  });

  it('prices per clip: 200 credits @ 5s, 350 @ 10s — cheaper than selfie', () => {
    expect(quoteV2Credits('crazy_look', { durationSeconds: 5 })).toBe(200);
    expect(quoteV2Credits('crazy_look', { durationSeconds: 10 })).toBe(350);
    expect(quoteV2Credits('crazy_look', { durationSeconds: 5 })).toBeLessThan(
      quoteV2Credits('selfie', { durationSeconds: 5 }),
    );
  });
});

// ── Preset drift gate (schema keys ↔ worker briefs) ────────────────────────

describe('V2_LOOK_PRESETS ↔ worker LOOK_BRIEFS drift gate', () => {
  it('has unique, kebab-case keys', () => {
    expect(new Set(V2_LOOK_PRESETS).size).toBe(V2_LOOK_PRESETS.length);
    for (const k of V2_LOOK_PRESETS) {
      expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every schema preset has a brief in the worker pipeline', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const workerSource = readFileSync(
      join(here, '../../../../services/media-worker-v2/src/v2/crazy-look-pipeline.js'),
      'utf8',
    );
    for (const key of V2_LOOK_PRESETS) {
      expect(workerSource, `worker LOOK_BRIEFS is missing preset "${key}"`).toContain(`'${key}':`);
    }
  });
});
