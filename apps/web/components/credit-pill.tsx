// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Top-bar widget showing the user's credit balance + a CTA to buy more.
 * Fetched from the credits-check edge function which returns
 * monthly_remaining + purchased; we surface the total.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';

interface CreditsResponse {
  credits?: { total?: number; monthly_remaining?: number; purchased?: number };
}

export function CreditPill() {
  const [total, setTotal] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<{ monthly: number; purchased: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await invokeFn('credits-check', { method: 'GET' });
      if (cancelled) return;
      const d = data as CreditsResponse | null;
      const t = d?.credits?.total;
      if (typeof t === 'number') {
        setTotal(t);
        setBreakdown({
          monthly: d?.credits?.monthly_remaining ?? 0,
          purchased: d?.credits?.purchased ?? 0,
        });
      }
    }
    load();
    // Refresh every 60s so balance reflects new runs / top-ups.
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const label = total === null ? '…' : total.toLocaleString();
  const title = breakdown
    ? `${breakdown.monthly.toLocaleString()} monthly · ${breakdown.purchased.toLocaleString()} purchased`
    : 'Credit balance';

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-sm font-medium text-[#121212]"
        title={title}
      >
        <span className="font-mono">{label}</span> credits
      </span>
      <Link
        href="/billing"
        className="hidden items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_12px_rgba(168,85,247,0.45)] transition-shadow hover:shadow-[0_0_18px_rgba(168,85,247,0.7)] md:inline-flex"
        title="Top up credits"
      >
        <Plus className="h-3.5 w-3.5" />
        Get more credits
      </Link>
    </div>
  );
}
