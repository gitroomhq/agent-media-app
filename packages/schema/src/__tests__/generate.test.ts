// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import {
  EDIT_INTENT_RE,
  GenerateAudioSchema,
  GenerateImageSchema,
  GenerateVideoSchema,
  V2_DEFAULT_MODEL,
  V2_MODELS,
  V2_VOICES,
  deriveVideoMode,
  liveModelIds,
  pickAuto,
  quoteAny,
  quoteGenerate,
  resolveVideoRequest,
} from '../v2/index.js';

const IMG = 'https://x.com/a.png';
const IMG2 = 'https://x.com/b.png';
const MP4 = 'https://x.com/c.mp4';
const WAV = 'https://x.com/d.wav';
const P = 'a woman holds a serum bottle and says "this saved my skin"';

const parse = (input: object) => GenerateVideoSchema.safeParse(input);
const messages = (input: object) => {
  const r = parse(input);
  return r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
};

describe('loose surface: schemas', () => {
  it('defaults come from the catalog and are live', () => {
    for (const [kind, id] of Object.entries(V2_DEFAULT_MODEL)) {
      expect(V2_MODELS[id]?.status, `${kind} default ${id}`).toBe('live');
      expect(V2_MODELS[id]?.kind).toBe(kind);
    }
    expect(V2_DEFAULT_MODEL.video).toBe('seedance-2.0');
  });

  it('accepts a minimal video call and fills defaults', () => {
    const v = GenerateVideoSchema.parse({ prompt: P });
    expect(v.seconds).toBe(5);
    expect(v.aspect).toBeUndefined();
    expect(v.quality).toBe('720p');
    expect(v.audio).toBe(true);
    expect(v.model).toBeUndefined();
    const r = resolveVideoRequest(v);
    expect(r).toMatchObject({ model: 'seedance-2.0', mode: 'text', providerModel: 'seedance-2.0-text-to-video', aspect: '9:16', quality: '720p' });
  });

  it('rejects a candidate model by name and lists the live ones', () => {
    const msg = messages({ prompt: P, model: 'kling-o3' });
    expect(msg).toMatch(/not-live video model "kling-o3"/);
    for (const id of liveModelIds('video')) expect(msg).toContain(id);
  });

  it('rejects a model of the wrong kind', () => {
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', model: 'seedance-2.0' }).success).toBe(false);
  });

  it('enforces the model limits, not a global guess', () => {
    expect(parse({ prompt: P, seconds: 15 }).success).toBe(true);
    expect(messages({ prompt: P, seconds: 16 })).toMatch(/4 to 15 seconds/);
    expect(messages({ prompt: P, seconds: 3 })).toMatch(/4 to 15 seconds/);
  });

  it('refs must be https', () => {
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: ['http://x.com/a.png'] }).success).toBe(false);
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: ['data:image/png;base64,AAAA'] }).success).toBe(false);
    expect(GenerateImageSchema.safeParse({ prompt: 'portrait', refs: [IMG] }).success).toBe(true);
  });

  it('is strict: unknown fields fail loudly instead of being ignored', () => {
    expect(parse({ prompt: P, engine: 'seedance-2.5' }).success).toBe(false);
  });

  it('audio voice names map to real ElevenLabs ids', () => {
    for (const v of Object.values(V2_VOICES)) expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(GenerateAudioSchema.parse({ text: 'hi' }).voice).toBe('sarah');
  });
});

