// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { proxyActivities } from '@temporalio/workflow';
import type { SelfieDispatchPayload } from './types.js';
import type { TemporalActivities } from './activities.js';

const { dispatchSelfieToMediaWorker } = proxyActivities<TemporalActivities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '2s',
    maximumInterval: '20s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

/**
 * Sprint-1 Temporal workflow: durable dispatch handoff.
 * The media worker + webhook-provider remain the execution/status path.
 */
export async function selfieV1Workflow(payload: SelfieDispatchPayload): Promise<void> {
  await dispatchSelfieToMediaWorker(payload);
}
