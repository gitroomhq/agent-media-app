// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  errors: new Map<string, Error>(),
  warn: vi.fn(),
}));

vi.mock('../server.js', () => ({
  supabase: {
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        gte: async () => ({
          count: mocks.counts.get(table) ?? 0,
          error: mocks.errors.get(table) ?? null,
        }),
      };
      return query;
    },
  },
}));
vi.mock('../logger.js', () => ({ logger: { warn: mocks.warn } }));

const { inFlightCount, videoConcurrencyGate } = await import('../concurrency.js');

beforeEach(() => {
  mocks.counts.clear();
  mocks.errors.clear();
  mocks.warn.mockClear();
});

describe('shared generation concurrency', () => {
  it('counts loose generation jobs alongside skills and standalone primitives', async () => {
    mocks.counts.set('skill_runs', 1);
    mocks.counts.set('primitive_runs', 1);
    mocks.counts.set('generation_jobs', 2);
    await expect(inFlightCount('user-1')).resolves.toBe(4);
  });

  it('fails open and logs when any ledger count is unavailable', async () => {
    mocks.errors.set('generation_jobs', new Error('database unavailable'));
    const next = vi.fn() as NextFunction;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    await videoConcurrencyGate({ userId: 'user-1' } as unknown as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it('returns a truthful generation limit response', async () => {
    mocks.counts.set('generation_jobs', 3);
    const next = vi.fn() as NextFunction;
    let status = 200;
    let body: any;
    const res = {
      status: (value: number) => {
        status = value;
        return res;
      },
      json: (value: unknown) => {
        body = value;
        return res;
      },
    } as unknown as Response;
    await videoConcurrencyGate({ userId: 'user-1' } as unknown as Request, res, next);
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: { code: 'TOO_MANY_ACTIVE_RENDERS', active: 3, limit: 3 } });
    expect(next).not.toHaveBeenCalled();
  });
});
