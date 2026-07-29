// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Sentry init for the Next.js server runtime (Node). No-op until SENTRY_DSN
 * (or NEXT_PUBLIC_SENTRY_DSN) is set, so builds/deploys are safe before the
 * project is provisioned. Release = the Vercel git SHA so every event maps to
 * a deploy + is source-mapped.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/sentry-scrub';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
