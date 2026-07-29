// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Reconciler tests.
 *
 * Per the project's "no mocks, no stubs" rule, we don't reach for vitest's
 * mocking surface. Instead we build a real minimal object that has the
 * `.rpc()` shape the reconciler depends on, drive it through the public
 * exports, and observe results. The only narrowing cast is on the way in
 * — the production code only uses `.rpc()` from the SupabaseClient API.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  reconcileStuckJobs,
  reconcileSubmittedFastPath,
  startReconciler,
  shouldRunTick,
} from '../orchestrator/reconciler.js';

type RpcResult = { data: unknown; error: { message: string } | null };

interface FakeJob {
  id: string;
  status: string;
  webhook_checkpoint: string;
  updated_at: string;
  error_code?: string;
  error_message?: string;
}

type RefundBehavior = Record<string, string | undefined>;

class FakeQueryBuilder {
  private filters: Array<(job: FakeJob) => boolean> = [];

  private patch: Partial<FakeJob> | null = null;

  private selected = false;

  constructor(private jobs: FakeJob[]) {}

  update(patch: Partial<FakeJob>): this {
    this.patch = patch;
    return this;
  }

  select(_columns: string): this {
    this.selected = true;
    return this;
  }

  eq(column: keyof FakeJob, value: unknown): this {
    this.filters.push((job) => (job as unknown as Record<string, unknown>)[column] === value);
    return this;
  }

  lt(column: keyof FakeJob, value: string): this {
    this.filters.push((job) => String((job as unknown as Record<string, unknown>)[column] ?? '') < value);
    return this;
  }

  private async execute(): Promise<{ data: Array<{ id: string }>; error: null }> {
    const rows = this.jobs.filter((job) => this.filters.every((f) => f(job)));
    if (this.patch) {
      for (const row of rows) Object.assign(row, this.patch, { updated_at: new Date().toISOString() });
    }
    return { data: this.selected ? rows.map((r) => ({ id: r.id })) : [], error: null };
  }

  then<TResult1 = { data: Array<{ id: string }>; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Array<{ id: string }>; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

function makeSupabase(
  handler: (fn: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>,
  opts: { jobs?: FakeJob[]; refundBehavior?: RefundBehavior } = {},
): {
  client: SupabaseClient;
  calls: Array<{ fn: string; args: Record<string, unknown> }>;
  jobs: FakeJob[];
} {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const jobs = opts.jobs ?? [];
  const refundBehavior = opts.refundBehavior ?? {};
  const refunded = new Set<string>();

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'refund_credits') {
        const jobId = String(args.p_job_id ?? '');
        const forcedErr = refundBehavior[jobId];
        if (forcedErr) return { data: null, error: { message: forcedErr } };
        if (refunded.has(jobId)) {
          return { data: null, error: { message: `ALREADY_REFUNDED: credits for job ${jobId}` } };
        }
        refunded.add(jobId);
        return { data: { ok: true }, error: null };
      }
      return await handler(fn, args);
    },
    from: (table: string) => {
      if (table !== 'generation_jobs') throw new Error(`unexpected table ${table}`);
      return new FakeQueryBuilder(jobs);
    },
  } as unknown as SupabaseClient;
  return { client, calls, jobs };
}

describe('shouldRunTick', () => {
  it('runs when idle and not stopped', () => {
    expect(shouldRunTick({ inFlight: false, stopped: false })).toBe(true);
  });
  it('skips when a previous tick is in-flight', () => {
    expect(shouldRunTick({ inFlight: true, stopped: false })).toBe(false);
  });
  it('skips when the reconciler has been stopped', () => {
    expect(shouldRunTick({ inFlight: false, stopped: true })).toBe(false);
  });
});

