// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Integration tests: verify the live API matches the OpenAPI spec.
 * Tests every endpoint, enum validation, and response shapes.
 */

import { describe, it, expect } from 'vitest';

const BASE = 'https://api.agent-media.ai';
// FIX 4 (H5): no hardcoded prod key in source. Integration tests that call the
// live API skip unless a real key is supplied via TEST_API_KEY.
const KEY = process.env.TEST_API_KEY ?? '';
const describeIfKey = KEY ? describe : describe.skip;

async function api(method: string, path: string, body?: unknown) {
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: resp.status, data: await resp.json() };
}

// ── OpenAPI spec structure ──────────────────────────────────────────────────

describeIfKey('OpenAPI spec', () => {
  it('serves valid spec at /openapi.json', async () => {
    const resp = await fetch(`${BASE}/openapi.json`);
    const spec = await resp.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(5);
  });

  it('has response schemas for all endpoints', async () => {
    const spec = await (await fetch(`${BASE}/openapi.json`)).json();
    expect(spec.components.schemas.JobSubmitted).toBeDefined();
    expect(spec.components.schemas.JobStatus).toBeDefined();
    expect(spec.components.schemas.ActorList).toBeDefined();
    expect(spec.components.schemas.Error).toBeDefined();
    expect(spec.components.schemas.InsufficientCredits).toBeDefined();
  });

  it('has auth configured', async () => {
    const spec = await (await fetch(`${BASE}/openapi.json`)).json();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });
});

// ── GET /v1/actors ──────────────────────────────────────────────────────────

describeIfKey('GET /v1/actors', () => {
  it('returns paginated actor list', async () => {
    const { status, data } = await api('GET', '/v1/actors?limit=5&offset=0');
    expect(status).toBe(200);
    expect(data.actors).toBeInstanceOf(Array);
    expect(data.actors.length).toBeLessThanOrEqual(5);
    expect(data.total).toBeGreaterThan(0);
    expect(data.limit).toBe(5);
    expect(data.offset).toBe(0);
  });

  it('actor objects have required fields', async () => {
    const { data } = await api('GET', '/v1/actors?limit=1');
    const actor = data.actors[0];
    expect(actor.id).toBeDefined();
    expect(actor.slug).toBeDefined();
    expect(actor.name).toBeDefined();
  });

  it('is public — returns 200 without auth', async () => {
    // /v1/actors is intentionally public (the actor library is browseable
    // unauthenticated, matching the legacy /functions/v1/actors edge function
    // and the public /ai-actors landing page).
    const resp = await fetch(`${BASE}/v1/actors?limit=1`);
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(Array.isArray(data.actors)).toBe(true);
  });

  it('?slug=… returns single actor', async () => {
    const list = await api('GET', '/v1/actors?limit=1');
    const slug = list.data.actors[0].slug;
    const { status, data } = await api('GET', `/v1/actors?slug=${slug}`);
    expect(status).toBe(200);
    expect(data.actor.slug).toBe(slug);
  });

  it('?slug=… returns 404 with similar-slug suggestions on miss', async () => {
    const { status, data } = await api('GET', '/v1/actors?slug=__definitely_not_a_real_slug__');
    expect(status).toBe(404);
    expect(data.error.code).toBe('ACTOR_NOT_FOUND');
    expect(Array.isArray(data.error.similar)).toBe(true);
  });
});

// ── GET /v1/videos/{jobId} ──────────────────────────────────────────────────

