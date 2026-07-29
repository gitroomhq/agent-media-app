// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { Context } from '@temporalio/activity';

/**
 * Run a long async operation while emitting periodic Temporal heartbeats so a
 * slow-but-healthy call never trips the activity's heartbeatTimeout.
 *
 * Why this exists: gpt-image-2 holds the request ~50s (and an internal retry or
 * the api-v2 fallback can push the whole call past 90s) with NO data in between.
 * Without a heartbeat during that window, Temporal declared "activity Heartbeat
 * timeout", killed the activity and retried it from scratch — wasting the
 * in-flight image, ballooning run duration to 2-6 min and, when it exceeded the
 * workflow timeout, leaving the run stuck in `submitted` (the user-facing
 * "make_portrait failed — timed out").
 *
 * The OpenAI image call is the I/O-bound wait, so the event loop is free to fire
 * this interval timer during it. We capture Context.current() up front because
 * the timer callback runs outside the activity's async-local context.
 */
export async function withHeartbeat<T>(
  stage: string,
  fn: () => Promise<T>,
  intervalMs = 15_000,
): Promise<T> {
  const ctx = Context.current();
  let n = 0;
  const timer = setInterval(() => {
    try {
      ctx.heartbeat({ stage, beat: (n += 1) });
    } catch {
      /* heartbeat is best-effort — never let it throw into the timer */
    }
  }, intervalMs);
  // Don't let the heartbeat ticker keep the event loop alive on its own.
  if (typeof timer.unref === 'function') timer.unref();
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
