// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const db = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), eq: vi.fn() }));
vi.mock('../server.js', () => ({ supabase: db }));
const { statusRoute } = await import('../routes/status.js');
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(() => query), eq: db.eq, maybeSingle: db.read };
  db.eq.mockReturnValue(query); db.from.mockReturnValue(query);
});
async function status(jobId = id, userId: string | undefined = 'owner') {
  let code = 200; let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    status(value: number) { code = value; return this; },
    json(value: unknown) { body = value; return this; },
    setHeader(name: string, value: string) { headers[name] = value; },
  } as unknown as Response;
  await statusRoute({ params: { jobId }, userId } as unknown as Request, res);
  return { code, body, headers };
}
describe('status lookup recovery', () => {
  it.each(['database', 'network'])('keeps the job recoverable during a %s failure', async (failure) => {
    if (failure === 'database') db.read.mockResolvedValue({ data: null, error: { code: '08006', message: 'private database detail' } });
    else db.read.mockRejectedValue(new Error('private network detail'));
    const result = await status();
    expect(result).toMatchObject({ code: 503, headers: { 'Retry-After': '5' }, body: { error: { code: 'STATUS_UNAVAILABLE', job_id: id, retry_after_seconds: 5 } } });
    expect(JSON.stringify(result.body)).toContain('Do not submit another generation');
    expect(JSON.stringify(result.body)).not.toContain('private');
    expect(db.eq.mock.calls).toEqual([['id', id], ['user_id', 'owner']]);
  });
  it('returns 404 only for a successful empty account-scoped lookup', async () => {
    db.read.mockResolvedValue({ data: null, error: null });
    expect(await status()).toMatchObject({ code: 404, body: { error: { code: 'VIDEO_NOT_FOUND' } } });
    expect(db.eq).toHaveBeenCalledWith('user_id', 'owner');
  });
  it('recovers the same job when the database returns, preserving successful output', async () => {
    db.read.mockResolvedValueOnce({ data: null, error: { message: 'down' } }).mockResolvedValueOnce({ data: {
      id, operation: 'generate_image', status: 'completed', output_media_url: 'https://example.test/result.png', input_params: {}, error_message: null,
    }, error: null });
    expect((await status()).code).toBe(503);
    expect(await status()).toMatchObject({ code: 200, body: { job_id: id, status: 'completed', result_url: 'https://example.test/result.png' } });
    expect(db.from.mock.calls.every(([table]) => table === 'generation_jobs')).toBe(true);
  });
  it('rejects malformed IDs without querying storage', async () => {
    expect((await status('invalid')).code).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
});
