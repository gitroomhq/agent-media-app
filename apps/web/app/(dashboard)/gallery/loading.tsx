// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Gallery loading skeleton — displays an animated card grid
 * while the gallery page component loads.
 */

export default function GalleryLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-8 w-40 animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-border/60" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded bg-border" />
      </div>

      {/* Filter tabs skeleton */}
      <div className="mt-8 flex items-center gap-3">
        <div className="flex flex-1 gap-1 rounded-lg border border-border bg-card p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-20 animate-pulse rounded-md bg-border/50"
            />
          ))}
        </div>
      </div>

      {/* Card grid skeleton */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-border"
          >
            {/* Video/image preview area */}
            <div className="aspect-video w-full animate-pulse bg-border/30" />

            {/* Card body */}
            <div className="p-4">
              {/* Prompt text */}
              <div className="h-4 w-full animate-pulse rounded bg-border/50" />
              <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-border/40" />

              {/* Metadata block */}
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-3 w-12 animate-pulse rounded bg-border/40" />
                    <div className="h-3 w-16 animate-pulse rounded bg-border/40" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-3 w-14 animate-pulse rounded bg-border/40" />
                    <div className="h-3 w-10 animate-pulse rounded bg-border/40" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-3 w-8 animate-pulse rounded bg-border/40" />
                    <div className="h-3 w-20 animate-pulse rounded bg-border/40" />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between">
                <div className="h-3 w-12 animate-pulse rounded bg-border/40" />
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-14 animate-pulse rounded-full bg-border/40" />
                  <div className="h-3 w-16 animate-pulse rounded bg-border/40" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
