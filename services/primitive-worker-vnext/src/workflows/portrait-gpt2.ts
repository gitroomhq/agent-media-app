// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { proxyActivities } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import type {
  PortraitGpt2ActivityInput,
  PortraitGpt2ActivityResult,
} from '../activities/portrait-gpt2.js';

const { portraitGpt2 } = proxyActivities<PrimitiveActivities>({
  // withHeartbeat() fires every 15s during the gpt-image-2 await, so 120s
  // heartbeatTimeout is safe once the event loop isn't saturated (concurrency
  // cap, see worker.ts). startToClose must be >= the OpenAI client timeout
  // (now 300s) + overhead, else the activity is killed before a healthy
  // slow-but-legit generation can finish (Bug 4). 6 min gives clear headroom.
  startToCloseTimeout: '6 minutes',
  heartbeatTimeout: '120 seconds',
  retry: {
    initialInterval: '5s',
    maximumInterval: '60s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    // Non-retryable failure types raised in the Activity.
    nonRetryableErrorTypes: [
      'INVALID_INPUT',
      'BUDGET_CAP_PRIMITIVE',
      'BUDGET_CAP_DAY',
      'REFERENCE_FETCH_FAILED',
      'REFERENCE_NOT_IMAGE',
      'REFERENCE_URL_NOT_ALLOWED',
      'OPENAI_400',
      'OPENAI_401',
      'OPENAI_403',
      'OPENAI_404',
      'OPENAI_413',
      'OPENAI_415',
      'OPENAI_422',
      'OPENAI_451',
    ],
  },
});

export async function portraitGpt2Workflow(
  input: PortraitGpt2ActivityInput,
): Promise<PortraitGpt2ActivityResult> {
  return portraitGpt2(input);
}
