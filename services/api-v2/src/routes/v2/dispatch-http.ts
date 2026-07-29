// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * HTTP dispatch helper for the legacy `engine === 'http'` selfie path.
 *
 * Extracted from `selfie.ts` so the dispatch contract (await, timeout,
 * non-2xx → throw) can be exercised by tests against a real local HTTP
 * server without mocking. Mirrors the Temporal activity contract in
 * `orchestrator/temporal/activities.ts`.
 *
 * Throws on any non-2xx, network error, or timeout — callers MUST treat
 * a thrown error as a dispatch failure and mark the job failed + refund.
 */

import type { SelfieDispatchPayload } from '../../orchestrator/temporal/types.js';

const DEFAULT_DISPATCH_TIMEOUT_MS = 30_000;

export async function dispatchSelfieToHttpWorker(
  workerV2Url: string,
  workerSecret: string,
  payload: SelfieDispatchPayload,
  timeoutMs: number = DEFAULT_DISPATCH_TIMEOUT_MS,
): Promise<void> {
  const resp = await fetch(`${workerV2Url}/v2/selfie`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': workerSecret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(
      `media-worker-v2 dispatch failed (${resp.status}): ${body.slice(0, 500)}`,
    );
  }
}
