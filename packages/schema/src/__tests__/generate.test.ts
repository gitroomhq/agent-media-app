// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import {
  GenerateAudioSchema,
  GenerateImageSchema,
  GenerateVideoSchema,
  V2_DEFAULT_MODEL,
  V2_MODELS,
  V2_VOICES,
  liveModelIds,
  quoteAny,
  quoteGenerate,
} from '../v2/index.js';

describe('loose surface: schemas', () => {
  it('defaults come from the catalog and are live', () => {
    for (const [kind, id] of Object.entries(V2_DEFAULT_MODEL)) {
      expect(V2_MODELS[id]?.status, `${kind} default ${id}`).toBe('live');
      expect(V2_MODELS[id]?.kind).toBe(kind);
    }
    expect(V2_DEFAULT_MODEL.video).toBe('seedance-2.0');
  });

  it('accepts a minimal video call and fills defaults', () => {
    const v = GenerateVideoSchema.parse({ prompt: 'a woman holds a serum bottle and says "this saved my skin"' });
    expect(v.seconds).toBe(5);
    expect(v.aspect).toBe('9:16');
    expect(v.audio).toBe(true);
    expect(v.model).toBeUndefined();
  });

  it('rejects a candidate model by name and lists the live ones', () => {
    const r = GenerateVideoSchema.safeParse({ prompt: 'x'.repeat(10), model: 'kling-o3' });
    expect(r.success).toBe(false);
    const msg = r.success ? '' : r.error.issues.map((i) => i.message).join('\n');
    expect(msg).toMatch(/not-live video model "kling-o3"/);
    for (const id of liveModelIds('video')) expect(msg).toContain(id);
  });

  it('rejects a model of the wrong kind', () => {
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', model: 'seedance-2.0' }).success).toBe(false);
  });

  it('enforces the model limits, not a global guess', () => {
    expect(GenerateVideoSchema.safeParse({ prompt: 'x'.repeat(10), seconds: 15 }).success).toBe(true);
    expect(GenerateVideoSchema.safeParse({ prompt: 'x'.repeat(10), seconds: 16 }).success).toBe(false);
    expect(GenerateVideoSchema.safeParse({ prompt: 'x'.repeat(10), seconds: 3 }).success).toBe(false);
  });

  it('refs must be https', () => {
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: ['http://x.com/a.png'] }).success).toBe(false);
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: ['data:image/png;base64,AAAA'] }).success).toBe(false);
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: ['https://x.com/a.png'] }).success).toBe(true);
  });

  it('is strict: unknown fields fail loudly instead of being ignored', () => {
    expect(GenerateVideoSchema.safeParse({ prompt: 'x'.repeat(10), engine: 'seedance-2.5' }).success).toBe(false);
  });

  it('audio voice names map to real ElevenLabs ids', () => {
    for (const v of Object.values(V2_VOICES)) expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(GenerateAudioSchema.parse({ text: 'hi' }).voice).toBe('sarah');
  });
});

describe('loose surface: credit maths', () => {
  it('video: seconds x catalog per-second, 2.5 is ~3x', () => {
    const v20 = quoteGenerate('video', GenerateVideoSchema.parse({ prompt: 'x'.repeat(10), seconds: 5 }));
    const v25 = quoteGenerate('video', GenerateVideoSchema.parse({ prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' }));
    expect(v20.credits).toBe(5 * V2_MODELS['seedance-2.0'].credits!.perUnit);
    expect(v25.credits).toBe(5 * V2_MODELS['seedance-2.5'].credits!.perUnit);
    expect(v25.credits / v20.credits).toBeGreaterThan(3);
    expect(v20.breakdown).toContain('seedance-2.0');
  });

  it('image: one image per call at the catalog price', () => {
    const q = quoteGenerate('image', GenerateImageSchema.parse({ prompt: 'portrait' }));
    expect(q.credits).toBe(V2_MODELS['gpt-image-2'].credits!.perUnit);
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', n: 3 }).success).toBe(false);
    expect(Number.isInteger(q.credits)).toBe(true);
  });

  it('audio: per character, total rounded up, never 0', () => {
    expect(quoteGenerate('audio', GenerateAudioSchema.parse({ text: 'a' })).credits).toBe(1);
    expect(quoteGenerate('audio', GenerateAudioSchema.parse({ text: 'a'.repeat(250) })).credits).toBe(3);
    expect(quoteGenerate('audio', GenerateAudioSchema.parse({ text: 'a'.repeat(1000) })).credits).toBe(10);
  });

  // The floor is 3x cost (≈67% margin): seedance-2.0 is exactly 3x
  // ($0.30 charged vs $0.10 paid) and that price is locked by the
  // V2_GENERATORS parity test, so a 70% floor would be a lie here.
  it('every live model charges at least 3x its provider cost standalone', () => {
    for (const m of Object.values(V2_MODELS).filter((m) => m.status === 'live')) {
      const c = m.credits!;
      // usd per catalog unit charged vs paid
      const charged = c.perUnit * 0.01;
      const paid = m.cost.unit === c.unit ? m.cost.usd : NaN;
      expect(Number.isNaN(paid), `${m.id}: cost unit ${m.cost.unit} vs credit unit ${c.unit}`).toBe(false);
      expect(charged, `${m.id} charges ${charged} vs cost ${paid}`).toBeGreaterThanOrEqual(paid * 3 - 1e-9);
    }
  });

  it('quoteAny returns issues for bad input and a quote for good input', () => {
    const bad = quoteAny('video', { prompt: 'x'.repeat(10), model: 'sora-2' });
    expect(bad.ok).toBe(false);
    const good = quoteAny('video', { prompt: 'x'.repeat(10), seconds: 8 });
    expect(good.ok && good.quote.credits).toBe(240);
  });
});
