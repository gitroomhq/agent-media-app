// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The tier cap the paywall sells has to exist on the path customers use.
 *
 * "Up to 10s videos" / "Up to 15s videos" was enforced only in generate.ts.
 * /v1/skills/:slug/run — the MCP server, the CLI and the dashboard agent — had
 * no gate at all, so a Creator-tier account could write 23 words, get a 15s
 * take, and be billed 420 credits for a tier that promised 10s.
 *
 * The boundary is derived from fitDuration rather than hardcoded, so these stay
 * true if the word thresholds ever move.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ eq, maybeSingle }));
const select = vi.fn(() => ({ eq, maybeSingle }));
const from = vi.fn(() => ({ select }));

vi.mock('../server.js', () => ({ supabase: { from: (...a: unknown[]) => from(...(a as [])) } }));

const { checkPlanDurationLimit, MAX_WORDS_FOR_TEN_SECONDS } = await import('../skills/plan-limits.js');

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

/** subscriptions lookup, then (only when free) user_credits. */
function mockTier(planSlug: string | null, purchased = 0) {
  maybeSingle.mockReset();
  maybeSingle
    .mockResolvedValueOnce({ data: planSlug ? { plan_slug: planSlug, status: 'active' } : null })
    .mockResolvedValueOnce({ data: { purchased_balance: purchased } });
}

describe('plan duration limit on the skills path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a 15s script on the Creator tier', async () => {
    mockTier('starter');
    const v = await checkPlanDurationLimit('u1', { script: words(23) });
    expect(v).not.toBeNull();
    expect(v?.tier).toBe('starter');
    expect(v?.requestedSeconds).toBe(15);
    expect(v?.maxSeconds).toBe(10);
  });

  it('allows the longest script that still fits 10s on Creator', async () => {
    mockTier('starter');
    expect(await checkPlanDurationLimit('u1', { script: words(MAX_WORDS_FOR_TEN_SECONDS) })).toBeNull();
  });

  it('allows a 15s script on Pro', async () => {
    mockTier('creator');
    expect(await checkPlanDurationLimit('u1', { script: words(30) })).toBeNull();
  });

  it('allows a 15s script on Pro Plus', async () => {
    mockTier('pro_plus');
    expect(await checkPlanDurationLimit('u1', { script: words(30) })).toBeNull();
  });

  it('treats a credit-pack holder as newby, which is capped', async () => {
    mockTier(null, 3900);
    const v = await checkPlanDurationLimit('u1', { script: words(30) });
    expect(v?.tier).toBe('newby');
  });

  it('ignores a silent scene_action clip — no script to measure', async () => {
    mockTier('starter');
    expect(await checkPlanDurationLimit('u1', { scene_action: 'dancing to upbeat music' })).toBeNull();
  });

  it('fails OPEN when the tier lookup throws', async () => {
    maybeSingle.mockReset();
    maybeSingle.mockRejectedValue(new Error('db down'));
    // A database hiccup must never stop a paying customer generating.
    expect(await checkPlanDurationLimit('u1', { script: words(30) })).toBeNull();
  });
});
