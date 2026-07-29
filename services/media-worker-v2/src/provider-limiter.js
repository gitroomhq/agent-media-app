// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Per-provider concurrency caps + circuit breaker, with optional key-pool
 * support so multiple API keys for the same upstream multiply effective
 * capacity.
 *
 * Two layers:
 *
 *   • Limiter  — caps concurrency for one key, tracks error rate, trips
 *                circuit breaker when error rate exceeds threshold.
 *
 *   • KeyPool  — holds N Limiters (one per key). pool.run((key) => fn(key))
 *                picks the least-loaded healthy key and runs fn through that
 *                key's Limiter. If all circuits are open, throws
 *                CircuitOpenError immediately.
 *
 * Backward compatible: a single-key env (`EVOLINK_API_KEY`) creates a pool
 * of size 1, behaving identically to the old single-limiter setup.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_OPEN_MS = 60_000;
const DEFAULT_THRESHOLD = 0.25;
const DEFAULT_MIN_SAMPLES = 5;

export class CircuitOpenError extends Error {
  constructor(provider, retryAtMs) {
    super(`[${provider}] circuit open — retry after ${new Date(retryAtMs).toISOString()}`);
    this.name = 'CircuitOpenError';
    this.provider = provider;
    this.retryAtMs = retryAtMs;
  }
}

class Limiter {
  constructor(name, opts) {
    this.name = name;
    this.maxConcurrent = Math.max(1, opts.maxConcurrent);
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    this.openMs = opts.openMs ?? DEFAULT_OPEN_MS;
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;

    this.inFlight = 0;
    this.waiters = [];
    this.events = [];
    this.circuitOpenUntil = 0;
  }

  isCircuitOpen(now = Date.now()) {
    return now < this.circuitOpenUntil;
  }

  /** Lower = less loaded. Used by KeyPool to pick the next key. */
  loadScore() {
    return this.inFlight + this.waiters.length / 1000;
  }

  status() {
    this._prune();
    const total = this.events.length;
    const failed = this.events.filter((e) => !e.ok).length;
    return {
      name: this.name,
      in_flight: this.inFlight,
      max_concurrent: this.maxConcurrent,
      waiting: this.waiters.length,
      window_total: total,
      window_failed: failed,
      window_error_rate: total ? failed / total : 0,
      circuit_open_until: this.circuitOpenUntil,
      circuit_open: Date.now() < this.circuitOpenUntil,
    };
  }

  async run(fn) {
    if (this.isCircuitOpen()) {
      throw new CircuitOpenError(this.name, this.circuitOpenUntil);
    }
    await this._acquire();
    let ok = true;
    try {
      return await fn();
    } catch (err) {
      ok = false;
      throw err;
    } finally {
      this._record(ok);
      this._release();
    }
  }

  _acquire() {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  _release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.waiters.shift();
    if (next) next();
  }

  _record(ok) {
    const now = Date.now();
    this.events.push({ ts: now, ok });
    this._prune(now);
    if (this.events.length >= this.minSamples) {
      const failed = this.events.filter((e) => !e.ok).length;
      const rate = failed / this.events.length;
      if (rate >= this.threshold && this.circuitOpenUntil < now) {
        this.circuitOpenUntil = now + this.openMs;
        console.warn(
          `[limiter:${this.name}] circuit OPEN — error rate ${(rate * 100).toFixed(0)}% (${failed}/${this.events.length}) over last ${this.windowMs}ms. Re-closing in ${this.openMs}ms.`,
        );
        this.events = [];
      }
    }
  }

  _prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    while (this.events.length > 0 && this.events[0].ts < cutoff) {
      this.events.shift();
    }
  }
}

class KeyPool {
  /**
   * @param {string} name
   * @param {string[]} keys
   * @param {object} opts Limiter options applied to each key.
   */
  constructor(name, keys, opts) {
    this.name = name;
    if (!keys || keys.length === 0) {
      this.entries = [];
      return;
    }
    this.entries = keys.map((key, i) => ({
      key,
      label: keys.length === 1 ? name : `${name}-${i + 1}`,
      limiter: new Limiter(`${name}-key${i + 1}`, opts),
    }));
  }

  hasKeys() {
    return this.entries.length > 0;
  }

  size() {
    return this.entries.length;
  }

