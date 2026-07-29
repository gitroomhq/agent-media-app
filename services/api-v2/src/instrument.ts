// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Sentry init for api-v2. Imported as the VERY FIRST line of server.ts so the
 * SDK is initialised before Express/handlers load. No-op until SENTRY_DSN is
 * set (safe to deploy before the env var is provisioned). Release is the
 * Railway commit SHA so events map to a deploy. PII/secrets are scrubbed in
 * beforeSend (emails, ma_ keys, bearer tokens, embedded-credential URLs) —
 * users must never see our provider/cost, and we must never leak customer data.
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

const REDACTIONS: { re: RegExp; with: string }[] = [
  { re: /\bma_[A-Za-z0-9]{8,}\b/g, with: 'ma_[REDACTED]' },
  { re: /\bsk-[A-Za-z0-9]{8,}\b/g, with: 'sk-[REDACTED]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, with: 'Bearer [REDACTED]' },
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, with: '[email]' },
  { re: /https?:\/\/[^@\s]+@[^/\s]+/g, with: 'https://[REDACTED]@host' },
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') return REDACTIONS.reduce((acc, r) => acc.replace(r.re, r.with), value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, depth + 1);
    return out;
  }
  return value;
}

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      return redact(event) as typeof event;
    },
  });
  // eslint-disable-next-line no-console
  console.log('[sentry] api-v2 initialised');
}

// #41 crash guards. An unhandled rejection or uncaught exception must NOT leave
// a half-dead process serving 3,000+ users. Capture to Sentry, then for an
// uncaught exception flush + exit so the platform restarts a clean process.
// These run whether or not Sentry is enabled (capture is a no-op without DSN;
// the clean-exit behaviour is the point).
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] unhandledRejection:', reason);
  Sentry.captureException(reason instanceof Error ? reason : new Error(`unhandledRejection: ${String(reason)}`));
});

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[fatal] uncaughtException:', err);
  Sentry.captureException(err);
  Sentry.flush(2000)
    .catch(() => undefined)
    .finally(() => process.exit(1));
});
