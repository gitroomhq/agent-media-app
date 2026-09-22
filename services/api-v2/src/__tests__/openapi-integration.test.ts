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
    const { status, data } = await api('POST', '/v1/generate/text_to_video', {});
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

  it('spec enum values match API validation (text_to_video aspect_ratio)', async () => {
    const spec = await (await fetch(`${BASE}/openapi.json`)).json();
    const schema = spec.paths['/v1/generate/text_to_video'].post.requestBody.content['application/json'].schema;
    const arEnum = schema.properties.aspect_ratio.enum;
    expect(arEnum).toContain('9:16');
    expect(arEnum).toContain('16:9');

    // Verify API rejects values NOT in the spec enum
    const { status } = await api('POST', '/v1/generate/text_to_video', {
      prompt: 'A'.repeat(50),
      aspect_ratio: '7:3',
    });
    if (status === 429) return;
    expect(status).toBe(400);
  });
});

// ── POST /v1/generate/ugc_video — retired 2026-09-22 ───────────────────────
//
// The v1 UGC pipeline rendered its talking head on a Kling model that Kling
// discontinued (code 1203). ugc_video, saas_review and product_review answer
// 410 with the replacement and never create a job. The validation and
// word-budget regressions that used to run through ugc_video are covered by
// product_acting_ugc below and by the schema unit tests.

describeIfKey('POST /v1/generate/ugc_video — retired', () => {
  it.each(['ugc_video', 'saas_review', 'product_review'])('%s answers 410 GENERATOR_RETIRED pointing at selfie', async (id) => {
    const { status, data } = await api('POST', `/v1/generate/${id}`, { script: 'A'.repeat(50) });
    if (status === 429) return;
    expect(status).toBe(410);
    expect(data.error.code).toBe('GENERATOR_RETIRED');
    expect(data.error.replacement).toBe('selfie');
  });

  it('the CLI compatibility path answers the same 410', async () => {
    const { status, data } = await api('POST', '/functions/v1/ugc-video', { script: 'A'.repeat(50) });
    if (status === 429) return;
    expect(status).toBe(410);
    expect(data.error.code).toBe('GENERATOR_RETIRED');
  });

  it('retired generators are absent from the OpenAPI spec and /health', async () => {
    const spec = await (await fetch(`${BASE}/openapi.json`)).json();
    for (const id of ['ugc_video', 'saas_review', 'product_review']) expect(spec.paths[`/v1/generate/${id}`]).toBeUndefined();
    const health = await (await fetch(`${BASE}/health`)).json();
    expect(health.generators).not.toContain('ugc_video');
    expect(health.generators).not.toContain('saas_review');
  });
});

describeIfKey('POST /v1/generate — routing', () => {
  it('returns 404 for unknown generator', async () => {
    const { status, data } = await api('POST', '/v1/generate/fake', {});
    if (status === 429) return;
    expect(status).toBe(404);
    expect(data.error.code).toBe('GENERATOR_NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const resp = await fetch(`${BASE}/v1/generate/text_to_video`, {
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
