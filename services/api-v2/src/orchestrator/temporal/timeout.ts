// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Promise.race wrapper that rejects with a `TimeoutError` after `ms` ms.
 * Tiny helper — kept in its own file so dispatch + client can both use it
 * without circular imports.
 */

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;
  readonly label: string;
  readonly timeoutMs: number;
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle);
  }) as Promise<T>;
}
