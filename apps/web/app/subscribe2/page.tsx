// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Embedded checkout subscription page — Postiz-style layout.
 *
 * Left column: hero text, then payment form (or UGC video grid when no plan selected).
 * Right column: sticky plan selector in 2-col grid + features.
 *
 * Uses Stripe Elements (PaymentElement) for full UI control.
 */

import { useCallback, useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Check, Loader2 } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { createClient } from '@/lib/supabase/client';
import { analytics } from '@/lib/analytics';
import { getVar } from '@/components/variable-context';

// ── Stripe ──────────────────────────────────────────────────────────────────

// Lazy + memoized: reads the runtime key on first use rather than at module
// import time, so one build works across environments. loadStripe is only
// called once regardless of re-renders.
let stripePromiseCache: ReturnType<typeof loadStripe> | null = null;
function getStripePromise(): ReturnType<typeof loadStripe> {
  if (!stripePromiseCache) {
    stripePromiseCache = loadStripe(
      getVar('stripePublishableKey', process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '') ?? '',
    );
  }
  return stripePromiseCache;
}

// ── Plans ───────────────────────────────────────────────────────────────────

interface PlanOption {
  tier: string;
  name: string;
  priceMonthly: number;
  credits: number;
  features: string[];
}

const PLANS: PlanOption[] = [
  {
    tier: 'starter',
    name: 'Creator',
    priceMonthly: 39,
    credits: 3900,
    features: ['3,900 credits/month', 'Up to 10s videos'],
  },
  {
    tier: 'creator',
    name: 'Pro',
    priceMonthly: 69,
    credits: 6900,
    features: ['6,900 credits/month', 'Up to 15s videos'],
  },
  {
    tier: 'pro_plus',
    name: 'Pro Plus',
    priceMonthly: 129,
    credits: 12900,
    features: ['12,900 credits/month', 'Up to 15s videos', 'Early access to improved UGC tools'],
  },
];

// ── Showcase Videos ─────────────────────────────────────────────────────────

const SHOWCASE = [
  {
    prompt: 'Young woman talks to phone camera in sunny coffee shop',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/1b056476-3ff9-486a-a961-9faff8a837e0/output.mp4',
  },
  {
    prompt: 'Man at desk unboxing a product, looks up at camera',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/39d76d93-031b-4a4b-aac4-878da176e737/output.mp4',
  },
  {
    prompt: 'Woman walks toward camera on city sidewalk at golden hour',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/e3a4c8a4-362f-4023-970f-e57aea1ce51b/output.mp4',
  },
  {
    prompt: 'Full UGC pipeline — talking heads, B-roll, voiceover, subtitles',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/f123cac9-baee-4de4-85f3-6e3aa45a97ad/ugc-final.mp4',
  },
  {
    prompt: 'AI-generated UGC video — script to finished video',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/cb69983d-2773-4624-ac55-8d47c15cd0c6/ugc-final.mp4',
  },
  {
    prompt: 'Man in hoodie does a taste reaction, expressive face',
    url: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/256d7b77-8192-4396-bae7-088c123eda22/output.mp4',
  },
];

// ── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  'AI talking-head videos',
  'B-roll generation',
  'Natural voiceover',
  'Animated subtitles',
  'Full UGC pipeline',
  'API & CLI access',
];

// ── Payment Form (inside Elements) ──────────────────────────────────────────