describeIfKey('GET /v1/videos/{jobId}', () => {
  it('returns 404 for nonexistent job', async () => {
    const { status, data } = await api('GET', '/v1/videos/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
    expect(data.error.code).toBe('VIDEO_NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const resp = await fetch(`${BASE}/v1/videos/00000000-0000-0000-0000-000000000000`);
    expect(resp.status).toBe(401);
  });
});

// ── Contract tests: response shapes match spec ─────────────────────────────

describeIfKey('Contract: response shapes match spec', () => {
  it('actors response has required fields from ActorList schema', async () => {
    const { status, data } = await api('GET', '/v1/actors?limit=1');
    expect(status).toBe(200);
    // ActorList required: actors, total
    expect(data).toHaveProperty('actors');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('offset');
    expect(Array.isArray(data.actors)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  it('error response matches Error schema', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {});
    expect(status).toBe(400);
    // Error required: error.code, error.message
    expect(data).toHaveProperty('error');
    expect(data.error).toHaveProperty('code');
    expect(data.error).toHaveProperty('message');
    expect(typeof data.error.code).toBe('string');
    expect(typeof data.error.message).toBe('string');
  });

  it('404 error matches Error schema', async () => {
    const { status, data } = await api('GET', '/v1/videos/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
    expect(data.error.code).toBeDefined();
    expect(data.error.message).toBeDefined();
  });

  it('unknown generator 404 matches Error schema', async () => {
    const { status, data } = await api('POST', '/v1/generate/fake', {});
    expect(status).toBe(404);
    expect(data.error.code).toBe('GENERATOR_NOT_FOUND');
    expect(typeof data.error.message).toBe('string');
  });

  it('spec enum values match API validation for all enums', async () => {
    // Fetch spec and extract enums
    const spec = await (await fetch(`${BASE}/openapi.json`)).json();
    const ugcSchema = spec.paths['/v1/generate/ugc_video'].post.requestBody.content['application/json'].schema;

    // Test tone enum
    const toneEnum = ugcSchema.properties.tone.enum;
    expect(toneEnum).toContain('energetic');
    expect(toneEnum).toContain('calm');
    expect(toneEnum).toContain('confident');
    expect(toneEnum).toContain('dramatic');
    expect(toneEnum).toHaveLength(4);

    // Test music enum
    const musicEnum = ugcSchema.properties.music.enum;
    expect(musicEnum).toContain('chill');
    expect(musicEnum).toContain('upbeat');
    expect(musicEnum).toHaveLength(5);

    // Test aspect_ratio enum
    const arEnum = ugcSchema.properties.aspect_ratio.enum;
    expect(arEnum).toContain('9:16');
    expect(arEnum).toContain('16:9');
    expect(arEnum).toContain('1:1');
    expect(arEnum).toHaveLength(3);

    // Verify API rejects values NOT in the spec enum
    const { status } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      tone: 'nonexistent_tone',
    });
    expect(status).toBe(400);
  });
});

// ── POST /v1/generate/ugc_video — validation ────────────────────────────────

describeIfKey('POST /v1/generate/ugc_video — validation', () => {
  it('rejects empty body', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {});
    expect(status).toBe(400);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects script too short', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', { script: 'short' });
    expect(status).toBe(400);
    expect(data.error.message).toContain('50');
  });

  it('rejects invalid tone', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      tone: 'angry',
    });
    expect(status).toBe(400);
    expect(data.error.message).toContain('tone');
    expect(data.error.details[0].options).toEqual(['energetic', 'calm', 'confident', 'dramatic']);
  });

  it('rejects invalid music', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      music: 'jazz',
    });
    expect(status).toBe(400);
    expect(data.error.details[0].options).toEqual(['chill', 'energetic', 'corporate', 'dramatic', 'upbeat']);
  });

  it('rejects invalid aspect_ratio', async () => {
    const { status } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      aspect_ratio: '4:3',
    });
    expect(status).toBe(400);
  });

  it('rejects SSRF in webhook_url', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      webhook_url: 'https://169.254.169.254/latest/meta-data/',
    });
    expect(status).toBe(400);
    expect(data.error.message).toContain('private IP');
  });

  it('rejects SSRF in broll_images', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      broll_images: ['http://localhost:3000/admin'],
    });
    expect(status).toBe(400);
    expect(data.error.message).toContain('localhost');
  });

  it('returns 404 for invalid actor slug with suggestion', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A'.repeat(50),
      actor_slug: 'sofya',
    });
    // May get 429 if rate limited from prior tests
    if (status === 429) return;
    expect(status).toBe(404);
    expect(data.error.message).toContain('sofia');
  });
});

// ── POST /v1/generate — generator routing ───────────────────────────────────

