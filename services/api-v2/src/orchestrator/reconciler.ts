// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Stuck-job reconciler.
 *
 * Why this exists:
 *   The Temporal handoff path can deposit a job in `status='submitted',
 *   webhook_checkpoint='none'` and never advance it if (a) the workflow
 *   was never picked up by a worker, (b) all activity retries failed
 *   without our workflow updating Supabase, or (c) a dispatch error
 *   escaped the route's refund path. The existing pg_cron sweeper runs
 *   only every 5 minutes and the 2026-04-28 migration widened the
 *   submitted-state grace window to ≥60 minutes — too lax for a Temporal
 *   handoff failure mode.
 *
 *   This in-process reconciler calls the SAME `public.recover_stuck_jobs`
 *   RPC the pg_cron job uses, just at a tighter cadence and threshold.
 *   No new schema, no duplicated refund logic, idempotent by construction
 *   (the RPC and `refund_credits` both guard against double-action).
 *
 * Safety:
 *   - All errors are caught and logged; the interval keeps running.
 *   - One run-in-flight at a time (re-entrancy guard) so a slow RPC
 *     can't stack callbacks.
 *   - `setInterval` is `.unref()`'d so it does not keep the process alive
 *     during shutdown.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getReconcilerConfig, type ReconcilerConfig } from './temporal/config.js';

const DISPATCH_FAILED_PENDING_REFUND = 'DISPATCH_FAILED_PENDING_REFUND';
const DISPATCH_FAILED_REFUNDING = 'DISPATCH_FAILED_REFUNDING';
const DISPATCH_FAILED_FINAL = 'DISPATCH_FAILED';

export interface ReconcileResult {
  recovered: number;
  error?: string;
}

/**
 * Pure: decide whether a tick should run. Exposed for unit testing.
 * Returns false when a previous run is still in-flight.
 */
export function shouldRunTick(state: { inFlight: boolean; stopped: boolean }): boolean {
  return !state.inFlight && !state.stopped;
}

/**
 * One reconciliation pass. Calls `recover_stuck_jobs(threshold)` and
 * returns the count from the RPC. Errors are returned, not thrown, so
 * callers can decide whether to log/alert.
 */
export async function reconcileStuckJobs(
  supabase: SupabaseClient,
  thresholdMinutes: number,
): Promise<ReconcileResult> {
  const { data, error } = await supabase.rpc('recover_stuck_jobs', {
    p_timeout_minutes: thresholdMinutes,
  });
  if (error) {
    return { recovered: 0, error: error.message };
  }
  // recover_stuck_jobs returns an integer; supabase-js surfaces it as a
  // scalar in `data`.
  const recovered = typeof data === 'number' ? data : Number(data ?? 0) || 0;
  return { recovered };
}

function thresholdToIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function isAlreadyRefundedMessage(message: string | undefined): boolean {
  return /ALREADY_REFUNDED/i.test(message ?? '');
}

export interface SubmittedFastPathResult {
  recovered: number;
  claimed: number;
  refunded: number;
  alreadyRefunded: number;
  refundFailures: number;
  error?: string;
}

/**
 * Fast-path recovery for stale `submitted` jobs. This intentionally bypasses
 * the DB RPC's 60-minute floor for `submitted` by doing a narrow app-side
 * claim + refund flow:
 *   1) Claim stale submitted jobs into `failed` + `DISPATCH_FAILED_PENDING_REFUND`
 *   2) Refund rows with that pending code (including leftovers from prior crashes)
 *   3) Finalize to `DISPATCH_FAILED` only after refund success/idempotent already-refunded
 */
