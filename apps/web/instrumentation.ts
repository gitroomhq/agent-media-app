// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Next.js instrumentation entrypoint — loads the right Sentry server/edge
 * config per runtime, and exports onRequestError so server-side render/route
 * errors are captured. All inits are no-ops until the DSN env var is set.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
