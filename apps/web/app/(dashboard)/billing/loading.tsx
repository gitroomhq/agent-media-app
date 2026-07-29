// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Billing loading skeleton — displays animated placeholder cards
 * while the billing page component loads.
 */

export default function BillingLoading() {
  return (
    <div>
      {/* Header */}
      <div className="h-8 w-36 animate-pulse rounded bg-border" />
      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-border/60" />

      {/* Usage summary cards (3 across) */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-border/50" />
              <div className="h-3 w-24 animate-pulse rounded bg-border/40" />
            </div>
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-border/50" />
          </div>
        ))}
      </div>

      {/* Current Plan + Credit Balance (2 columns) */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Plan card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-border/40" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-border/40" />
          </div>
          <div className="mt-4 h-9 w-32 animate-pulse rounded bg-border/50" />
          <div className="mt-4 h-4 w-48 animate-pulse rounded bg-border/40" />
          <div className="mt-6 h-8 w-40 animate-pulse rounded bg-border/40" />
        </div>

        {/* Credit balance card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="h-4 w-32 animate-pulse rounded bg-border/40" />
          <div className="mt-4 flex items-baseline gap-2">
            <div className="h-12 w-24 animate-pulse rounded bg-border/50" />
            <div className="h-4 w-16 animate-pulse rounded bg-border/40" />
          </div>
          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex justify-between">
              <div className="h-3 w-28 animate-pulse rounded bg-border/40" />
              <div className="h-3 w-20 animate-pulse rounded bg-border/40" />
            </div>
            <div className="mt-1.5 h-2 w-full animate-pulse rounded-full bg-border/30" />
          </div>
          {/* Purchased credits bar */}
          <div className="mt-4">
            <div className="flex justify-between">
              <div className="h-3 w-32 animate-pulse rounded bg-border/40" />
              <div className="h-3 w-12 animate-pulse rounded bg-border/40" />
            </div>
            <div className="mt-1.5 h-2 w-full animate-pulse rounded-full bg-border/30" />
          </div>
        </div>
      </div>

      {/* Plan comparison section */}
      <div className="mt-12">
        <div className="border-b border-border pb-3">
          <div className="h-4 w-40 animate-pulse rounded bg-border/40" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="h-6 w-20 animate-pulse rounded bg-border/50" />
              <div className="mt-3 h-9 w-16 animate-pulse rounded bg-border/50" />
              <div className="mt-3 h-4 w-32 animate-pulse rounded bg-border/40" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 5 }).map((__, j) => (
                  <div
                    key={j}
                    className="h-3 w-full animate-pulse rounded bg-border/30"
                  />
                ))}
              </div>
              <div className="mt-5 h-8 w-full animate-pulse rounded bg-border/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history section */}
      <div className="mt-12">
        <div className="border-b border-border pb-3">
          <div className="h-4 w-44 animate-pulse rounded bg-border/40" />
        </div>
        <div className="mt-6 rounded-lg border border-border bg-card">
          {/* Table header */}
          <div className="flex border-b border-border px-4 py-3">
            <div className="h-3 w-16 animate-pulse rounded bg-border/40" />
            <div className="ml-8 h-3 w-12 animate-pulse rounded bg-border/40" />
            <div className="ml-auto h-3 w-14 animate-pulse rounded bg-border/40" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center border-b border-border/50 px-4 py-3 last:border-0"
            >
              <div className="h-3 w-24 animate-pulse rounded bg-border/30" />
              <div className="ml-8 h-3 w-14 animate-pulse rounded bg-border/30" />
              <div className="ml-auto h-3 w-10 animate-pulse rounded bg-border/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
