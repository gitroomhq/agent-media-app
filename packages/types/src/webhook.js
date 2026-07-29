// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Numeric ordering of webhook checkpoints for idempotent comparison.
 * Used by the `update_job_checkpoint` stored procedure.
 */
export const WEBHOOK_CHECKPOINT_ORDER = {
    none: 0,
    received: 1,
    processing: 2,
    media_received: 3,
    completed: 4,
    failed: 5,
};
//# sourceMappingURL=webhook.js.map