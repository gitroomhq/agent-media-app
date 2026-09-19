// Copyright 2026 agent-media contributors. Apache-2.0 license.
/** Reconnect reads once. Mutations are never replayed after an uncertain response. */
export function createUpstream<T extends { close(): Promise<void> }>(connect: () => Promise<T>) {
  let current: Promise<T> | null = null;
  async function run<R>(fn: (client: T) => Promise<R>, retry = true): Promise<R> {
    const connection = current ?? (current = connect());
    let client: T | undefined;
    try {
      client = await connection;
      return await fn(client);
    } catch (error) {
      if (current === connection) {
        current = null;
        try { await client?.close(); } catch { /* already closed */ }
      }
      if (!retry) throw error;
      return run(fn, false);
    }
  }
  return run;
}
export const RETRYABLE_TOOLS = new Set(['list_models', 'list_characters', 'get_run_status', 'get_uploads', 'quote']);
