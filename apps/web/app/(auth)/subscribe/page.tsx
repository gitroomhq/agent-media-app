// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Subscription wall -- shown when an authenticated user has no active
 * subscription. Beautiful, welcoming page with plan cards, social proof,
 * feature highlights, and FAQ.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Zap, ChevronDown } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { createClient } from '@/lib/supabase/client';
import { analytics } from '@/lib/analytics';
import { VideoMarquee } from '@/components/video-marquee';

interface PlanOption {
  tier: string;
  name: string;
  priceMonthly: number;
  credits: number;
  videoEstimate: string;
  desc: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PlanOption[] = [
  {
    tier: 'starter',
    name: 'Creator',
    priceMonthly: 39,
    credits: 3900,
    videoEstimate: '~13 videos',
    desc: 'For creators shipping UGC content consistently.',
    features: [
      '3,900 credits/month',
      'Up to 10s videos',
    ],
  },
  {
    tier: 'creator',
    name: 'Pro',
    priceMonthly: 69,
    credits: 6900,
    videoEstimate: '~23 videos',
    desc: 'For professionals running production-scale pipelines.',
    popular: true,
    features: [
      '6,900 credits/month',
      'Up to 15s videos',
    ],
  },
  {
    tier: 'pro_plus',
    name: 'Pro Plus',
    priceMonthly: 129,
    credits: 12900,
    videoEstimate: '~43 videos',
    desc: 'For high-volume teams and agencies.',
    features: [
      '12,900 credits/month',
      'Up to 15s videos',
      'Early access to improved UGC tools',
    ],
  },
];

const FAQ = [
  {
    q: 'How many videos do I get per month?',
    a: 'At 10s per video: ~13 on Creator, ~23 on Pro, ~43 on Pro Plus. Credits are billed per second at 30 credits/sec. Creator supports up to 10s; Pro and Pro Plus up to 15s.',
  },
  {
    q: 'Do credits roll over?',
    a: 'Monthly plan credits reset each billing cycle. Purchased credit packs never expire while your account is active.',
  },
  {
    q: 'Can I switch or cancel anytime?',
    a: 'Yes. Upgrade, downgrade, or cancel anytime from your dashboard. Changes take effect on your next billing cycle. No contracts, no commitment.',
  },
  {
    q: 'What happens if I run out of credits?',
    a: 'You can buy a 3,900 credit pack for $39 at any time, or upgrade your plan for more monthly credits.',
  },
  {
    q: 'Are all models included in every plan?',
    a: 'Yes. Every paid plan gives you access to all AI models and the full UGC pipeline. No per-model surcharges.',
  },
];

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // We do NOT block the UI on this. Middleware already guarantees
  // anyone who lands here is unsubscribed, so the pricing UI renders
  // immediately. The background check below is only there to catch
  // the edge case where someone bookmarked /subscribe and has since
  // paid - in that case we silently redirect them to /gallery.
  const [checking, setChecking] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    analytics.init();
    analytics.trackEvent('subscribe_page_viewed');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error: fnError } = await invokeFn('credits-check', {
          method: 'GET',
        });
        if (fnError) {
          console.error('credits-check error:', fnError.message);
          return;
        }

        const tier = data?.plan?.tier;
        if (tier && tier !== 'free' && tier !== 'payg' && !cancelled) {
          router.replace('/gallery');
        }
      } catch (err) {
        console.error('checkSubscription error:', err);
      }
    }

    checkSubscription();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubscribe(tier: string) {
    setLoading(tier);
    setError(null);
    analytics.trackEvent('plan_selected', { tier });

    try {
      // Capture dub.co affiliate click ID from cookie (set by analytics script)
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;

      const { data, error: fnError } = await invokeFn('checkout', {
        body: { plan_tier: tier, ...(dubId ? { dub_id: dubId } : {}) },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Checkout failed');
      }

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(null);
    }
  }

  // Note: the "Checking subscription..." spinner branch was removed
  // intentionally - middleware already guarantees the user is
  // unsubscribed before letting them onto /subscribe, so blocking the
  // UI on a redundant client-side check just felt like a stall.

  return (
    <div className="w-full">
      {/* ── ReddGrow-style 2-column hero ────────────────────────────────
          Left: welcome line + headline + plan list (compact).
          Right: infinite-scrolling marquee of real generated videos. */}
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
        {/* ── Left column ───────────────────────────────────────────── */}
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600">
            Welcome
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-[#121212] sm:text-5xl">
            Fastest Ad UGC creator <em className="italic font-normal text-[#121212]/80">on Autopilot</em>
          </h1>
          <p className="mt-4 text-base text-[#6b6b76]">
            Pick a plan to generate AI UGC videos and auto-post to your socials. Cancel any time.
          </p>

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Plan cards stacked vertically, ReddGrow style */}
          <div className="mt-6 space-y-3">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all sm:flex-row sm:items-center sm:gap-5 ${
                  plan.popular
                    ? 'border-purple-500 bg-white shadow-[0_0_0_3px_rgba(168,85,247,0.15)]'
                    : 'border-[#e5e5e5] bg-white hover:border-[#bdbdbd]'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-5 rounded-full bg-purple-600 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}

                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#6b6b76]">
                      {plan.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-[#121212]">
                      ${plan.priceMonthly}
                    </span>
                    <span className="text-sm text-[#6b6b76]">/mo</span>
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-[#6b6b76] sm:grid-cols-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                        <span className="truncate">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  disabled={!!loading}
                  onClick={() => handleSubscribe(plan.tier)}
                  className={`mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all sm:mt-0 sm:w-auto ${
                    plan.popular
                      ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.45)] hover:bg-purple-700'
                      : 'bg-[#121212] text-white hover:bg-[#333]'
                  } disabled:opacity-50`}
                  aria-label={`Subscribe to ${plan.name} plan at $${plan.priceMonthly} per month`}
                >
                  {loading === plan.tier ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Get started
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs text-[#6b6b76]">
            Cancel anytime · No contracts · ~300 credits per 10s video (~$3)
          </p>

          {/* ── FAQ (left column, below pricing) ──────────────────── */}
          <div className="mt-12">
            <h2 className="text-xl font-bold text-[#121212]">
              Frequently asked questions
            </h2>
            <div className="mt-5 space-y-2">
              {FAQ.map((item, i) => (
                <div
                  key={item.q}
                  className="rounded-xl border border-[#d4d4d4] bg-white transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-[#121212] transition-colors hover:text-[#6b6b76]"
                  >
                    {item.q}
                    <ChevronDown
                      className={`ml-3 h-4 w-4 shrink-0 text-[#6b6b76] transition-transform ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-[#d4d4d4] px-5 py-4 text-sm leading-relaxed text-[#6b6b76]">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column: infinite video marquee (sticky on desktop) ── */}
        <div className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start">
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">
            Real community creations
          </p>
          <VideoMarquee />
        </div>
      </div>

      {/* ── Bottom spacer ─────────────────────────────────────────────── */}
      <div className="h-12" />
    </div>
  );
}
