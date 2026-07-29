// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Evolink concurrency governor + API-key pool.
 *
 * WHY: Seedance 2.0 caps ~3 concurrent tasks PER account (2.0 beta; 1.0 Pro ~10).
 * If we submit more than that per key, Evolink returns 500 "internal_error /
 * Failed to create video generation task" or 429. This module holds a slot per
 * key for the FULL duration of a job (submit → completion, since Evolink counts a
 * task as in-flight until it finishes) and spreads jobs across a POOL of keys, so:
 *   - we never exceed a key's concurrent ceiling (no over-limit 5xx/429), and
 *   - total capacity = (number of keys) × (per-key limit) — add keys to add
 *     capacity with NO code change (set EVOLINK_API_KEYS).
 *
 * Config (env, read once, lazily):
 *   EVOLINK_API_KEYS              comma-separated pool (preferred). Falls back to
 *   EVOLINK_API_KEY              the single primary key.
 *   EVOLINK_MAX_CONCURRENT_PER_KEY  per-key concurrent-task cap (default 3 for
 *                                   Seedance 2.0 beta; raise to ~10 on 1.0 Pro).
 *
 * SCOPE: in-process — correct for a SINGLE video-generation worker replica (the
 * right shape while we're provider-bound: scale capacity with keys, not replicas).
 * With N replicas each governs independently, so global concurrency = N × this;
 * to run multiple replicas safely, divide EVOLINK_MAX_CONCURRENT_PER_KEY by the
 * replica count or move to a distributed (Redis/Postgres) limiter.
 */

/** Minimal async counting semaphore (FIFO). */
class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];
  constructor(permits: number) {
    this.permits = permits;
  }
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }
  release(): void {
    const next = this.queue.shift();
    if (next) next(); // hand the permit straight to the next waiter
    else this.permits += 1;
  }
}

interface KeyState {
  key: string;
  inFlight: number;
}

let _keys: KeyState[] | null = null;
let _sem: Semaphore | null = null;
let _perKeyLimit = 3;

function init(): void {
  if (_sem) return;
  const multi = (process.env.EVOLINK_API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const single = process.env.EVOLINK_API_KEY?.trim();
  // Dedup, preferring the explicit pool; the single key is the fallback/primary.
  const keyList = Array.from(new Set(multi.length ? multi : single ? [single] : []));
  _perKeyLimit = Math.max(1, Number(process.env.EVOLINK_MAX_CONCURRENT_PER_KEY) || 3);
  _keys = keyList.map((key) => ({ key, inFlight: 0 }));
  _sem = new Semaphore(keyList.length * _perKeyLimit);
}

/** Test-only: reset the lazily-initialised pool so env changes take effect. */
export function __resetEvolinkPoolForTest(): void {
  _keys = null;
  _sem = null;
}

/** Current total in-flight (test/metrics). */
export function evolinkInFlight(): number {
  return (_keys ?? []).reduce((s, k) => s + k.inFlight, 0);
}

/**
 * Run `fn` with a pooled Evolink API key, holding a concurrency slot for that
 * key until `fn` resolves/rejects. Blocks (FIFO) when every key is at its
 * per-key limit. `fn` receives the selected key.
 */
export async function withEvolinkSlot<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
  init();
  if (!_keys || _keys.length === 0) {
    const err = new Error('EVOLINK_API_KEY(S) not configured') as Error & { code?: string };
    err.code = 'PROVIDER_UNCONFIGURED';
    throw err;
  }
  await _sem!.acquire();
  // A permit guarantees at least one key is below its per-key limit; pick the
  // least-loaded (no await between selection and increment, so it's atomic).
  const slot = _keys.reduce((a, b) => (b.inFlight < a.inFlight ? b : a));
  slot.inFlight += 1;
  try {
    return await fn(slot.key);
  } finally {
    slot.inFlight -= 1;
    _sem!.release();
  }
}
