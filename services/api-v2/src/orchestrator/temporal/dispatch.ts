// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Dispatch helper for the selfie Temporal workflow.
 *
 * Failure model — the request handler MUST be able to decide between three
 * outcomes synchronously:
 *
 *   1. `ok`         — workflow accepted by Temporal (or already running for
 *                     the same id, which is treated as success because the
 *                     prior workflow will drive the same job to terminal).
 *   2. `unavailable`— Temporal client/connection/start RPC failed or timed
 *                     out. The caller should refund + 503.
 *   3. `invalid`    — Temporal config rejected the request (e.g. missing
 *                     env). The caller should refund + 503 with config
 *                     code; logging upstream owns alerting.
 *
 * Why a structured result instead of throw:
 *   - Lets `selfie.ts` keep one refund-on-failure code path that handles
 *     timeouts, gRPC errors, and config errors identically.
 *   - Makes the dispatch path unit-testable as a pure mapping (no Temporal
 *     SDK calls in the test surface).
 */

import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import type { Client } from '@temporalio/client';
import { getTemporalClient } from './client.js';
import { getTemporalConfig, type TemporalConfig } from './config.js';
import type { SelfieDispatchPayload } from './types.js';
import { TimeoutError, withTimeout } from './timeout.js';

export type DispatchResult =
  | { ok: true; alreadyRunning: boolean }
  | { ok: false; code: 'TIMEOUT' | 'UNAVAILABLE' | 'CONFIG'; message: string };

export interface DispatchDeps {
  /** Override for unit testing — defaults to the singleton temporal client. */
  resolveClient?: () => Promise<Client>;
  /** Override for unit testing — defaults to env-driven config. */
  resolveConfig?: () => TemporalConfig;
}

/**
 * Translate an unknown thrown value into a DispatchResult.
 * Exposed for direct unit tests so we cover the error-classification logic
 * without booting Temporal.
 */
export function classifyDispatchError(err: unknown): DispatchResult {
  if (err instanceof WorkflowExecutionAlreadyStartedError) {
    return { ok: true, alreadyRunning: true };
  }
  if (err instanceof TimeoutError) {
    return { ok: false, code: 'TIMEOUT', message: err.message };
  }
  // gRPC error from Temporal client typically has a `code` (number) and `details`.
  // We don't depend on the proto types here — a name match is sufficient.
  if (err instanceof Error) {
    const name = err.name ?? '';
    const msg = err.message ?? String(err);
    const normalized = msg.trim().toUpperCase();
    // Config faults are deterministic and non-retryable; keep this check
    // tight so generic infra outages don't get mislabeled as CONFIG.
    if (/^TEMPORAL_[A-Z0-9_]+(?:\b|:)/.test(normalized)) {
      return { ok: false, code: 'CONFIG', message: msg };
    }
    if (name === 'TimeoutError' || /timed out/i.test(msg)) {
      return { ok: false, code: 'TIMEOUT', message: msg };
    }
    return { ok: false, code: 'UNAVAILABLE', message: msg };
  }
  return { ok: false, code: 'UNAVAILABLE', message: String(err) };
}

/**
 * Build the options dict passed to `client.workflow.start`.
 * Pure for unit testing; production callers should let `dispatchSelfieWorkflow`
 * compose the full args list.
 */
export function buildWorkflowStartOptions(payload: SelfieDispatchPayload, cfg: TemporalConfig): {
  workflowId: string;
  taskQueue: string;
  workflowExecutionTimeout: number;
  workflowRunTimeout: number;
  args: [SelfieDispatchPayload];
} {
  return {
    workflowId: `selfie-${payload.job_id}`,
    taskQueue: cfg.taskQueue,
    // Ceiling for the workflow lifetime (one attempt + activity retries).
    workflowExecutionTimeout: cfg.workflowExecutionTimeoutMs,
    // We have a single workflow run; cap that too so a hung activity can't
    // keep the workflow alive longer than the execution ceiling.
    workflowRunTimeout: cfg.workflowExecutionTimeoutMs,
    args: [payload],
  };
}

/**
 * Submit the selfie workflow to Temporal with bounded latency.
 *
 * All thrown errors are converted to a `DispatchResult`. The caller never
 * needs to wrap this in try/catch for normal failure modes.
 */
export async function dispatchSelfieWorkflow(
  payload: SelfieDispatchPayload,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  let cfg: TemporalConfig;
  try {
    cfg = (deps.resolveConfig ?? getTemporalConfig)();
  } catch (err) {
    return classifyDispatchError(err);
  }

  let client: Client;
  try {
    client = await (deps.resolveClient ?? getTemporalClient)();
  } catch (err) {
    return classifyDispatchError(err);
  }

  const options = buildWorkflowStartOptions(payload, cfg);

  try {
    await withTimeout(
      client.workflow.start('selfieV1Workflow', options),
      cfg.startTimeoutMs,
      'temporal.workflow.start',
    );
    return { ok: true, alreadyRunning: false };
  } catch (err) {
    return classifyDispatchError(err);
  }
}
