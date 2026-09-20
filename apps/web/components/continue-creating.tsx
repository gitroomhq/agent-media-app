// Copyright 2026 agent-media contributors. Apache-2.0 license.
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { creationReturnTo } from '@/lib/navigation/return-to';

/** Checkout completion never submits a generation or treats its query string as proof of payment. */
export function ContinueCreating() {
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    let canceled = false;
    fetch('/api/onboarding/resume', { cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!canceled) setDestination(creationReturnTo(data?.destination)); })
      .catch(() => {});
    return () => { canceled = true; };
  }, []);
  if (!destination) return null;
  return (
    <div className="my-5 rounded-xl border border-purple-400/30 bg-purple-400/10 p-4 text-sm">
      <p>Your place is saved. Continue when you’re ready; generation starts only when you submit it.</p>
      <Link prefetch={false} href={destination} className="mt-2 inline-block font-semibold underline underline-offset-4">Continue creating →</Link>
    </div>
  );
}
