// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Phase A: durable queue helpers backed by Supabase pgmq.
 *
 * api-v2 enqueues a dispatch message instead of POSTing to the worker over
 * HTTP. The worker (services/media-worker-v2) consumes from the same queue.
 *
 * Behaviour is gated by the USE_DURABLE_QUEUE env flag — when false (the
 * default) callers fall through to the existing HTTP dispatch path.
 */

import { supabase } from './server.js';

export const USE_DURABLE_QUEUE = (process.env.USE_DURABLE_QUEUE ?? 'false').toLowerCase() === 'true';

export type DispatchTarget =
  | 'ugc'
  | 'show-your-app'
  | 'product-acting'
  | 'laptop-ugc'
  | 'character-video'
  | 'character-sheet-generate'
  | 'character-storyboard-generate'
  | 'text-to-video';

export interface DispatchPayload {
  /** Internal job id (matches generation_jobs.id). */
  job_id: string;
  /** Which worker route to dispatch to. */
  target: DispatchTarget;
  /** Body that would have been POSTed to the worker route. */
  body: Record<string, unknown>;
  /** Generator id from the api-v2 schema (for telemetry / routing sanity). */
  generator_id: string;
  /** ISO timestamp of when api-v2 received the request. */
  enqueued_at: string;
}

export interface EnqueueResult {
  msg_id: number;
}

/**
 * Send a dispatch payload to the durable queue.
 *
 * Returns null on transport error so the caller can fall back to the legacy
 * HTTP dispatch — never silently drop a job. The legacy path remains the
 * source of truth until USE_DURABLE_QUEUE is fully cut over.
 */
export async function enqueueDispatch(payload: DispatchPayload): Promise<EnqueueResult | null> {
  try {
    const { data, error } = await supabase.rpc('pgmq_dispatch_send', { payload });
    if (error) {
      console.error(`[queue] enqueue failed for ${payload.job_id}:`, error.message);
      return null;
    }
    if (typeof data !== 'number') {
      console.error(`[queue] unexpected pgmq_dispatch_send return for ${payload.job_id}:`, data);
      return null;
    }
    return { msg_id: data };
  } catch (err) {
    console.error(`[queue] enqueue threw for ${payload.job_id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
