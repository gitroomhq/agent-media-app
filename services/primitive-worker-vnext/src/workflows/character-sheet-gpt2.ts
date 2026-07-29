// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { proxyActivities } from '@temporalio/workflow';
import type { PrimitiveActivities } from '../activities/index.js';
import { failureInfo } from './failure-info.js';
import type {
  CharacterSheetGpt2ActivityInput,
  CharacterSheetGpt2ActivityResult,
} from '../activities/character-sheet-gpt2.js';

const { characterSheetGpt2 } = proxyActivities<PrimitiveActivities>({
  // See portrait-gpt2 workflow. startToClose must be >= the OpenAI client
  // timeout (now 300s) + overhead so a slow-but-legit generation survives (Bug 4).
  startToCloseTimeout: '6 minutes',
  heartbeatTimeout: '120 seconds',
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

// Refund on terminal failure so a paid render that never completes returns the
// user's credits. Idempotent (refund_credits guards ALREADY_REFUNDED /
// NO_DEDUCTION_FOUND), so it never double-refunds or throws.
const { refundCredits, markPrimitiveRunFailed } = proxyActivities<PrimitiveActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '2s', maximumInterval: '20s', backoffCoefficient: 2, maximumAttempts: 5 },
});

export async function characterSheetGpt2Workflow(
  input: CharacterSheetGpt2ActivityInput,
): Promise<CharacterSheetGpt2ActivityResult> {
  try {
    return await characterSheetGpt2(input);
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
