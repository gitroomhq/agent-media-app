// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { proxyActivities } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import { failureInfo } from './failure-info.js';
import type {
  SimpleSelfieActivityInput,
  SimpleSelfieActivityResult,
} from '../activities/simple-selfie.js';

const { simpleSelfie } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '5 minutes',
  retry: {
    initialInterval: '10s',
    maximumInterval: '2m',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: [
      'INVALID_INPUT',
      'BUDGET_CAP_PRIMITIVE',
      'BUDGET_CAP_DAY',
      'REFERENCE_URL_NOT_ALLOWED',
      'PROVIDER_UNCONFIGURED',
      'EVOLINK_400',
      'EVOLINK_401',
      'EVOLINK_403',
      'EVOLINK_404',
      'EVOLINK_413',
      'EVOLINK_415',
      'EVOLINK_422',
      'EVOLINK_451',
      'INSUFFICIENT_CREDITS',
    ],
  },
});

// Quick, reliable compensation: refund the user's credits if the render
// terminally fails. Short timeout + a few retries (it's a single DB RPC).
const { refundCredits, markPrimitiveRunFailed } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function simpleSelfieWorkflow(
  input: SimpleSelfieActivityInput,
): Promise<SimpleSelfieActivityResult> {
  try {
    return await simpleSelfie(input);
  } catch (err) {
    // Terminal failure (all retries exhausted, or a non-retryable error):
    // return the user's credits. Idempotent (refund_credits guards
    // ALREADY_REFUNDED), so it's safe even if the activity's own nonRetryable
    // catch already refunded. This closes the "~280 credits for a video that
    // never rendered" gap.
    await refundCredits({ primitive_run_id: input.primitive_run_id });
    // Stamp the row FAILED (guarded: never clobbers 'succeeded') so the run is
    // never stuck on 'submitted' and the web can show the real error (e.g.
    // INSUFFICIENT_CREDITS -> a clear out-of-credits message + buy CTA).
    const f = failureInfo(err);
    await markPrimitiveRunFailed({ primitive_run_id: input.primitive_run_id, error_code: f.code, error_message: f.message });
    throw err;
  }
}
