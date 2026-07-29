// Copyright 2026 agent-media contributors. Apache-2.0 license.

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center font-mono">
        <p className="text-6xl font-bold text-accent">404</p>
        <p className="mt-4 text-lg text-text">Page not found</p>
        <p className="mt-2 text-sm text-text-muted">
          The requested route does not exist.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded border border-accent px-6 py-2 text-sm text-accent transition-colors hover:bg-accent hover:text-background"
        >
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
