// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Cancel must not strand charged credits.
//
// Temporal's `terminate()` kills a workflow without running its catch block, so
// the compensation a *failed* run relies on never executes. Before this fix,
// canceling after a paid primitive completed left the debit in place on a run
// reported as "canceled" — and the already-terminal guard on the cancel route
// meant no later attempt could ever refund it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PrimitiveRow {
  id: string;
  credits_deducted: number | null;
}

let ROWS: PrimitiveRow[] = [];
let LOOKUP_ERROR: { message: string } | null = null;
/** primitive_run id -> error the refund RPC should return for it. */
let RPC_ERRORS: Record<string, string> = {};
let rpcCalls: string[] = [];

/** Chainable stub: .select().eq() resolves to the seeded rows. */
function makeQuery() {
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  Object.assign(qb, {
    select: vi.fn(chain),
    eq: vi.fn(() => Promise.resolve({ data: ROWS, error: LOOKUP_ERROR })),
  });
  return qb;
}

const rpcSpy = vi.fn(async (_fn: string, args: { p_job_id: string }) => {
  rpcCalls.push(args.p_job_id);
  const msg = RPC_ERRORS[args.p_job_id];
  return msg ? { data: null, error: { message: msg } } : { data: {}, error: null };
});

vi.mock('../server.js', () => ({
  supabase: { from: vi.fn(() => makeQuery()), rpc: rpcSpy },
}));

const { refundSkillRunCharges } = await import('../routes/v1/skills.js');

beforeEach(() => {
  ROWS = [];
  LOOKUP_ERROR = null;
  RPC_ERRORS = {};
  rpcCalls = [];
  rpcSpy.mockClear();
});

describe('refundSkillRunCharges', () => {
  it('refunds every charged primitive under the run', async () => {
    ROWS = [
      { id: 'p-selfie', credits_deducted: 280 },
      { id: 'p-subs', credits_deducted: 15 },
    ];
    const r = await refundSkillRunCharges('run-1');
    expect(r).toEqual({ charged: 2, refunded: 2 });
    expect(rpcCalls.sort()).toEqual(['p-selfie', 'p-subs']);
  });

  it('THE REGRESSION: a completed paid primitive is refunded, not stranded', async () => {
    // Paid selfie succeeded, user cancels before composition finishes.
    ROWS = [
      { id: 'p-portrait', credits_deducted: 0 },
      { id: 'p-selfie', credits_deducted: 280 },
    ];
    const r = await refundSkillRunCharges('run-2');
    expect(r.refunded).toBe(1);
    expect(rpcCalls).toEqual(['p-selfie']);
  });

  it('skips zero-credit and null primitives without calling the RPC', async () => {
    ROWS = [
      { id: 'p-portrait', credits_deducted: 0 },
      { id: 'p-sheet-in-video', credits_deducted: null },
    ];
    const r = await refundSkillRunCharges('run-3');
    expect(r).toEqual({ charged: 0, refunded: 0 });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('treats ALREADY_REFUNDED as success — cancel stays idempotent', async () => {
    ROWS = [{ id: 'p-selfie', credits_deducted: 280 }];
    RPC_ERRORS = { 'p-selfie': 'ALREADY_REFUNDED: credits for job ... already refunded' };
    const r = await refundSkillRunCharges('run-4');
    expect(r).toEqual({ charged: 1, refunded: 0 });
  });

  it('treats NO_DEDUCTION_FOUND as success', async () => {
    ROWS = [{ id: 'p-selfie', credits_deducted: 280 }];
    RPC_ERRORS = { 'p-selfie': 'NO_DEDUCTION_FOUND: no debit transactions found for job ...' };
    await expect(refundSkillRunCharges('run-5')).resolves.toEqual({ charged: 1, refunded: 0 });
  });

  it('THROWS on a real RPC failure so the run stays cancellable and retryable', async () => {
    ROWS = [{ id: 'p-selfie', credits_deducted: 280 }];
    RPC_ERRORS = { 'p-selfie': 'could not serialize access due to concurrent update' };
    await expect(refundSkillRunCharges('run-6')).rejects.toThrow(/refund_credits failed/);
  });

  it('throws when the primitive_runs lookup itself fails', async () => {
    LOOKUP_ERROR = { message: 'connection reset' };
    await expect(refundSkillRunCharges('run-7')).rejects.toThrow(/primitive_runs lookup failed/);
  });

  it('is a no-op for a run with no primitives', async () => {
    ROWS = [];
    await expect(refundSkillRunCharges('run-8')).resolves.toEqual({ charged: 0, refunded: 0 });
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('keeps refunding after an idempotent skip (one bad row cannot mask the rest)', async () => {
    ROWS = [
      { id: 'p-a', credits_deducted: 140 },
      { id: 'p-b', credits_deducted: 280 },
      { id: 'p-c', credits_deducted: 15 },
    ];
    RPC_ERRORS = { 'p-b': 'ALREADY_REFUNDED: ...' };
    const r = await refundSkillRunCharges('run-9');
    expect(r).toEqual({ charged: 3, refunded: 2 });
    expect(rpcCalls).toEqual(['p-a', 'p-b', 'p-c']);
  });
});