describeIfKey('POST /v1/generate — routing', () => {
  it('returns 404 for unknown generator', async () => {
    const { status, data } = await api('POST', '/v1/generate/fake', {});
    if (status === 429) return;
    expect(status).toBe(404);
    expect(data.error.code).toBe('GENERATOR_NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const resp = await fetch(`${BASE}/v1/generate/ugc_video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(resp.status).toBe(401);
  });
});

// ── Regression tests for validation bugs fixed 2026-05-03 ──────────────────
//
// 1. Silent duration upgrade: word counter used to auto-bump duration to fit
//    a too-long script, charging the user 3x without warning. Should now
//    hard-reject with 400 script_too_long.
// 2. Off-by-one rounding: script-gen used Math.round, validation used
//    Math.floor — a 13-word script passed gen but failed validation at d=5.
//    Both now read MAX_WORDS_PER_DURATION (Math.floor based).
// 3. Simple-mode > 10s: kling-o3 lip-sync degrades past 10s in a single
//    clip; multi-scene mode chunks but simple mode doesn't. Reject upfront.
// 4. Hard cap for product_acting_ugc validation (already correct pre-session,
//    captured for regression).
//
// These tests need a starter+ tier API key to reach the validation paths
// (the plan-tier check at api-v2 fires before the word-count check). Set
// TEST_API_KEY env to a starter+ key. When using the default low-tier key
// they 403 before reaching the assertion — treated as a skip so CI on a
// fresh checkout still passes.

function skipIf403(status: number): boolean {
  if (status === 429) return true; // rate-limited
  if (status === 403) {
    console.warn('[regression] 403 — TEST_API_KEY tier too low to reach validation. Set a starter+ key to exercise.');
    return true;
  }
  return false;
}

describeIfKey('Validation regression — script_too_long for ugc_video', () => {
  it('rejects a 13-word script for duration=5 with code script_too_long', async () => {
    const script = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script,
      target_duration: 5,
    });
    if (skipIf403(status)) return;
    expect(status).toBe(400);
    expect(data.error).toBe('script_too_long');
    expect(data.error_description).toContain('13 words');
    expect(data.error_description).toContain('max 12 for 5s');
  });

  it('error message recommends a longer duration as fix', async () => {
    const script = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script,
      target_duration: 5,
    });
    if (skipIf403(status)) return;
    expect(status).toBe(400);
    expect(data.error).toBe('script_too_long');
    expect(data.error_description).toMatch(/--duration\s+\d+/);
  });

  it('rejects an over-37-word script even at duration=15', async () => {
    const script = 'word '.repeat(50).trim();
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script,
      target_duration: 15,
    });
    if (skipIf403(status)) return;
    expect(status).toBe(400);
    expect(data.error).toBe('script_too_long');
  });
});

describeIfKey('Validation regression — simple-mode duration cap', () => {
  it('rejects duration=15 simple-mode (no broll, no scenes, has actor)', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A short script that fits well within the fifteen second word budget for this regression test.',
      target_duration: 15,
      actor_slug: 'sofia',
    });
    if (skipIf403(status)) return;
    expect(status).toBe(400);
    expect(data.error).toBe('duration_exceeds_simple_mode_cap');
    expect(data.error_description).toMatch(/--broll|--scenes/);
  });

  it('does NOT reject duration=10 simple-mode (boundary value, allowed)', async () => {
    const { status, data } = await api('POST', '/v1/generate/ugc_video', {
      script: 'A script that fits within twenty-five word budget for ten seconds duration.',
      target_duration: 10,
      actor_slug: 'sofia',
    });
    if (skipIf403(status)) return;
    // Should not be the simple-mode cap error (200, 402 insufficient credits,
    // or another validation error are all acceptable — anything except this
    // specific cap rejection).
    if (status === 400) {
      expect(data.error).not.toBe('duration_exceeds_simple_mode_cap');
    }
  });
});

describeIfKey('Validation regression — product_acting_ugc script length', () => {
  it('rejects a too-long script (Zod-level VALIDATION_ERROR or app-level SCRIPT_TOO_LONG)', async () => {
    // duration*3 = 15 max for d=5; send 25 words. Zod schema may catch it
    // first as VALIDATION_ERROR; if it slips through Zod the app handler
    // returns SCRIPT_TOO_LONG. Either is fine — both prove the request is
    // rejected before reaching the worker.
    const script = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five';
    const { status, data } = await api('POST', '/v1/generate/product_acting_ugc', {
      script,
      duration: 5,
      actor_slug: 'sofia',
      product_image_url: 'https://placehold.co/900x900/png?text=t',
      template: 'product-in-hand',
      acting_style: 'honest-review',
    });
    if (skipIf403(status)) return;
    expect(status).toBe(400);
    const code = data.error?.code ?? data.error;
    expect(['SCRIPT_TOO_LONG', 'VALIDATION_ERROR']).toContain(code);
  });
});

// ── Interactive docs ────────────────────────────────────────────────────────

describeIfKey('Interactive docs', () => {
  it('serves docs page at /docs', async () => {
    const resp = await fetch(`${BASE}/docs`);
    expect(resp.status).toBe(200);
    const html = await resp.text();
    expect(html).toContain('Scalar');
  });
});
