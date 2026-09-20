// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), eq: vi.fn() }));
vi.mock('../server.js', () => ({ supabase: db }));
const { accountReadinessRoute } = await import('../routes/v1/me-readiness.js');
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('WORKER_V2_URL', 'https://worker.test');
  vi.stubEnv('WORKER_SECRET', 'private-worker-secret');
  const query = { select: vi.fn(() => query), eq: db.eq, maybeSingle: db.read };
  db.eq.mockReturnValue(query); db.from.mockReturnValue(query);
});
afterEach(() => vi.unstubAllEnvs());
async function check(userId: string | null = 'owner') {
  let code = 200; let body: any;
  const headers: Record<string, string> = {};
  const res = {
    status(value: number) { code = value; return this; },
    json(value: unknown) { body = value; return this; },
    setHeader(name: string, value: string) { headers[name] = value; },
  } as unknown as Response;
  await accountReadinessRoute({ userId } as unknown as Request, res);
  return { code, body, headers };
}
describe('read-only account readiness', () => {
  it('reads only the authenticated owner balance without claiming a reservation or provider health', async () => {
    db.read.mockResolvedValue({ data: { monthly_credits_remaining: 10, purchased_balance: 7 }, error: null });
    expect(await check()).toMatchObject({ code: 200, headers: { 'Cache-Control': 'no-store' }, body: {
      authenticated: true, credits: { monthly_remaining: 10, purchased: 7, total: 17 },
      generation: { status: 'quote_required', balance_is_reserved: false, provider_availability_checked: false },
    } });
    expect(db.from.mock.calls).toEqual([['user_credits']]);
    expect(db.eq.mock.calls).toEqual([['user_id', 'owner']]);
  });
  it.each([null, { monthly_credits_remaining: 0, purchased_balance: 0 }])('reports successfully read empty balances', async data => {
    db.read.mockResolvedValue({ data, error: null });
    expect((await check()).body.generation.status).toBe('needs_credits');
  });
  it.each(['returned', 'thrown', 'malformed', 'overflow'])('never turns a %s failure into zero credits', async failure => {
    if (failure === 'thrown') db.read.mockRejectedValue(new Error('private-detail'));
    else db.read.mockResolvedValue({ data: failure === 'malformed' ? { purchased_balance: null } : failure === 'overflow' ? { purchased_balance: Number.MAX_SAFE_INTEGER, monthly_credits_remaining: 1 } : null, error: failure === 'returned' ? { message: 'private-detail' } : null });
    const result = await check();
    expect(result).toMatchObject({ code: 503, headers: { 'Retry-After': '5' }, body: { error: { code: 'ACCOUNT_CHECK_UNAVAILABLE' } } });
    expect(result.body.credits).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private-detail');
  });
  it('does not suggest buying credits to fix missing worker configuration', async () => {
    vi.stubEnv('WORKER_SECRET', '');
    db.read.mockResolvedValue({ data: null, error: null });
    const result = await check();
    expect(result.body.generation.status).toBe('not_configured');
    expect(result.body.generation.next_step).toContain('do not purchase');
  });
  it('requires authentication before querying storage', async () => {
    expect((await check(null)).code).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
});