  /**
   * Pick the least-loaded healthy key, then run fn(key) under that key's
   * Limiter. If all keys' circuits are open, throws CircuitOpenError with
   * the earliest retry-at time.
   *
   * @template T
   * @param {(key: string) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    if (this.entries.length === 0) {
      throw new Error(`[${this.name}] key pool is empty — set ${this.name.toUpperCase()}_API_KEY (or _API_KEYS / _API_KEY_1, _2, ...)`);
    }

    const now = Date.now();
    const open = this.entries.filter((e) => e.limiter.isCircuitOpen(now));
    if (open.length === this.entries.length) {
      const earliest = Math.min(...this.entries.map((e) => e.limiter.circuitOpenUntil));
      throw new CircuitOpenError(this.name, earliest);
    }

    const healthy = this.entries.filter((e) => !e.limiter.isCircuitOpen(now));
    healthy.sort((a, b) => a.limiter.loadScore() - b.limiter.loadScore());
    const chosen = healthy[0];

    return chosen.limiter.run(() => fn(chosen.key));
  }

  status() {
    return this.entries.map((e) => ({
      label: e.label,
      ...e.limiter.status(),
    }));
  }
}

// ── Env parsing ─────────────────────────────────────────────────────────────

function intEnv(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function floatEnv(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Parse keys for a provider from env, supporting three formats:
 *
 *   1. <PREFIX>_API_KEYS=key1,key2,key3   (comma-separated, recommended for >1)
 *   2. <PREFIX>_API_KEY_1, _2, _3...      (numbered, for IaC tools that hate commas)
 *   3. <PREFIX>_API_KEY=key1              (single, backward compatible)
 *
 * Returns deduped, non-empty list.
 */
function parseKeys(prefix) {
  const keys = [];
  const csv = process.env[`${prefix}_API_KEYS`];
  if (csv) {
    csv.split(',').map((k) => k.trim()).filter(Boolean).forEach((k) => keys.push(k));
  }
  for (let i = 1; i <= 16; i += 1) {
    const k = process.env[`${prefix}_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  const single = process.env[`${prefix}_API_KEY`];
  if (single && single.trim()) keys.push(single.trim());
  return [...new Set(keys)];
}

// ── Singleton key pools per provider ────────────────────────────────────────

const evolinkOpts = {
  maxConcurrent: intEnv('EVOLINK_MAX_CONCURRENT', 10),
  windowMs: intEnv('EVOLINK_CIRCUIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  openMs: intEnv('EVOLINK_CIRCUIT_OPEN_MS', DEFAULT_OPEN_MS),
  threshold: floatEnv('EVOLINK_CIRCUIT_THRESHOLD', DEFAULT_THRESHOLD),
};

const replicateOpts = {
  maxConcurrent: intEnv('REPLICATE_MAX_CONCURRENT', 5),
  windowMs: intEnv('REPLICATE_CIRCUIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  openMs: intEnv('REPLICATE_CIRCUIT_OPEN_MS', DEFAULT_OPEN_MS),
  threshold: floatEnv('REPLICATE_CIRCUIT_THRESHOLD', DEFAULT_THRESHOLD),
};

export const evolinkLimiter = new KeyPool('evolink', parseKeys('EVOLINK'), evolinkOpts);

// Replicate historically uses REPLICATE_API_TOKEN; accept both old and pool-style.
function parseReplicateKeys() {
  const keys = parseKeys('REPLICATE');
  const legacy = process.env.REPLICATE_API_TOKEN;
  if (legacy && legacy.trim()) keys.push(legacy.trim());
  const csv = process.env.REPLICATE_API_TOKENS;
  if (csv) csv.split(',').map((k) => k.trim()).filter(Boolean).forEach((k) => keys.push(k));
  for (let i = 1; i <= 16; i += 1) {
    const k = process.env[`REPLICATE_API_TOKEN_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  return [...new Set(keys)];
}
export const replicateLimiter = new KeyPool('replicate', parseReplicateKeys(), replicateOpts);

console.log(`[limiter] evolink pool: ${evolinkLimiter.size()} key(s), cap ${evolinkOpts.maxConcurrent}/key (effective ${evolinkLimiter.size() * evolinkOpts.maxConcurrent})`);
console.log(`[limiter] replicate pool: ${replicateLimiter.size()} key(s), cap ${replicateOpts.maxConcurrent}/key`);

export function allLimiterStatus() {
  return {
    evolink: {
      pool_size: evolinkLimiter.size(),
      keys: evolinkLimiter.status(),
    },
    replicate: {
      pool_size: replicateLimiter.size(),
      keys: replicateLimiter.status(),
    },
  };
}