describe('video modes (from the provider specs)', () => {
  it('derives the mode from the inputs', () => {
    expect(deriveVideoMode({})).toBe('text');
    expect(deriveVideoMode({ first_frame: IMG })).toBe('image');
    expect(deriveVideoMode({ refs: [IMG] })).toBe('reference');
    expect(deriveVideoMode({ video_refs: [MP4] })).toBe('reference');
    expect(deriveVideoMode({ audio_refs: [WAV], refs: [IMG] })).toBe('reference');
  });

  it('image-to-video routes to the image provider id with adaptive aspect by default', () => {
    for (const model of ['seedance-2.0', 'seedance-2.5']) {
      const v = GenerateVideoSchema.parse({ prompt: P, model, first_frame: IMG, last_frame: IMG2 });
      const r = resolveVideoRequest(v);
      expect(r.mode).toBe('image');
      expect(r.providerModel).toBe(`${model}-image-to-video`);
      expect(r.aspect).toBe('adaptive');
    }
  });

  it('seedance-2.5 image mode refuses a fixed aspect; 2.0 accepts one', () => {
    expect(messages({ prompt: P, model: 'seedance-2.5', first_frame: IMG, aspect: '9:16' })).toMatch(/only supports aspect "adaptive"/);
    expect(parse({ prompt: P, model: 'seedance-2.0', first_frame: IMG, aspect: '9:16' }).success).toBe(true);
  });

  it('frames and references cannot be mixed on Seedance', () => {
    expect(messages({ prompt: P, first_frame: IMG, refs: [IMG2] })).toMatch(/frames only/);
    expect(messages({ prompt: P, last_frame: IMG })).toMatch(/last_frame needs first_frame/);
  });

  it('reference mode routes to the reference provider id and enforces the counts', () => {
    const v = GenerateVideoSchema.parse({ prompt: '@image1 talks to camera', refs: [IMG], video_refs: [MP4], audio_refs: [WAV] });
    expect(resolveVideoRequest(v).providerModel).toBe('seedance-2.0-reference-to-video');
    expect(messages({ prompt: P, refs: Array(10).fill(IMG) })).toMatch(/up to 9 image references/);
    expect(parse({ prompt: P, model: 'seedance-2.5', refs: Array(10).fill(IMG) }).success).toBe(true);
    expect(messages({ prompt: P, video_refs: Array(4).fill(MP4) })).toMatch(/up to 3 reference clips/);
  });

  it('audio alone is refused on 2.0 and accepted on 2.5 (spec)', () => {
    expect(messages({ prompt: P, audio_refs: [WAV] })).toMatch(/needs an image or video reference/);
    expect(parse({ prompt: P, model: 'seedance-2.5', audio_refs: [WAV] }).success).toBe(true);
  });

  it('edit or extend wording with a reference clip is refused at submit, not minutes later', () => {
    expect(EDIT_INTENT_RE.test('replace the bottle in @video1 with a jar')).toBe(true);
    expect(EDIT_INTENT_RE.test('she removes the cap and smiles')).toBe(false);
    expect(messages({ prompt: 'extend the video with her walking away', video_refs: [MP4] })).toMatch(/EDIT\/EXTEND/);
    expect(parse({ prompt: 'extend the video with her walking away' }).success).toBe(true); // no clip, no reclassification
  });

  it('all seven aspects and three qualities are accepted in text mode', () => {
    for (const aspect of ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9', 'adaptive']) expect(parse({ prompt: P, aspect }).success, aspect).toBe(true);
    for (const quality of ['480p', '720p', '1080p']) expect(parse({ prompt: P, quality }).success, quality).toBe(true);
    expect(parse({ prompt: P, quality: '4k' }).success).toBe(false);
  });

  it('seed is refused: no live video model takes one', () => {
    expect(messages({ prompt: P, seed: 7 })).toMatch(/does not accept a seed/);
  });
});

describe('loose surface: credit maths', () => {
  it('video: seconds x the per-quality rate; 2.5 is about 3x', () => {
    const v20 = quoteGenerate('video', GenerateVideoSchema.parse({ prompt: P, seconds: 5 }));
    const v25 = quoteGenerate('video', GenerateVideoSchema.parse({ prompt: P, seconds: 5, model: 'seedance-2.5' }));
    expect(v20.credits).toBe(5 * V2_MODELS['seedance-2.0'].credits!.perUnit);
    expect(v25.credits).toBe(5 * V2_MODELS['seedance-2.5'].credits!.perUnit);
    expect(v25.credits / v20.credits).toBeGreaterThan(3);
    expect(v20.breakdown).toContain('seedance-2.0');
    expect(v20.mode).toBe('text');
  });

  it('video: quality changes the rate', () => {
    const q = (quality: string) => quoteGenerate('video', GenerateVideoSchema.parse({ prompt: P, seconds: 5, quality })).credits;
    expect(q('480p')).toBe(5 * V2_MODELS['seedance-2.0'].video!.creditsPerSecond!['480p']!);
    expect(q('1080p')).toBe(5 * V2_MODELS['seedance-2.0'].video!.creditsPerSecond!['1080p']!);
    expect(q('480p')).toBeLessThan(q('720p'));
  });

  it('video: reference clip seconds are billed at the same rate once measured', () => {
    const v = GenerateVideoSchema.parse({ prompt: '@video1 style, she waves', seconds: 5, video_refs: [MP4] });
    const unmeasured = quoteGenerate('video', v);
    expect(unmeasured.credits).toBe(150);
    expect(unmeasured.breakdown).toMatch(/measured at submit/);
    const measured = quoteGenerate('video', v, { inputVideoSeconds: 4.2 });
    expect(measured.credits).toBe(30 * (5 + 5));
    expect(measured.breakdown).toMatch(/5s of reference video/);
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

  it('quoteAny returns issues for bad input and a quote for good input', () => {
    const bad = quoteAny('video', { prompt: P, model: 'sora-2' });
    expect(bad.ok).toBe(false);
    const good = quoteAny('video', { prompt: P, seconds: 8 });
    expect(good.ok && good.quote.credits).toBe(240);
  });
});

describe('model: "auto"', () => {
  const S = (runs: number, failed: number, score: number | null, scored: number) => ({
    runs, failed, avg_auto_score: score, scored, avg_user_score: null, rated: 0, p50_seconds: null, avg_credits: null,
  });

  it('is accepted by the schemas and refused by quoteGenerate until resolved', () => {
    expect(parse({ prompt: P, model: 'auto' }).success).toBe(true);
    expect(() => quoteGenerate('video', GenerateVideoSchema.parse({ prompt: P, model: 'auto' }))).toThrow(/pickAuto/);
  });

  it('with no data picks the default and says why', () => {
    const p = pickAuto('video', {});
    expect(p.model).toBe('seedance-2.0');
    expect(p.reason).toMatch(/default/);
  });

  it('never picks a challenger on thin data or a >1.5x price', () => {
    expect(pickAuto('video', { 'seedance-2.5': S(50, 0, 0.99, 50) }).model).toBe('seedance-2.0');
    expect(pickAuto('image', { 'gpt-image-2': S(3, 3, 0.1, 3) }).model).toBe('gpt-image-2');
  });

  it('abandons a default that fails >25% for a healthy live model that has the mode', () => {
    const p = pickAuto('video', { 'seedance-2.0': S(20, 8, 0.8, 12), 'seedance-2.5': S(20, 0, 0.8, 12) }, 'image');
    expect(p.model).toBe('seedance-2.5');
    expect(p.reason).toMatch(/failed 40%/);
  });

  it('quoteAny resolves auto before pricing, re-validates against the pick, and reports it', () => {
    const q = quoteAny('video', { prompt: P, seconds: 5, model: 'auto' }, {});
    expect(q.ok && q.quote.model).toBe('seedance-2.0');
    expect(q.ok && q.quote.credits).toBe(150);
    expect(q.ok && q.auto?.reason).toBeTruthy();
    expect(q.ok && (q.input as { model?: string }).model).toBe('seedance-2.0');
  });
});