function CheckoutForm({ plan }: { plan: PlanOption }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setPaymentError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/billing?status=success`,
      },
    });

    if (error) {
      setPaymentError(error.message ?? 'Payment failed');
      setSubmitting(false);
    } else {
      setSucceeded(true);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Order Summary */}
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-medium text-white/50">Order Summary</h3>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-white">{plan.name} — Monthly</span>
          <span className="text-sm font-semibold text-white">${plan.priceMonthly}.00</span>
        </div>
        <div className="mt-2 border-t border-white/10 pt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Due today</span>
          <span className="text-lg font-bold text-white">${plan.priceMonthly}.00</span>
        </div>
      </div>

      {/* Payment Element */}
      <div className="rounded-xl bg-white p-4">
        <PaymentElement
          options={{
            layout: 'accordion',
          }}
        />
      </div>

      {paymentError && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <p className="text-sm text-red-400">{paymentError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting || succeeded}
        className="mt-4 w-full rounded-xl bg-purple-500 py-3 text-sm font-semibold text-white transition-all hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </span>
        ) : succeeded ? (
          'Redirecting...'
        ) : (
          `Subscribe — $${plan.priceMonthly}/mo`
        )}
      </button>
    </form>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Subscribe2Page() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already subscribed
  useEffect(() => {
    analytics.init();
    analytics.trackEvent('subscribe2_page_viewed');

    let cancelled = false;
    async function check() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setChecking(false); return; }

        const { data, error: fnError } = await invokeFn('credits-check', { method: 'GET' });
        if (!fnError && data) {
          const tier = data?.plan?.tier;
          if (tier && tier !== 'free' && tier !== 'payg' && !cancelled) {
            router.replace('/gallery');
            return;
          }
        }
      } catch { /* non-fatal */ } finally {
        if (!cancelled) setChecking(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [router]);

  // Fetch payment intent when plan is selected
  const fetchCheckoutSession = useCallback(async (tier: string) => {
    setSelectedTier(tier);
    setClientSecret(null);
    setLoadingCheckout(true);
    setError(null);

    try {
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;

      const { data, error: fnError } = await invokeFn('checkout', {
        body: {
          plan_tier: tier,
          elements: true,
          ...(dubId ? { dub_id: dubId } : {}),
        },
      });

      if (fnError) throw new Error(fnError.message || 'Checkout failed');
      if (data?.client_secret) {
        setClientSecret(data.client_secret);
      } else {
        throw new Error('No client secret returned');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoadingCheckout(false);
    }
  }, []);

  const selectedPlan = PLANS.find((p) => p.tier === selectedTier) ?? null;

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <p className="mt-4 text-sm text-white/50">Checking subscription...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:flex-row lg:gap-12 lg:px-12">
      {/* ── Left Column: Hero + Payment / UGC Grid ──────────────── */}
      <div className="flex-1">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            agent-media
          </Link>
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="text-xs text-white/40 transition-colors hover:text-white/70"
          >
            Sign out
          </button>
        </div>

        {/* Hero */}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
          Create stunning{' '}
          <span className="text-purple-400">AI videos</span>{' '}
          in seconds
        </h1>
        <p className="mt-3 text-base text-white/50 sm:text-lg">
          Talking heads, B-roll, voiceover, and subtitles — all from a single prompt.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Payment or UGC Grid */}
        <div className="mt-8">
          {!selectedTier && (
            <>
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-white/30">
                Made with agent-media
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {SHOWCASE.map((item) => (
                  <div
                    key={item.url}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  >
                    <div className="aspect-[9/16]">
                      <video
                        src={item.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="none"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[10px] leading-tight text-white/80 line-clamp-2">
                        {item.prompt}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedTier && loadingCheckout && (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 py-32">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
              <span className="ml-3 text-sm text-white/50">Loading payment form...</span>
            </div>
          )}

          {selectedPlan && clientSecret && (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">Payment</h2>
              <Elements
                stripe={getStripePromise()}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#a855f7',
                      colorBackground: '#1a1a1e',
                      colorText: '#ffffff',
                      colorTextSecondary: '#a1a1aa',
                      colorDanger: '#ef4444',
                      borderRadius: '12px',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      spacingUnit: '4px',
                    },
                    rules: {
                      '.Input': {
                        backgroundColor: '#27272a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#ffffff',
                      },
                      '.Input:focus': {
                        border: '1px solid #a855f7',
                        boxShadow: '0 0 0 1px #a855f7',
                      },
                      '.Label': {
                        color: '#a1a1aa',
                      },
                      '.Tab': {
                        backgroundColor: '#27272a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#a1a1aa',
                      },
                      '.Tab--selected': {
                        backgroundColor: '#a855f7',
                        border: '1px solid #a855f7',
                        color: '#ffffff',
                      },
                    },
                  },
                }}
              >
                <CheckoutForm plan={selectedPlan} />
              </Elements>
            </>
          )}
        </div>
      </div>

      {/* ── Right Column: Plans + Features ──────────────────────── */}
      <div className="mt-10 lg:mt-0 lg:w-[420px] lg:flex-shrink-0">
        <div className="lg:sticky lg:top-8">
          <h2 className="text-lg font-semibold text-white">Choose a Plan</h2>

          {/* Plan grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {PLANS.map((plan, i) => {
              const isSelected = selectedTier === plan.tier;
              const isLast = i === PLANS.length - 1 && PLANS.length % 2 !== 0;
              return (
                <button
                  key={plan.tier}
                  onClick={() => fetchCheckoutSession(plan.tier)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    isLast ? 'col-span-2' : ''
                  } ${
                    isSelected
                      ? 'border-purple-400 bg-purple-400/10'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <span className="text-sm font-medium text-white/70">{plan.name}</span>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-3xl font-extrabold text-white">
                      ${plan.priceMonthly}
                    </span>
                    <span className="text-sm text-white/40">/ month</span>
                  </div>
                  <p className="mt-2 text-xs text-white/40">
                    {plan.credits.toLocaleString()} credits/mo
                  </p>
                </button>
              );
            })}
          </div>

          {/* Features */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-white">Features</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded bg-purple-400/20">
                    <Check className="h-2.5 w-2.5 text-purple-400" />
                  </div>
                  <span className="text-sm text-white/60">{f}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-white/30">
            Cancel anytime &middot; No contracts &middot; ~300 credits per 10s video
          </p>
        </div>
      </div>
    </div>
  );
}