describe('reconcileStuckJobs', () => {
  it('calls the recover_stuck_jobs RPC with the configured threshold', async () => {
    const { client, calls } = makeSupabase(() => ({ data: 2, error: null }));
    const result = await reconcileStuckJobs(client, 7);
    expect(result).toEqual({ recovered: 2 });
    expect(calls).toEqual([{ fn: 'recover_stuck_jobs', args: { p_timeout_minutes: 7 } }]);
  });

  it('returns recovered=0 when the RPC reports zero', async () => {
    const { client } = makeSupabase(() => ({ data: 0, error: null }));
    const result = await reconcileStuckJobs(client, 5);
    expect(result).toEqual({ recovered: 0 });
  });

  it('returns an error string when the RPC fails (no throw)', async () => {
    const { client } = makeSupabase(() => ({ data: null, error: { message: 'pg: ssl handshake failed' } }));
    const result = await reconcileStuckJobs(client, 5);
    expect(result.recovered).toBe(0);
    expect(result.error).toMatch(/ssl handshake/);
  });

  it('coerces non-numeric data shapes to 0 instead of crashing', async () => {
    const { client } = makeSupabase(() => ({ data: 'unexpected', error: null }));
    const result = await reconcileStuckJobs(client, 5);
    expect(result.recovered).toBe(0);
  });
});

describe('reconcileSubmittedFastPath', () => {
  it('claims stale submitted jobs first, then settles refunds on a later pass', async () => {
    const staleId = '00000000-0000-0000-0000-000000000010';
    const freshId = '00000000-0000-0000-0000-000000000011';
    const now = Date.now();
    const { client, calls, jobs } = makeSupabase(
      () => ({ data: 0, error: null }),
      {
        jobs: [
          {
            id: staleId,
            status: 'submitted',
            webhook_checkpoint: 'none',
            updated_at: new Date(now - 10 * 60_000).toISOString(),
          },
          {
            id: freshId,
            status: 'submitted',
            webhook_checkpoint: 'none',
            updated_at: new Date(now - 2 * 60_000).toISOString(),
          },
        ],
      },
    );

    const first = await reconcileSubmittedFastPath(client, 5);
    expect(first).toMatchObject({
      recovered: 1,
      claimed: 1,
      refunded: 0,
      alreadyRefunded: 0,
      refundFailures: 0,
    });
    jobs.find((j) => j.id === staleId)!.updated_at = new Date(now - 10 * 60_000).toISOString();
    const second = await reconcileSubmittedFastPath(client, 5);
    expect(second).toMatchObject({
      recovered: 0,
      refunded: 1,
      alreadyRefunded: 0,
      refundFailures: 0,
    });
    expect(calls.filter((c) => c.fn === 'refund_credits')).toEqual([
      { fn: 'refund_credits', args: { p_job_id: staleId } },
    ]);
    const stale = jobs.find((j) => j.id === staleId)!;
    const fresh = jobs.find((j) => j.id === freshId)!;
    expect(stale.status).toBe('failed');
    expect(stale.webhook_checkpoint).toBe('failed');
    expect(stale.error_code).toBe('DISPATCH_FAILED');
    expect(fresh.status).toBe('submitted');
  });

  it('treats ALREADY_REFUNDED as idempotent success while finalizing pending rows', async () => {
    const jobId = '00000000-0000-0000-0000-000000000099';
    const { client, jobs } = makeSupabase(
      () => ({ data: 0, error: null }),
      {
        jobs: [
          {
            id: jobId,
            status: 'submitted',
            webhook_checkpoint: 'none',
            updated_at: new Date(Date.now() - 8 * 60_000).toISOString(),
          },
        ],
        refundBehavior: { [jobId]: `ALREADY_REFUNDED: credits for job ${jobId}` },
      },
    );

    const first = await reconcileSubmittedFastPath(client, 5);
    expect(first).toMatchObject({
      recovered: 1,
      claimed: 1,
      refunded: 0,
      alreadyRefunded: 0,
      refundFailures: 0,
    });
    jobs[0].updated_at = new Date(Date.now() - 8 * 60_000).toISOString();

    const second = await reconcileSubmittedFastPath(client, 5);
    expect(second).toMatchObject({
      recovered: 0,
      claimed: 0,
      refunded: 0,
      alreadyRefunded: 1,
      refundFailures: 0,
    });
    expect(jobs[0].error_code).toBe('DISPATCH_FAILED');
  });

  it('does not attempt a second refund on subsequent passes', async () => {
    const jobId = '00000000-0000-0000-0000-000000000123';
    const { client, calls, jobs } = makeSupabase(
      () => ({ data: 0, error: null }),
      {
        jobs: [
          {
            id: jobId,
            status: 'submitted',
            webhook_checkpoint: 'none',
            updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
          },
        ],
      },
    );

    const first = await reconcileSubmittedFastPath(client, 5);
    jobs[0].updated_at = new Date(Date.now() - 12 * 60_000).toISOString();
    const second = await reconcileSubmittedFastPath(client, 5);
    jobs[0].updated_at = new Date(Date.now() - 12 * 60_000).toISOString();
    const third = await reconcileSubmittedFastPath(client, 5);

    expect(first).toMatchObject({ recovered: 1, refunded: 0 });
    expect(second).toMatchObject({ recovered: 0, refunded: 1 });
    expect(third).toMatchObject({ recovered: 0, refunded: 0, alreadyRefunded: 0 });
    expect(calls.filter((c) => c.fn === 'refund_credits')).toEqual([
      { fn: 'refund_credits', args: { p_job_id: jobId } },
    ]);
  });
});

