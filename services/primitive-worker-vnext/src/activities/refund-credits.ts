// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';
import { refundPrimitiveCredits } from '../client/credits.js';

export interface RefundCreditsActivityInput {
  primitive_run_id: string;
}

/**
 * Compensation activity: refund whatever credits were deducted for a primitive
 * run. Used by workflows in a catch so a run that TERMINALLY fails (all retries
 * exhausted, or a non-retryable error) returns the user's credits — closing the
 * "~200 credits for a video that never rendered" gap.
 *
 * Safe by construction:
 *   - refund_credits() is idempotent: it raises ALREADY_REFUNDED if a refund
 *     row already exists (so calling it after the activity-level nonRetryable
 *     refund is a harmless no-op), and NO_DEDUCTION_FOUND if nothing was
 *     charged. refundPrimitiveCredits() swallows both, so this never throws.
 *   - It must only be invoked on a TERMINALLY-failed run (a workflow catch),
 *     never per-attempt — refunding mid-retry would give away a free render if
 *     a later attempt succeeds.
 */
export function makeRefundCreditsActivity(cfg: WorkerConfig) {
  return async function refundCredits(input: RefundCreditsActivityInput): Promise<void> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);
    await refundPrimitiveCredits(db, input.primitive_run_id);
  };
}
