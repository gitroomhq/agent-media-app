// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Phase A: durable queue consumer.
 *
 * Polls the Supabase pgmq `generation_dispatch` queue and forwards each
 * message to the existing local HTTP route (/ugc, /show-your-app,
 * /product-acting). The HTTP routes already ack quickly and process async
 * via userQueues, so we delete the queue message as soon as the route
 * returns 2xx. Failures (network, 5xx) leave the message in pgmq — the
 * visibility timeout will resurface it for retry.
 *
 * Activated only when USE_DURABLE_QUEUE=true. When false (the default),
 * api-v2 dispatches over HTTP exactly as today and this module is dormant.
 */

import { createClient } from '@supabase/supabase-js';

const USE_DURABLE_QUEUE = String(process.env.USE_DURABLE_QUEUE ?? 'false').toLowerCase() === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const POLL_BATCH_SIZE = Number(process.env.QUEUE_POLL_BATCH ?? 1);
const POLL_IDLE_MS = Number(process.env.QUEUE_POLL_IDLE_MS ?? 2000);
const VISIBILITY_TIMEOUT_SEC = Number(process.env.QUEUE_VISIBILITY_TIMEOUT_SEC ?? 900); // 15 min

const ALLOWED_TARGETS = new Set([
  'ugc',
  'show-your-app',
  'product-acting',
  'laptop-ugc',
  'character-video',
  'character-sheet-generate',
  'character-storyboard-generate',
  'text-to-video',
]);

/**
 * Start the consumer loop. Returns an object with `stop()` for graceful
 * shutdown (called from the SIGTERM handler).
 */
export function startQueueConsumer({ port }) {
  if (!USE_DURABLE_QUEUE) {
    console.log('[queue-consumer] USE_DURABLE_QUEUE=false — consumer not started.');
    return { stop: async () => {} };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[queue-consumer] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — refusing to start.');
    return { stop: async () => {} };
  }
  if (!WORKER_SECRET) {
    console.error('[queue-consumer] WORKER_SECRET missing — refusing to start.');
    return { stop: async () => {} };
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let running = true;
  console.log(`[queue-consumer] starting (port=${port}, batch=${POLL_BATCH_SIZE}, vt=${VISIBILITY_TIMEOUT_SEC}s)`);

  const loop = (async () => {
    while (running) {
      try {
        const { data: messages, error } = await db.rpc('pgmq_dispatch_read', {
          vt_seconds: VISIBILITY_TIMEOUT_SEC,
          qty: POLL_BATCH_SIZE,
        });

        if (error) {
          console.error('[queue-consumer] read failed:', error.message);
          await sleep(POLL_IDLE_MS);
          continue;
        }

        if (!messages || messages.length === 0) {
          await sleep(POLL_IDLE_MS);
          continue;
        }

        for (const msg of messages) {
          if (!running) break;
          await handleMessage(db, msg, port);
        }
      } catch (err) {
        console.error('[queue-consumer] loop error:', err);
        await sleep(POLL_IDLE_MS);
      }
    }
    console.log('[queue-consumer] loop exited.');
  })();

  return {
    stop: async () => {
      running = false;
      await loop;
    },
  };
}

async function handleMessage(db, msg, port) {
  const { msg_id, message } = msg;
  if (!message || typeof message !== 'object') {
    console.error(`[queue-consumer] msg ${msg_id} has no payload — archiving`);
    await archive(db, msg_id);
    return;
  }

  const { target, body, job_id } = message;
  if (!ALLOWED_TARGETS.has(target)) {
    console.error(`[queue-consumer] msg ${msg_id} job ${job_id} has invalid target=${target} — archiving`);
    await archive(db, msg_id);
    return;
  }

  const url = `http://127.0.0.1:${port}/${target}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(20_000),
    });

    if (resp.ok) {
      await del(db, msg_id);
      console.log(`[queue-consumer] dispatched job ${job_id} -> ${target} (msg ${msg_id} deleted)`);
    } else {
      const text = await resp.text().catch(() => '');
      console.error(`[queue-consumer] dispatch failed job ${job_id} -> ${target}: ${resp.status} ${text.slice(0, 200)}`);
      // Leave the message — visibility timeout will resurface it for retry.
    }
  } catch (err) {
    console.error(`[queue-consumer] dispatch threw job ${job_id} -> ${target}:`, err instanceof Error ? err.message : err);
    // Leave the message — visibility timeout will resurface it for retry.
  }
}

async function del(db, msgId) {
  const { error } = await db.rpc('pgmq_dispatch_delete', { p_msg_id: msgId });
  if (error) console.error(`[queue-consumer] delete msg ${msgId} failed:`, error.message);
}

async function archive(db, msgId) {
  const { error } = await db.rpc('pgmq_dispatch_archive', { p_msg_id: msgId });
  if (error) console.error(`[queue-consumer] archive msg ${msgId} failed:`, error.message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
