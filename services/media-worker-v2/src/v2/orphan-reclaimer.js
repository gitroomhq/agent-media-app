// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Orphaned-job reclaimer.
 *
 * The v2 worker's per-user queue is in-memory, so every Railway deploy
 * swap silently killed whatever was queued or running — the job row
 * stayed "submitted"/"processing" until a reaper timed it out and the
 * user got a refund instead of a video (four jobs died this way on
 * 2026-08-09 alone).
 *
 * On boot, this module re-hydrates the queue from generation_jobs:
 * any v2 operation still in a non-terminal state, recent enough to be
 * worth finishing, and quiet long enough that no live worker is
 * plausibly running it, gets re-dispatched through the same envelope
 * machinery the HTTP routes use.
 *
 * Guards against double-running a freshly-dispatched job: rows updated
 * in the last QUIET_MS are skipped (dispatch + progress callbacks bump
 * updated_at), and the boot delay lets in-flight dispatches land first.
 */

import { createClient } from '@supabase/supabase-js';

// operation (generation_jobs) → pipeline (server-routes envelope)
export const OPERATION_TO_PIPELINE = {
  selfie: 'selfie',
  crazy_look: 'crazy-look',
  character_create: 'character-create',
  subtitle: 'subtitle',
};

const MAX_AGE_MS = 2 * 60 * 60 * 1000; // don't resurrect anything older than 2h
const QUIET_MS = 90 * 1000;            // row must be quiet this long to be an orphan
const BOOT_DELAY_MS = 5_000;

/**
 * Map a generation_jobs row to a v2 queue envelope. Pure — exported for
 * tests. Returns null for operations this worker doesn't own.
 *
 * @param {object} row  generation_jobs row (id, user_id, operation, input_params)
 * @param {string} supabaseUrl  base URL used to rebuild the callback
 */
export function mapJobRowToEnvelope(row, supabaseUrl) {
  const pipeline = OPERATION_TO_PIPELINE[row?.operation];
  if (!pipeline || !row?.id) return null;
  return {
    pipeline,
    params: {
      ...(row.input_params ?? {}),
      job_id: row.id,
      user_id: row.user_id,
      callback_url: `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${row.id}`,
    },
  };
}

/**
 * Query for orphans and enqueue them. Called once, shortly after boot.
 *
 * @param {(envelope: object) => void} enqueue — server-routes' enqueueV2Job
 */
export async function reclaimOrphanedV2Jobs(enqueue) {
  if (process.env.RECLAIM_V2_ORPHANS === 'false') {
    console.log('[v2 reclaim] disabled via RECLAIM_V2_ORPHANS=false');
    return { reclaimed: 0 };
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn('[v2 reclaim] SUPABASE_URL / SERVICE_ROLE_KEY missing — skipping');
    return { reclaimed: 0 };
  }

  const db = createClient(supabaseUrl, serviceKey);
  const now = Date.now();
  const { data, error } = await db
    .from('generation_jobs')
    .select('id, user_id, operation, input_params, status, created_at, updated_at')
    .in('status', ['submitted', 'processing'])
    .eq('provider_slug', 'railway')
    .in('operation', Object.keys(OPERATION_TO_PIPELINE))
    .gte('created_at', new Date(now - MAX_AGE_MS).toISOString())
    .lt('updated_at', new Date(now - QUIET_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error(`[v2 reclaim] query failed: ${error.message}`);
    return { reclaimed: 0 };
  }

  let reclaimed = 0;
  for (const row of data ?? []) {
    const envelope = mapJobRowToEnvelope(row, supabaseUrl);
    if (!envelope) continue;
    console.log(
      `[v2 reclaim] re-dispatching orphaned ${row.operation} job ${row.id} ` +
      `(status=${row.status}, quiet since ${row.updated_at})`,
    );
    enqueue(envelope);
    reclaimed += 1;
  }
  console.log(`[v2 reclaim] ${reclaimed} orphaned job(s) re-enqueued`);
  return { reclaimed };
}

/**
 * Schedule the reclaim shortly after boot (lets the HTTP server settle
 * and any genuinely in-flight dispatches land, so the QUIET_MS guard
 * sees fresh updated_at values for them).
 */
export function scheduleOrphanReclaim(enqueue) {
  const t = setTimeout(() => {
    reclaimOrphanedV2Jobs(enqueue).catch((err) =>
      console.error('[v2 reclaim] crashed:', err?.message ?? err),
    );
  }, BOOT_DELAY_MS);
  // Don't hold the process open for the timer alone.
  if (typeof t.unref === 'function') t.unref();
}
