'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Dashboard segment error boundary. Catches render errors anywhere under
 * /dashboard, reports them to Sentry, and shows a friendly dark-themed
 * fallback (Try again / go Home) instead of a white screen — so a single
 * broken page never strands the user.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { RefreshCw, Home } from 'lucide-react';

export default function DashboardError({
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
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <p className="text-xl font-semibold" style={{ color: '#E9E9F0', letterSpacing: '-0.02em' }}>
          This page hit a snag
        </p>
        <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          We&rsquo;ve been notified and are on it. You can try again or head back home.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
            style={{ borderRadius: 8, background: 'rgba(167,139,250,0.14)', boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.4)', color: '#C4B5FD' }}
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
            style={{ borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.75)' }}
          >
            <Home className="h-4 w-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
