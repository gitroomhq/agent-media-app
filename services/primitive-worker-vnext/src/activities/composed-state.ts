// Copyright 2026 agent-media contributors. Apache-2.0 license.

import * as Sentry from '@sentry/node';
import type { WorkerConfig } from '../config.js';
import { getDb } from '../client/db.js';

export interface ComposedSkillStateInput {
  skill_run_id: string;
  status?: 'submitted' | 'running' | 'succeeded' | 'failed' | 'canceled';
  current_step?: string;
  started_at_now?: boolean;
  finished_at_now?: boolean;
  final_output?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
}

export function makeComposedSkillStateActivity(cfg: WorkerConfig) {
  return async function composedSkillState(input: ComposedSkillStateInput): Promise<void> {
    const db = getDb(cfg.supabase.url, cfg.supabase.serviceRoleKey);
    const patch: Record<string, unknown> = {};
    if (input.status) patch.status = input.status;
    if (input.current_step) patch.current_step = input.current_step;
    if (input.started_at_now) patch.started_at = new Date().toISOString();
    if (input.finished_at_now) patch.finished_at = new Date().toISOString();
    if (input.final_output) patch.final_output = input.final_output;
    if (input.error_code) patch.error_code = input.error_code;
    if (input.error_message) patch.error_message = input.error_message;
    if (Object.keys(patch).length === 0) return;
    const { error } = await db.from('skill_runs').update(patch).eq('id', input.skill_run_id);
    if (error) throw new Error(`skill_runs update failed: ${error.message}`);

    // #40: surface persisted run failures in Sentry. Activity throws are
    // already captured (#38), but a run RECORDED as failed (with a classified
    // error_code) doesn't throw — so we report it here, next to the crashes.
    if (input.status === 'failed') {
      const code = input.error_code ?? 'UNKNOWN';
      // Put a slice of the real error_message IN the title so the failure is
      // diagnosable from the issue list (it was only in `extra` before, showing
      // as "WORKFLOW_FAILED / no message"). Pin the fingerprint to the code +
      // step so adding the variable detail doesn't fragment grouping.
      const detail = (input.error_message ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      Sentry.captureMessage(`skill_run failed: ${code}${detail ? ` — ${detail}` : ''}`, {
        level: 'error',
        fingerprint: ['skill_run_failed', code, input.current_step ?? ''],
        tags: {
          kind: 'run_failure',
          error_code: input.error_code,
          skill_run_id: input.skill_run_id,
          current_step: input.current_step,
        },
        extra: { error_message: input.error_message },
      });
    }
  };
}
