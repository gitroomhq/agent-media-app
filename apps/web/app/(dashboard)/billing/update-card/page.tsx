'use client';

// Shown when a renewal failed (subscription past_due/unpaid): the app is
// locked until the card is updated in the Stripe billing portal. Stripe
// retries the invoice; once paid, invoice.paid flips the status to active.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';

export default function UpdateCardPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await invokeFn('stripe-portal', {
        body: { returnUrl: `${window.location.origin}/billing` },
      });
      if (fnError || !data?.portal_url) throw new Error(fnError?.message || 'Could not open billing');
      window.location.href = data.portal_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h1 className="text-2xl font-semibold text-text">Your last payment didn&apos;t go through</h1>
      <p className="mt-3 text-sm text-text-muted">
        Update your card to keep your plan, your credits and your videos. It takes a minute.
      </p>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        data-testid="update-card"
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Update my card
      </button>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
