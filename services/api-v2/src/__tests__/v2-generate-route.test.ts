// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../server.js', () => ({ supabase: {} }));

const { validateAndQuote, GENERATE_KINDS } = await import('../routes/v2/generate.js');
const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../server.ts'), 'utf8');

describe('POST /v2/generate/:kind + /v2/quote/:kind', () => {
  it('quotes the same numbers the schema package quotes', () => {
    const v = validateAndQuote('video', { prompt: 'x'.repeat(10), seconds: 5 });
    expect(v.ok && v.credits).toBe(150);
    expect(v.ok && v.model).toBe('seedance-2.0');
    const p = validateAndQuote('video', { prompt: 'x'.repeat(10), seconds: 5, model: 'seedance-2.5' });
    expect(p.ok && p.credits).toBe(495);
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

  it('is mounted behind auth, the generate limiter and the concurrency gate; quote on the read limiter', () => {
    expect(GENERATE_KINDS).toEqual(['image', 'video', 'audio']);
    expect(server).toContain("app.post('/v2/generate/:kind', generateLimiter, authMiddleware, videoConcurrencyGate, looseGenerateRoute);");
    expect(server).toContain("app.post('/v2/quote/:kind',    readLimiter,     authMiddleware, looseQuoteRoute);");
  });
});
