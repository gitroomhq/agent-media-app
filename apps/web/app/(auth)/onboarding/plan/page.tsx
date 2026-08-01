// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding final step - "Choose your plan".
 *
 * Reuses the existing Supabase `checkout` edge function so the Stripe
 * flow stays identical to /subscribe; only the UI is rewritten to
 * match the white + dark-pill look-and-feel of the other onboarding
 * pages. Three plans, middle one flagged "Most popular".
 *
 * Picking a plan:
 *   1. POST /api/onboarding/event { step: 'plan', event: 'completed', data: { tier } }
 *   2. invokeFn('checkout', { plan_tier }) -> Stripe Checkout URL
 *   3. window.location.href = checkout_url
 *
 * Stripe success page already pushes the user into the app
 * (/dashboard via middleware) after the webhook flips their plan.
 *
 * If the API call fails we surface the error inline and let the user
 * try a different plan; no auto-skip - they're meant to pick one.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle, LogOut } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { createClient } from '@/lib/supabase/client';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

interface Plan {
  tier: string;             // stripe-side identifier passed to checkout
  name: string;
  priceMonthly: number;
  credits: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    tier: 'starter',
    name: 'Creator',
    priceMonthly: 39,
    credits: 3900,
    tagline: 'For creators shipping UGC consistently.',
    features: [
      'Up to 10s videos',
      'All AI models + presets',
    ],
  },
  {
    tier: 'creator',
    name: 'Pro',
    priceMonthly: 69,
    credits: 6900,
    tagline: 'For professionals running production-scale pipelines.',
    popular: true,
    features: [
      'Up to 15s videos',
      'All AI models + presets',
      'Priority queue',
    ],
  },
  {
    tier: 'pro_plus',
    name: 'Pro Plus',
    priceMonthly: 129,
    credits: 12900,
    tagline: 'For high-volume teams and agencies.',
    features: [
      'Up to 15s videos',
      'All AI models + presets',
      'Early access to new tools',
    ],
  },
];

export default function OnboardingPlanPage() {
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useOnboardingEvent('plan');

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  // Capture the dub.co affiliate click id once on mount (the analytics
  // script writes it to the cookie). If present we pass it through to
  // checkout so the conversion attributes correctly.
  const [dubId, setDubId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/);
    if (m?.[1]) setDubId(m[1]);
  }, []);

  async function handleSelect(plan: Plan) {
    if (loadingTier) return;
    setLoadingTier(plan.tier);
    setError(null);
    try {
      logOnboardingEvent('plan', 'completed', { tier: plan.tier });
      const { data, error: fnError } = await invokeFn('checkout', {
        body: { plan_tier: plan.tier, ...(dubId ? { dub_id: dubId } : {}) },
      });
      if (fnError) {
        throw new Error(fnError.message || 'Checkout failed');
      }
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return; // stay in loading until the redirect lands
      }
      throw new Error('Checkout returned no URL');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoadingTier(null);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>agent-media</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[0.04] disabled:opacity-60"
          style={{ color: 'rgba(0,0,0,0.7)' }}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          Log out
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1
              className="font-normal text-black"
              style={{
                fontSize: 'clamp(24px, 2.4vw, 36px)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              Choose your plan
            </h1>
            <p className="mt-3 text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>
              Pick a plan to start creating. Cancel anytime.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.tier}
                plan={plan}
                loading={loadingTier === plan.tier}
                anyLoading={loadingTier !== null}
                onSelect={() => handleSelect(plan)}
              />
            ))}
          </div>

          {error ? (
            <div className="mx-auto mt-6 inline-flex max-w-xl items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <p
            className="mx-auto mt-10 max-w-md text-center text-xs"
            style={{ color: 'rgba(0,0,0,0.45)' }}
          >
            Secure checkout via Stripe. No contracts, cancel from
            settings anytime.
          </p>
        </div>
      </main>
    </div>
  );
}

function PlanCard({
  plan,
  loading,
  anyLoading,
  onSelect,
}: {
  plan: Plan;
  loading: boolean;
  anyLoading: boolean;
  onSelect: () => void;
}) {
  const disabled = anyLoading && !loading;
  return (
    <div
      className="relative flex flex-col rounded-3xl bg-white p-6 transition-all"
      style={{
        border: plan.popular
          ? '1px solid rgba(124,58,237,0.55)'
          : '1px solid rgba(0,0,0,0.08)',
        boxShadow: plan.popular
          ? '0 0 0 3px rgba(124,58,237,0.12)'
          : 'none',
      }}
    >
      {plan.popular ? (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            color: '#FFFFFF',
            background: 'linear-gradient(90deg,#7c3aed,#d946ef)',
            boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
          }}
        >
          Most popular
        </span>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.45)' }}>
          {plan.tagline}
        </p>
        <h2
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(22px, 2vw, 28px)',
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
          }}
        >
          {plan.name}
        </h2>
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span
          className="text-black"
          style={{
            fontSize: 'clamp(34px, 3.4vw, 44px)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          ${plan.priceMonthly}
        </span>
        <span className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>/mo</span>
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        <span
          className="text-black"
          style={{
            fontSize: 'clamp(22px, 1.8vw, 28px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {plan.credits.toLocaleString('en-US')}
        </span>
        <span
          className="text-[11px] uppercase tracking-[0.16em]"
          style={{ color: 'rgba(0,0,0,0.5)' }}
        >
          credits / mo
        </span>
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-sm text-black">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#0E0E0E' }} />
            <span style={{ color: 'rgba(0,0,0,0.78)' }}>{feat}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        disabled={loading || disabled}
        className="mt-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold uppercase tracking-[-0.01em] transition-colors"
        style={{
          backgroundColor: plan.popular ? '#0E0E0E' : '#FFFFFF',
          color: plan.popular ? '#FFFFFF' : '#0E0E0E',
          border: plan.popular ? '1px solid #0E0E0E' : '1px solid rgba(0,0,0,0.18)',
          opacity: disabled ? 0.4 : loading ? 0.7 : 1,
          cursor: loading || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecting
          </>
        ) : (
          'Select plan'
        )}
      </button>
    </div>
  );
}
