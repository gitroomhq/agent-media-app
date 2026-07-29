// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Net-health watchdog + scheduled self-recycle.
 *
 * Why this exists: the worker has degraded after ~12 h of uptime, failing EVERY
 * OpenAI request with HeadersTimeoutError while a brand-new process succeeds.
 * The likely root cause is environmental (Railway egress NAT blackholing a
 * long-lived conntrack flow to one Cloudflare anycast IP), which application
 * code cannot fully guarantee away. IP rotation in the OpenAI fetch reduces it;
 * this watchdog is the hard safety net so the user can NEVER see a multi-hour
 * outage again: the process recycles itself, cleanly, well before / as soon as
 * it starts failing, and Railway restarts it fresh.
 *
 * Recycle is GRACEFUL: we send ourselves SIGTERM, which the worker's existing
 * handler turns into worker.shutdown() — in-flight activities get the 25s drain
 * window and anything still running is retried on another worker by Temporal.
 * We never hard-kill an in-flight render.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Recycle after this much uptime regardless of health (preempts the ~12 h cliff). */
const MAX_UPTIME_MS = Number(process.env.WORKER_MAX_UPTIME_MS ?? 8 * HOUR_MS);

/** Random extra delay (0..this) ADDED to MAX_UPTIME so multiple replicas never
 *  recycle in lockstep — each process rolls its own jitter at startup, so there
 *  is always a live worker in the pool. This runs in the worker process (NOT a
 *  Temporal workflow isolate), so Math.random() is safe here. Default up to
 *  60 min → recycle window [8h, 9h], still well under the ~12 h cliff. */
const MAX_UPTIME_JITTER_MS = Number(
  process.env.WORKER_MAX_UPTIME_JITTER_MS ?? 60 * 60 * 1000,
);

/** Recycle immediately after this many CONSECUTIVE OpenAI connection failures. */
const MAX_CONSECUTIVE_OPENAI_FAILURES = Number(process.env.WORKER_MAX_OPENAI_FAILURES ?? 5);

let consecutiveFailures = 0;
let recycling = false;
let onRecycle: ((reason: string) => void) | null = null;

function triggerRecycle(reason: string): void {
  if (recycling) return;
  recycling = true;
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: 'warn', msg: 'worker self-recycle', reason }));
  if (onRecycle) {
    onRecycle(reason);
  } else {
    // Fallback: signal ourselves so the worker.ts SIGTERM drain runs.
    process.kill(process.pid, 'SIGTERM');
  }
}

/** Called by the OpenAI fetch wrapper on a connection-class failure. */
export function recordOpenAIConnectionFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= MAX_CONSECUTIVE_OPENAI_FAILURES) {
    triggerRecycle(`${consecutiveFailures} consecutive OpenAI connection failures`);
  }
}

/** Called by the OpenAI fetch wrapper on any resolved HTTP response. */
export function recordOpenAIConnectionSuccess(): void {
  consecutiveFailures = 0;
}

/**
 * True once a PLANNED self-recycle has fired (max-uptime cap or consecutive
 * OpenAI-connection failures). worker.ts reads this when worker.run() returns to
 * decide the exit code: a self-recycle must exit NON-ZERO so Railway's
 * (default) on-failure restart policy brings up a fresh process — a clean exit-0
 * is treated as "completed" and is NOT restarted, which once left the worker
 * dead for ~2.5 days. A deploy/platform SIGTERM leaves this false → exit 0.
 */
export function wasSelfRecycled(): boolean {
  return recycling;
}

/**
 * Install the watchdog. `recycle` should perform a graceful drain (worker.ts
 * passes a function that calls worker.shutdown()). Returns a disposer.
 */
export function installNetHealthWatchdog(recycle: (reason: string) => void): () => void {
  onRecycle = recycle;
  // Stagger replicas: base uptime cap + a per-process random jitter, so a pool of
  // workers recycles at different times and never all drop together.
  const jitterMs = Math.floor(Math.random() * Math.max(0, MAX_UPTIME_JITTER_MS));
  const uptimeMs = MAX_UPTIME_MS + jitterMs;
  const timer = setTimeout(() => {
    triggerRecycle(`max uptime ${(uptimeMs / HOUR_MS).toFixed(2)}h reached`);
  }, uptimeMs);
  // Don't keep the event loop alive solely for the recycle timer.
  timer.unref?.();
  return () => clearTimeout(timer);
}
