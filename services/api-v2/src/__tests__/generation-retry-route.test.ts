// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { GenerationRequest } from '../generation/request-identity.js';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), stats: vi.fn(async () => ({})) }));
vi.mock('../server.js', () => ({ supabase: mocks }));
vi.mock('../routes/v1/models.js', () => ({ loadModelStats: mocks.stats }));
vi.stubEnv('WORKER_V2_URL', 'https://worker.test');
vi.stubEnv('WORKER_SECRET', 'test-only');
const { generateRoute } = await import('../routes/v2/generate.js');
const { generationReplay, requestIdentity } = await import('../generation/request-identity.js');
let record: any, jobCount = 0, debitCount = 0, lostCommit = false, refundError = false, capacityError = false;
const worker = vi.fn();
beforeEach(() => {
  record = null; jobCount = 0; debitCount = 0; lostCommit = false; refundError = false; capacityError = false;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', worker);
  worker.mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.from.mockImplementation(() => {
    let update: any;
    const q: any = {
      eq: () => q,
      select: () => update ? Promise.resolve({ data: [{ id: record?.submission_response.job_id }], error: null }) : q,
      update: (value: any) => { update = value; if (record) Object.assign(record, value); return q; },
      maybeSingle: async () => ({ data: record, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return q;
  });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_generation_request') return { data: record ? { ...record, response: record.submission_response } : null, error: null };
    if (name === 'refund_credits') return refundError ? { error: { message: 'ledger unavailable' } } : { data: { success: true }, error: null };
    if (name !== 'submit_generation_request') throw new Error('Unexpected RPC');
    if (capacityError) return { data: null, error: { message: 'TOO_MANY_ACTIVE_RENDERS:3:3' } };
    if (record) return { data: { created: false, status: record.status, response: record.submission_response }, error: null };
    jobCount++; debitCount++;
    record = { status: 'submitted', request_hash: args.p_request_hash, submission_response: args.p_response };
    return lostCommit ? { error: { message: 'response lost after commit' } } : { data: { created: true, response: args.p_response }, error: null };
  });
});
async function submit(body = { prompt: 'A product photo' }, key: string = 'test-request') {
  const req = { userId: 'test-user', params: { kind: 'image' }, body, get: () => key } as unknown as GenerationRequest;
  let status = 200, result: any, task: Promise<void> | undefined;
  const res = { setHeader: vi.fn(), status: (s: number) => { status = s; return res; }, json: (value: any) => { result = value; return res; } } as unknown as Response;
  await generationReplay(req, res, () => { task = generateRoute(req, res); });
  if (task) await task;
  return { status, body: result };
}
describe('generation submission recovery', () => {
  it('returns the original job after response loss, without probing, charging or dispatching again', async () => {
    const first = await submit();
    const second = await submit();
    expect(first.status).toBe(201);
    expect(second).toMatchObject({ status: 200, body: { job_id: first.body.job_id, replayed: true, credits_deducted: 0, original_credits_deducted: 20 } });
    expect(jobCount).toBe(1); expect(debitCount).toBe(1);
    expect(worker).toHaveBeenCalledTimes(1); expect(mocks.stats).toHaveBeenCalledTimes(1);
  });
  it('recovers an atomic debit whose RPC acknowledgement was lost', async () => {
    lostCommit = true;
    expect((await submit()).status).toBe(503);
    expect((await submit()).body).toMatchObject({ request_id: 'test-request', replayed: true });
    expect(jobCount).toBe(1); expect(debitCount).toBe(1); expect(worker).not.toHaveBeenCalled();
  });
  it('keeps an uncertain worker acknowledgement pending without a false refund', async () => {
    worker.mockRejectedValue(new Error('connection reset after acceptance'));
    const first = await submit();
    expect(first).toMatchObject({ status: 202, body: { dispatch_status: 'unknown' } });
    expect(first.body.message).not.toContain('refunded');
    expect((await submit()).body.job_id).toBe(first.body.job_id);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'refund_credits')).toBe(false);
  });
  it.each([false, true])('does not claim an unconfirmed refund (refund failure %s)', async (failure) => {
    refundError = failure;
    worker.mockResolvedValue(new Response('{}', { status: 401 }));
    const r = await submit();
    expect(r.status).toBe(503);
    expect(r.body.refund_status).toBe(failure ? 'unconfirmed' : 'refunded');
    expect(r.body.error.message.includes('Credits were refunded')).toBe(!failure);
  });
  it('rejects changed inputs under the same identity before dispatch', async () => {
    await submit();
    expect((await submit({ prompt: 'Different photo' })).status).toBe(409);
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('returns a terminal saved job without dispatching again', async () => {
    await submit(); record.status = 'completed';
    expect((await submit()).body.status).toBe('completed');
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('validates keys before any database or worker action', async () => {
    expect((await submit(undefined, 'bad key')).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
  });
  it('returns a retryable capacity response without dispatching or charging', async () => {
    capacityError = true;
    const result = await submit();
    expect(result).toMatchObject({ status: 429, body: { error: { code: 'TOO_MANY_ACTIVE_RENDERS', active: 3, limit: 3 } } });
    expect(worker).not.toHaveBeenCalled();
  });
  it('scopes request identity to the user and ignores object key ordering', () => {
    const a = requestIdentity('user-a', 'video', { prompt: 'x', seconds: 5 }, 'key');
    const b = requestIdentity('user-a', 'video', { seconds: 5, prompt: 'x' }, 'key');
    expect(a).toEqual(b);
    expect(requestIdentity('user-b', 'video', {}, 'key').key).not.toBe(a.key);
    expect(requestIdentity('user-a', 'audio', {}, 'key').hash).not.toBe(a.hash);
  });
});
