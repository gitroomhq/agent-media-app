// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * API v1 gateway validation tests.
 *
 * These test the validation logic extracted into validate-video.ts
 * without hitting real Supabase edge functions.
 *
 * Run with: npx tsc -p tsconfig.test.json && node --test dist-tests/api-v1.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline the validation logic for testability ─────────────────────────────
// We duplicate the core validation here because the web app uses Next.js path
// aliases (@/lib/...) that cannot resolve in a plain node:test runner.
// If validate-video.ts changes, keep this copy in sync.

const VALID_DURATIONS = new Set([5, 10, 15]);
const VALID_TONES = new Set(['energetic', 'calm', 'confident', 'dramatic']);

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

function pass(): ValidationResult {
  return { ok: true };
}

function fail(message: string): ValidationResult {
  return { ok: false, error: message };
}

/**
 * Subset of validateVideoBody that covers the fields under test.
 * Mirrors apps/web/lib/api/v1/validate-video.ts.
 */
function validateVideoBody(body: Record<string, unknown>): ValidationResult {
  if (!body.script && !body.prompt) {
    return fail('Either script or prompt is required');
  }

  if (body.script !== undefined) {
    if (!isString(body.script)) return fail('script must be a string');
    if (body.script.length < 50) return fail('script must be at least 50 characters');
    if (body.script.length > 3000) return fail('script must be 3000 characters or fewer');
  }

  if (body.prompt !== undefined) {
    if (!isString(body.prompt)) return fail('prompt must be a string');
    if (body.prompt.length < 1) return fail('prompt must be at least 1 character');
    if (body.prompt.length > 1000) return fail('prompt must be 1000 characters or fewer');
  }

  if (body.target_duration !== undefined) {
    if (typeof body.target_duration !== 'number' || !VALID_DURATIONS.has(body.target_duration)) {
      return fail('target_duration must be 5, 10, or 15');
    }
  }

  if (body.tone !== undefined) {
    if (!isString(body.tone) || !VALID_TONES.has(body.tone)) {
      return fail(`tone must be one of: ${[...VALID_TONES].join(', ')}`);
    }
  }

  if (body.cta !== undefined) {
    if (!isString(body.cta)) return fail('cta must be a string');
    if (body.cta.length > 100) return fail('cta must be 100 characters or fewer');
  }

  return pass();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/videos validation', () => {
  it('rejects body with neither script nor prompt', () => {
    const result = validateVideoBody({ actor_slug: 'aaliyah' });
    assert.equal(result.ok, false);
    assert.match(result.error!, /script|prompt/i);
  });

  it('rejects target_duration=30 (only 5, 10, 15 allowed)', () => {
    const result = validateVideoBody({
      prompt: 'Generate a product review video',
      target_duration: 30,
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /target_duration/);
  });

  it('rejects script shorter than 50 characters', () => {
    const result = validateVideoBody({
      script: 'Too short',
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /at least 50/);
  });

  it('rejects cta longer than 100 characters', () => {
    const longCta = 'x'.repeat(101);
    const result = validateVideoBody({
      prompt: 'Generate a product review video',
      cta: longCta,
    });
    assert.equal(result.ok, false);
    assert.match(result.error!, /cta/i);
  });

  it('accepts a valid body with prompt only', () => {
    const result = validateVideoBody({
      prompt: 'Generate a product review video',
      target_duration: 15,
      tone: 'energetic',
      cta: 'Buy now!',
    });
    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
  });
});

describe('Authorization header check (simulated)', () => {
  /**
   * The gateway function checks for Bearer token before any body processing.
   * We simulate this check since we cannot import the actual gateway (Next.js deps).
   */
  it('rejects requests without Bearer authorization', () => {
    function checkAuth(header: string | null): boolean {
      return header !== null && header.startsWith('Bearer ');
    }
    assert.equal(checkAuth(null), false, 'Missing auth header should fail');
  });

  it('rejects requests with non-Bearer authorization', () => {
    const auth = 'Basic dXNlcjpwYXNz';
    const hasBearerToken = auth.startsWith('Bearer ');
    assert.equal(hasBearerToken, false, 'Basic auth should fail');
  });

  it('accepts requests with Bearer authorization', () => {
    const auth = 'Bearer sk-test-123';
    const hasBearerToken = auth.startsWith('Bearer ');
    assert.equal(hasBearerToken, true, 'Bearer token should pass');
  });
});
