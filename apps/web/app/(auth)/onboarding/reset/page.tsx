// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Dev / redo helper. Visiting /onboarding/reset in the browser POSTs to
 * /api/onboarding/reset (wipes onboarded_at / onboarding_step /
 * onboarding_data and clears the user's row in onboarding_events) and
 * then drops the user back at /onboarding to walk through the flow
 * fresh. Subscription state and generated content are untouched.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function OnboardingResetPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/reset', { method: 'POST' });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Reset failed (${res.status})`);
        }
        router.replace('/onboarding');
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Reset failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white text-black">
      {error ? (
        <>
          <p className="text-sm font-medium text-red-600">{error}</p>
          <Link href="/onboarding" className="mt-3 text-xs text-black/55 underline">
            Continue to onboarding anyway
          </Link>
        </>
      ) : (
        <p className="inline-flex items-center gap-2 text-sm text-black/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Resetting onboarding…
        </p>
      )}
    </div>
  );
}
