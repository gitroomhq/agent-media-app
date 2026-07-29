// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared Sentry capture for Supabase edge functions (Deno).
 *
 * Implemented as a direct POST to Sentry's store endpoint via fetch — NOT the
 * @sentry/deno SDK — because Supabase's custom edge runtime doesn't reliably
 * load the SDK, and fetch works everywhere. Edge functions already catch their
 * own errors and return 500, so call `captureEdgeError(err, "<fn-name>")`
 * inside those catch blocks to surface the error in Sentry alongside the
 * web/api/worker runtimes. No-op until the SENTRY_DSN secret is set.
 */

interface ParsedDsn {
  endpoint: string;
  key: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/store/`, key: u.username };
  } catch {
    return null;
  }
}

/** Capture an edge-function error with the function name + optional context. */
export async function captureEdgeError(
  err: unknown,
  fnName: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    const dsn = Deno.env.get('SENTRY_DSN');
    if (!dsn) return;
    const parsed = parseDsn(dsn);
    if (!parsed) return;

    const e = err instanceof Error ? err : new Error(String(err));
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      logger: 'edge',
      environment: Deno.env.get('ENVIRONMENT') || 'production',
      release: Deno.env.get('SUPABASE_DEPLOYMENT_ID') || undefined,
      tags: { fn: fnName, runtime: 'edge' },
      exception: { values: [{ type: e.name || 'Error', value: e.message || String(err) }] },
      extra: { ...(extra ?? {}), stack: e.stack },
    };

    await fetch(parsed.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=agentmedia-edge/1.0, sentry_key=${parsed.key}`,
      },
      body: JSON.stringify(event),
    }).catch(() => {});
  } catch (_e) {
    // Never let error reporting break the function's own error path.
  }
}

/**
 * Secret-gated smoke test: if the request carries ?sentrytest=<SENTRY_TEST_TOKEN>
 * this throws so the caller's catch captures it, proving the edge→Sentry path.
 */
export function maybeThrowSentryTest(req: Request, fnName: string): void {
  const token = Deno.env.get('SENTRY_TEST_TOKEN');
  if (!token) return;
  const t = new URL(req.url).searchParams.get('sentrytest');
  if (t && t === token) {
    throw new Error(`SENTRY_EDGE_VERIFY ${fnName}`);
  }
}
