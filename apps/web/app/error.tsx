'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center font-mono">
        <p className="text-6xl font-bold text-danger">ERR</p>
        <p className="mt-4 text-lg text-text">Something went wrong</p>
        <p className="mt-2 text-sm text-text-muted">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="mt-8 inline-block cursor-pointer rounded border border-accent px-6 py-2 text-sm text-accent transition-colors hover:bg-accent hover:text-background"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
