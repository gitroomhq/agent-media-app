// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../server.js', () => ({ supabase: {} }));

const { validateAndQuote, probeVideoRefs, GENERATE_KINDS } = await import('../routes/v2/generate.js');
const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../server.ts'), 'utf8');

describe('POST /v2/generate/:kind + /v2/quote/:kind', () => {
  it('quotes the same numbers the schema package quotes', () => {
    const v = validateAndQuote('video', { prompt: 'x'.repeat(10), seconds: 5 });
    expect(v.ok && v.credits).toBe(300);
    expect(v.ok && v.model).toBe('seedance-2.0');
    const p = validateAndQuote('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' });
    expect(p.ok && p.credits).toBe(625);
    const i = validateAndQuote('image', { prompt: 'portrait' });
    expect(i.ok && i.credits).toBe(20);
    const a = validateAndQuote('audio', { text: 'a'.repeat(250) });
    expect(a.ok && a.credits).toBe(3);
  });

  it('rejects candidates and unknown fields with issues, not a silent default', () => {
    const c = validateAndQuote('video', { prompt: 'x'.repeat(10), model: 'sora-2' });
    expect(c.ok).toBe(false);
    expect(JSON.stringify(!c.ok && c.issues)).toMatch(/not-live video model/);
    const e = validateAndQuote('video', { prompt: 'x'.repeat(10), engine: 'seedance-2.5' });
    expect(e.ok).toBe(false);
  });

  it('resolves model:"auto" before quoting and reports the pick', () => {
    const v = validateAndQuote('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'auto' }, {});
    expect(v.ok && v.model).toBe('seedance-2.0');
    expect(v.ok && v.credits).toBe(300);
    expect(v.ok && v.auto?.reason).toMatch(/default/);
    expect(v.ok && v.input.model).toBe('seedance-2.0');
  });

  it('resolves the video cell the worker will run: mode, provider model, aspect, quality, timeout', () => {
    const t = validateAndQuote('video', { prompt: 'x'.repeat(10) });
    expect(t.ok && t.video).toEqual({ mode: 'text', provider_model: 'seedance-2.0-text-to-video', aspect: '9:16', quality: '720p', timeout_minutes: 30 });
    const i = validateAndQuote('video', { prompt: 'x'.repeat(10), model: 'seedance-2.5', first_frame: 'https://x.com/a.png', quality: '480p' });
    expect(i.ok && i.video).toEqual({ mode: 'image', provider_model: 'seedance-2.5-image-to-video', aspect: 'adaptive', quality: '480p', timeout_minutes: 90 });
    expect(i.ok && i.credits).toBe(5 * 60);
    const r = validateAndQuote('video', { prompt: '@image1 waves', refs: ['https://x.com/a.png'], aspect: '16:9' });
    expect(r.ok && r.video?.provider_model).toBe('seedance-2.0-reference-to-video');
    expect(r.ok && r.video?.aspect).toBe('16:9');
    const bad = validateAndQuote('video', { prompt: 'x'.repeat(10), model: 'seedance-2.5', first_frame: 'https://x.com/a.png', aspect: '9:16' });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(!bad.ok && bad.issues)).toMatch(/adaptive/);
  });

  it('bills reference clip seconds from the probe, and refuses a clip it cannot read', async () => {
    const probe = async (urls: string[]) => Object.fromEntries(urls.map((u) => [u, u.endsWith('a.mp4') ? 4.2 : null]));
    const ok = await probeVideoRefs(['https://x.com/a.mp4'], probe);
    expect(ok).toEqual({ ok: true, seconds: 4.2 });
    const v = validateAndQuote('video', { prompt: '@video1 style', seconds: 5, video_refs: ['https://x.com/a.mp4'] }, {}, { inputVideoSeconds: 4.2 });
    expect(v.ok && v.credits).toBe(60 * (5 + 5));
    const nope = await probeVideoRefs(['https://x.com/a.mp4', 'https://x.com/b.mp4'], probe);
    expect(nope).toEqual({ ok: false, unreadable: ['https://x.com/b.mp4'] });
  });

  it('rate route is mounted behind auth on the read limiter', () => {
    expect(server).toContain("app.post('/v1/runs/:jobId/rate', readLimiter,   authMiddleware, rateRunRoute);");
  });

  it('is mounted behind auth, the generate limiter and the concurrency gate; quote on the read limiter', () => {
    expect(GENERATE_KINDS).toEqual(['image', 'video', 'audio']);
    expect(server).toContain("app.post('/v2/generate/:kind', generateLimiter, authMiddleware, videoConcurrencyGate, looseGenerateRoute);");
    expect(server).toContain("app.post('/v2/quote/:kind',    readLimiter,     authMiddleware, looseQuoteRoute);");
  });
});
