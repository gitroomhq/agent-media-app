'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Root global error boundary. Catches errors thrown in the root layout itself
 * (which the per-route error.tsx can't), reports them to Sentry, and renders
 * its own <html>/<body> (required for global-error). Also satisfies the
 * @sentry/nextjs build warning about a missing global error handler.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0d0e12', color: '#e9e9f0', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Something went wrong</p>
            <p style={{ marginTop: 8, color: 'rgba(255,255,255,0.55)' }}>The error has been reported to our team. Try again, or reload the page.</p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 24, padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.5)', background: 'rgba(167,139,250,0.12)', color: '#C4B5FD', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
