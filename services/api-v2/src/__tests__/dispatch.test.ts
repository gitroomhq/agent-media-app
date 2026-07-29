// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Pure-helper tests for the Temporal dispatch surface.
 *
 * No mocking or stubbing of supabase/temporal — these tests exercise the
 * exported pure functions (`classifyDispatchError`, `buildWorkflowStartOptions`,
 * `withTimeout`) directly, which is where the resilience contracts live.
 */

import { describe, it, expect } from 'vitest';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import {
  classifyDispatchError,
  buildWorkflowStartOptions,
} from '../orchestrator/temporal/dispatch.js';
import { TimeoutError, withTimeout } from '../orchestrator/temporal/timeout.js';
import type { SelfieDispatchPayload } from '../orchestrator/temporal/types.js';
import type { TemporalConfig } from '../orchestrator/temporal/config.js';

const PAYLOAD: SelfieDispatchPayload = {
  job_id: '11111111-2222-3333-4444-555555555555',
  user_id: 'user-1',
  duration: 10,
  subtitles: true,
  callback_url: 'https://example.com/cb',
};

const CFG: TemporalConfig = {
  address: 'example.tmprl.cloud:7233',
  namespace: 'agent-media.test',
  tlsEnabled: true,
  taskQueue: 'selfie-v1',
  connectTimeoutMs: 10_000,
  startTimeoutMs: 10_000,
  workflowExecutionTimeoutMs: 20 * 60_000,
};

describe('classifyDispatchError', () => {
  it('treats WorkflowExecutionAlreadyStartedError as success (idempotency)', () => {
    const err = new WorkflowExecutionAlreadyStartedError(
      'already started',
      'selfie-x',
      'selfieV1Workflow',
    );
    const result = classifyDispatchError(err);
    expect(result).toEqual({ ok: true, alreadyRunning: true });
  });

  it('maps TimeoutError to a TIMEOUT failure result', () => {
    const result = classifyDispatchError(new TimeoutError('temporal.connect', 10_000));
    expect(result).toEqual({
      ok: false,
      code: 'TIMEOUT',
      message: 'temporal.connect timed out after 10000ms',
    });
  });

  it('maps "timed out" message strings to TIMEOUT even when not TimeoutError', () => {
    const result = classifyDispatchError(new Error('grpc deadline timed out'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TIMEOUT');
  });

  it('maps missing-env errors to a CONFIG failure (not retryable as transient)', () => {
    const result = classifyDispatchError(
      new Error('TEMPORAL_ADDRESS is required when ORCHESTRATOR_ENGINE=temporal'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONFIG');
  });

  it('falls back to UNAVAILABLE for unknown errors', () => {
    const result = classifyDispatchError(new Error('grpc unavailable: cluster down'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAVAILABLE');
  });

  it('does not misclassify generic temporal outage text as CONFIG', () => {
    const result = classifyDispatchError(new Error('temporal service unavailable'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAVAILABLE');
  });

  it('handles non-Error throws without crashing', () => {
    const result = classifyDispatchError('something string');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAVAILABLE');
      expect(result.message).toBe('something string');
    }
  });
});

describe('buildWorkflowStartOptions', () => {
  it('builds a stable workflow id prefix per job', () => {
    const opts = buildWorkflowStartOptions(PAYLOAD, CFG);
    expect(opts.workflowId).toBe(`selfie-${PAYLOAD.job_id}`);
  });

  it('uses the configured task queue', () => {
    const opts = buildWorkflowStartOptions(PAYLOAD, { ...CFG, taskQueue: 'selfie-canary' });
    expect(opts.taskQueue).toBe('selfie-canary');
  });

  it('caps both workflow execution and run lifetime', () => {
    const opts = buildWorkflowStartOptions(PAYLOAD, CFG);
    expect(opts.workflowExecutionTimeout).toBe(CFG.workflowExecutionTimeoutMs);
    expect(opts.workflowRunTimeout).toBe(CFG.workflowExecutionTimeoutMs);
  });

  it('forwards the payload as a single-arg tuple', () => {
    const opts = buildWorkflowStartOptions(PAYLOAD, CFG);
    expect(opts.args).toEqual([PAYLOAD]);
  });
});

describe('withTimeout', () => {
  it('resolves with the underlying promise value when fast', async () => {
    const value = await withTimeout(Promise.resolve('ok'), 1000, 'test.fast');
    expect(value).toBe('ok');
  });

  it('rejects with TimeoutError when the promise is too slow', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 100));
    await expect(withTimeout(slow, 10, 'test.slow')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not wrap when ms is zero or negative (defensive bypass)', async () => {
    const value = await withTimeout(Promise.resolve(42), 0, 'test.bypass');
    expect(value).toBe(42);
  });

  it('propagates the underlying rejection unchanged', async () => {
    const err = new Error('boom');
    await expect(withTimeout(Promise.reject(err), 1000, 'test.err')).rejects.toBe(err);
  });
});
