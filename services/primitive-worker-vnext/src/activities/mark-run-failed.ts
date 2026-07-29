// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Mark a primitive_runs row terminally FAILED.
 *
 * Standalone primitive workflows (simple_selfie, product_in_hands, …) previously
 * refunded on terminal failure but never updated the row — so a run that died
 * (e.g. INSUFFICIENT_CREDITS mid-burst) sat on status='submitted' forever and the
 * web showed an eternally-pending job instead of the real error. Composed skills
 * don't have this gap (composedSkillState stamps skill_runs); this closes it for
 * the primitive-level rows.
 *
 * Guarded: never clobbers a row that already reached 'succeeded'.
 */

import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';

export interface MarkRunFailedInput {
  primitive_run_id: string;
  error_code?: string;
  error_message?: string;
}

export function makeMarkPrimitiveRunFailedActivity(cfg: WorkerConfig) {
  return async function markPrimitiveRunFailed(input: MarkRunFailedInput): Promise<void> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);
    const { error } = await db
      .from('primitive_runs')
      .update({
        status: 'failed',
        error_code: (input.error_code ?? 'FAILED').slice(0, 80),
        error_message: (input.error_message ?? '').slice(0, 500) || null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', input.primitive_run_id)
      .neq('status', 'succeeded');
    if (error) throw new Error(`mark run failed update failed: ${error.message}`);
  };
}