export async function reconcileSubmittedFastPath(
  supabase: SupabaseClient,
  thresholdMinutes: number,
): Promise<SubmittedFastPathResult> {
  const cutoff = thresholdToIso(thresholdMinutes);
  const pendingMessage = `Dispatch handoff timed out after ${thresholdMinutes} minutes`;

  const { data: claimedRows, error: claimErr } = await supabase
    .from('generation_jobs')
    .update({
      status: 'failed',
      error_code: DISPATCH_FAILED_PENDING_REFUND,
      error_message: pendingMessage,
      webhook_checkpoint: 'failed',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'submitted')
    .eq('webhook_checkpoint', 'none')
    .lt('updated_at', cutoff)
    .select('id');

  if (claimErr) {
    return {
      recovered: 0,
      claimed: 0,
      refunded: 0,
      alreadyRefunded: 0,
      refundFailures: 0,
      error: claimErr.message,
    };
  }

  // Recover previously-claimed rows from interrupted runs.
  const { error: resetErr } = await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_PENDING_REFUND })
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_REFUNDING)
    .lt('updated_at', cutoff)
    .select('id');

  if (resetErr) {
    return {
      recovered: (claimedRows ?? []).length,
      claimed: (claimedRows ?? []).length,
      refunded: 0,
      alreadyRefunded: 0,
      refundFailures: 0,
      error: `reset-refunding: ${resetErr.message}`,
    };
  }

  // Claim pending-refund rows so only this reconciler run settles them.
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('generation_jobs')
    .update({ error_code: DISPATCH_FAILED_REFUNDING })
    .eq('status', 'failed')
    .eq('error_code', DISPATCH_FAILED_PENDING_REFUND)
    .lt('updated_at', cutoff)
    .select('id');

  if (pendingErr) {
    return {
      recovered: 0,
      claimed: (claimedRows ?? []).length,
      refunded: 0,
      alreadyRefunded: 0,
      refundFailures: 0,
      error: pendingErr.message,
    };
  }

  let refunded = 0;
  let alreadyRefunded = 0;
  let refundFailures = 0;
  const errors: string[] = [];

  for (const row of pendingRows ?? []) {
    const jobId = String((row as { id: string }).id);
    const { error: refundErr } = await supabase.rpc('refund_credits', { p_job_id: jobId });

    if (refundErr) {
      if (isAlreadyRefundedMessage(refundErr.message)) {
        alreadyRefunded += 1;
      } else {
        refundFailures += 1;
        errors.push(`refund(${jobId}): ${refundErr.message}`);
        const { error: rollbackErr } = await supabase
          .from('generation_jobs')
          .update({ error_code: DISPATCH_FAILED_PENDING_REFUND })
          .eq('id', jobId)
          .eq('status', 'failed')
          .eq('error_code', DISPATCH_FAILED_REFUNDING);
        if (rollbackErr) {
          errors.push(`rollback(${jobId}): ${rollbackErr.message}`);
        }
        continue;
      }
    } else {
      refunded += 1;
    }

    const { error: finalizeErr } = await supabase
      .from('generation_jobs')
      .update({ error_code: DISPATCH_FAILED_FINAL })
      .eq('id', jobId)
      .eq('status', 'failed')
      .eq('error_code', DISPATCH_FAILED_REFUNDING);
    if (finalizeErr) {
      errors.push(`finalize(${jobId}): ${finalizeErr.message}`);
    }
  }

  return {
    recovered: (claimedRows ?? []).length,
    claimed: (claimedRows ?? []).length,
    refunded,
    alreadyRefunded,
    refundFailures,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
}

export interface ReconcilerHandle {
  stop: () => void;
  /** Exposed for tests: force a tick now (still respects in-flight guard). */
  runNow: () => Promise<ReconcileResult | null>;
}

export interface StartReconcilerOptions {
  supabase: SupabaseClient;
  config?: ReconcilerConfig;
  /** Logger override — defaults to console. Pure injection so tests can capture. */
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Start the reconciler interval. Returns a handle with `stop()` to cancel.
 * No-op (and returns a handle anyway) when `config.enabled === false` so
 * callers don't need to branch.
 */
export function startReconciler(opts: StartReconcilerOptions): ReconcilerHandle {
  const cfg = opts.config ?? getReconcilerConfig();
  const log = opts.log ?? ((msg, meta) =>
    meta ? console.log(`[reconciler] ${msg}`, meta) : console.log(`[reconciler] ${msg}`));

  const state = { inFlight: false, stopped: false };

  if (!cfg.enabled) {
    log('disabled (ORCHESTRATOR_RECONCILER_ENABLED=false or engine!=temporal)');
    return { stop: () => { state.stopped = true; }, runNow: async () => null };
  }

  const tick = async (): Promise<ReconcileResult | null> => {
    if (!shouldRunTick(state)) return null;
    state.inFlight = true;
    try {
      const fastPath = await reconcileSubmittedFastPath(opts.supabase, cfg.thresholdMinutes);
      if (fastPath.error) {
        log('submitted fast-path issues', {
          error: fastPath.error,
          thresholdMinutes: cfg.thresholdMinutes,
          claimed: fastPath.claimed,
          refunded: fastPath.refunded,
          alreadyRefunded: fastPath.alreadyRefunded,
          refundFailures: fastPath.refundFailures,
        });
      } else if (fastPath.recovered > 0 || fastPath.alreadyRefunded > 0) {
        log('submitted fast-path settled jobs', {
          recovered: fastPath.recovered,
          refunded: fastPath.refunded,
          alreadyRefunded: fastPath.alreadyRefunded,
          thresholdMinutes: cfg.thresholdMinutes,
        });
      }

      const result = await reconcileStuckJobs(opts.supabase, cfg.processingThresholdMinutes);
      if (result.error) {
        log('rpc failed', {
          error: result.error,
          thresholdMinutes: cfg.processingThresholdMinutes,
        });
      } else if (result.recovered > 0) {
        log('recovered stuck jobs', {
          recovered: result.recovered,
          thresholdMinutes: cfg.processingThresholdMinutes,
        });
      }
      return { recovered: fastPath.recovered + result.recovered, ...(result.error ? { error: result.error } : {}) };
    } catch (err) {
      log('tick threw', { error: err instanceof Error ? err.message : String(err) });
      return { recovered: 0, error: err instanceof Error ? err.message : String(err) };
    } finally {
      state.inFlight = false;
    }
  };

  log('started', {
    intervalMs: cfg.intervalMs,
    thresholdMinutes: cfg.thresholdMinutes,
    processingThresholdMinutes: cfg.processingThresholdMinutes,
  });
  const handle = setInterval(() => { void tick(); }, cfg.intervalMs);
  // Don't block process shutdown on the timer.
  if (typeof handle.unref === 'function') handle.unref();

  return {
    stop: () => {
      state.stopped = true;
      clearInterval(handle);
      log('stopped');
    },
    runNow: tick,
  };
}
