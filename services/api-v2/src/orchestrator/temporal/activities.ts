// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { SelfieDispatchPayload } from './types.js';

interface ActivitiesContext {
  workerV2Url: string;
  workerSecret: string;
}

/**
 * Temporal activity set for selfie workflow.
 * Activities run outside workflow isolate and can perform network I/O.
 */
export function createTemporalActivities(ctx: ActivitiesContext) {
  return {
    async dispatchSelfieToMediaWorker(payload: SelfieDispatchPayload): Promise<void> {
      const resp = await fetch(`${ctx.workerV2Url}/v2/selfie`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': ctx.workerSecret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(
          `media-worker-v2 dispatch failed (${resp.status}): ${body.slice(0, 500)}`,
        );
      }
    },
  };
}

export type TemporalActivities = ReturnType<typeof createTemporalActivities>;
