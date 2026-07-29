// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Branded 404 for the dark dashboard shell. Rendered automatically by
 * Next.js when a route under /dashboard/* doesn't exist. The sidebar
 * stays mounted (layout.tsx wraps this), so the user never feels
 * "kicked out" of the app.
 */

import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div
      className="relative flex min-h-[calc(100vh-0px)] w-full items-center justify-center px-8"
      style={{ backgroundColor: '#0F1015', color: '#E9E9F0' }}
    >
      {/* Soft top velvet glow, same vocabulary as the rest of the shell */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 h-64"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.06) 35%, rgba(15,16,21,0) 75%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background:
              'linear-gradient(135deg,#B59BFC 0%,#A78BFA 50%,#7C3AED 100%)',
            boxShadow:
              '0 10px 28px rgba(167,139,250,0.32), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <Compass className="h-5 w-5 text-white" />
        </span>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          404 · Not found
        </p>
        <h1
          className="font-normal"
          style={{
            fontSize: 'clamp(28px,2.6vw,40px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          We can&rsquo;t find that page
        </h1>
        <p
          className="max-w-md text-sm"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          The link may be old, mistyped, or the page might have moved.
          Head back to your dashboard and keep going.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          style={{
            backgroundColor: '#FFFFFF',
            color: '#0F1015',
            boxShadow:
              '0 8px 24px rgba(167,139,250,0.25), 0 0 0 1px rgba(255,255,255,0.6)',
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
