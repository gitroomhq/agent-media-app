// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { proxyActivities } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import { failureInfo } from './failure-info.js';
import type {
  SubtitlesActivityInput,
  SubtitlesActivityResult,
} from '../activities/subtitles.js';

const { subtitles } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '90 seconds',
  retry: {
    initialInterval: '5s',
    maximumInterval: '60s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: [
      'INVALID_INPUT',
      'BUDGET_CAP_PRIMITIVE',
      'BUDGET_CAP_DAY',
      'REFERENCE_FETCH_FAILED',
      'REFERENCE_NOT_VIDEO',
      'REFERENCE_URL_NOT_ALLOWED',
      'TRANSCRIBE_EMPTY',
      'OPENAI_400',
      'OPENAI_401',
      'OPENAI_403',
      'OPENAI_404',
      'OPENAI_413',
      'OPENAI_415',
      'OPENAI_422',
      'OPENAI_451',
      'INSUFFICIENT_CREDITS',
    ],
  },
});

// Refund on terminal failure so a paid render that never completes returns the
// user's credits. Idempotent (refund_credits guards ALREADY_REFUNDED /
// NO_DEDUCTION_FOUND), so it never double-refunds or throws.
const { refundCredits, markPrimitiveRunFailed } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function subtitlesWorkflow(
  input: SubtitlesActivityInput,
): Promise<SubtitlesActivityResult> {
  try {
    return await subtitles(input);
  } catch (err) {
    await refundCredits({ primitive_run_id: input.primitive_run_id });
    // Stamp the row FAILED (guarded: never clobbers 'succeeded') so the run is
    // never stuck on 'submitted' and the web can show the real error (e.g.
    // INSUFFICIENT_CREDITS -> a clear out-of-credits message + buy CTA).
    const f = failureInfo(err);
    await markPrimitiveRunFailed({ primitive_run_id: input.primitive_run_id, error_code: f.code, error_message: f.message });
    throw err;
  }
}
