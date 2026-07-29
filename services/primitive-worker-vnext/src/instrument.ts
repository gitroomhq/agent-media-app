// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Sentry init for the primitive worker. Imported first in worker.ts so the SDK
 * is ready before Temporal/activities load. No-op until SENTRY_DSN is set.
 * Release = Railway commit SHA. PII/secret scrub in beforeSend (we must never
 * leak customer data or our provider/cost into the error backend).
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

const enabled = !!dsn;

if (enabled) {
  Sentry.init({
    dsn,
    release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      return redact(event) as typeof event;
    },
  });
  // eslint-disable-next-line no-console
  console.log('[sentry] primitive-worker-vnext initialised');
}

export const sentryEnabled = enabled;