describe('startReconciler', () => {
  it('no-ops when disabled and never calls RPC', async () => {
    const { client, calls } = makeSupabase(() => ({ data: 99, error: null }));
    const handle = startReconciler({
      supabase: client,
      config: { enabled: false, intervalMs: 10, thresholdMinutes: 5, processingThresholdMinutes: 20 },
      log: () => {},
    });
    const tick = await handle.runNow();
    expect(tick).toBeNull();
    expect(calls).toHaveLength(0);
    handle.stop();
  });

  it('runs one pass via runNow() with the configured threshold', async () => {
    const staleId = '00000000-0000-0000-0000-000000000012';
    const { client, calls } = makeSupabase(
      () => ({ data: 3, error: null }),
      {
        jobs: [
          {
            id: staleId,
            status: 'submitted',
            webhook_checkpoint: 'none',
            updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
          },
        ],
      },
    );
    const handle = startReconciler({
      supabase: client,
      config: { enabled: true, intervalMs: 60_000, thresholdMinutes: 5, processingThresholdMinutes: 20 },
      log: () => {},
    });
    const tick = await handle.runNow();
    expect(tick).toEqual({ recovered: 4 });
    expect(calls).toEqual([
      { fn: 'recover_stuck_jobs', args: { p_timeout_minutes: 20 } },
    ]);
    handle.stop();
  });

  it('captures the error path through the log channel without throwing', async () => {
    const { client } = makeSupabase(() => ({ data: null, error: { message: 'rpc broken' } }));
    const logs: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
    const handle = startReconciler({
      supabase: client,
      config: { enabled: true, intervalMs: 60_000, thresholdMinutes: 5, processingThresholdMinutes: 20 },
      log: (msg, meta) => logs.push({ msg, meta }),
    });
    await handle.runNow();
    handle.stop();

    const errLog = logs.find((l) => l.msg === 'rpc failed');
    expect(errLog).toBeDefined();
    expect(errLog!.meta?.error).toBe('rpc broken');
  });

  it('honors the in-flight guard: a second runNow during a slow first tick yields null', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });

    let callCount = 0;
    const { client } = makeSupabase(
      async () => {
        callCount += 1;
        // First call hangs until the test releases the gate. The second
        // call should never get here because the in-flight guard skips it.
        if (callCount === 1) {
          await gate;
        }
        return { data: callCount, error: null };
      },
      { jobs: [] },
    );

    const handle = startReconciler({
      supabase: client,
      config: { enabled: true, intervalMs: 60_000, thresholdMinutes: 5, processingThresholdMinutes: 20 },
      log: () => {},
    });

    const inFlight = handle.runNow();
    const skipped = await handle.runNow();
    expect(skipped).toBeNull();

    release();
    await inFlight;
    expect(callCount).toBe(1);
    handle.stop();
  });
});
