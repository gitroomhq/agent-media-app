// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Subscription wall — shown when an authenticated user has no active
 * subscription.
 *
 * This is the marketing site's pricing card, ported from
 * agent-media-website/src/components/Section/PricingHeroSection, and nothing
 * else. What it replaced was a light-themed two-column layout with a hero, a
 * video marquee and an FAQ: the marquee rendered as six empty grey rectangles
 * because nothing populated it, and the page sat on a #ededed frame while the
 * rest of the product is black. A paying customer's first sight of the paywall
 * looked like a broken page from a different company.
 *
 * ONE CONVERSION MATTERS. The site's root font is fluid (1rem = 10px at
 * 1440px); this app uses the browser default of 16px. Every rem in the original
 * is written here as its computed pixel value — the site's `text-[5rem]` is
 * `text-[50px]`, `p-[2rem]` is `p-[20px]`. Copying the rem values across
 * verbatim would render everything 1.6x too large.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { invokeFn } from '@/lib/supabase/fn-proxy';
import { createClient } from '@/lib/supabase/client';
import { analytics } from '@/lib/analytics';

interface PlanOption {
  /** Plan tier id sent to the Supabase `checkout` function. */
  tier: string;
  bgImg: string;
  title: string;
  description: string;
  badge: string;
  price: number;
  credits: string;
  features: string[];
}

/**
 * Copy is the site's, with one deliberate reordering: the site leads on
 * capability ("Full UGC generation pipeline"), which is right for a visitor
 * deciding whether to sign up at all. Someone already signed in and looking at
 * a paywall is choosing between three tiers, so the line that actually differs
 * between them — clip length — comes first.
 */
const PLANS: PlanOption[] = [
  {
    tier: 'starter',
    bgImg: '/assets/pricing/bg/1.png',
    title: 'Creator',
    description: 'For creators shipping UGC content consistently.',
    badge: '',
    price: 39,
    credits: '≈ 3,900 credits / month',
    features: [
      'Up to 10s videos',
      'Full UGC generation pipeline',
      '200+ AI actors',
      '17 animated caption styles',
      'CLI, MCP, REST API & SDKs',
    ],
  },
  {
    tier: 'creator',
    bgImg: '/assets/pricing/bg/2.png',
    title: 'Pro',
    description: 'For professionals running production-scale content pipelines.',
    badge: 'Most popular',
    price: 69,
    credits: '≈ 6,900 credits / month',
    features: [
      'Up to 15s videos',
      'Batch generation via CLI or API',
      'Persistent characters for campaigns',
      'Auto-publishing to social channels',
      '1080p exports with no watermark',
    ],
  },
  {
    tier: 'pro_plus',
    bgImg: '/assets/pricing/bg/3.png',
    title: 'Pro Plus',
    description: 'For high-volume teams and agencies.',
    badge: '',
    price: 129,
    credits: '≈ 12,900 credits / month',
    features: [
      'Up to 15s videos',
      'Early access to improved UGC tools',
      'Batch generation via CLI or API',
      'Auto-publishing to social channels',
      '1080p exports with no watermark',
    ],
  },
];

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analytics.init();
    analytics.trackEvent('subscribe_page_viewed');
  }, []);

  // Middleware already guarantees anyone landing here is unsubscribed, so the
  // pricing renders immediately and this never blocks the UI. It exists only to
  // catch someone who bookmarked /subscribe and has since paid.
  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error: fnError } = await invokeFn('credits-check', { method: 'GET' });
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
      // dub.co affiliate click id, set as a cookie by the analytics script.
      const dubId = document.cookie.match(/(?:^|;\s*)dub_id=([^;]*)/)?.[1] || undefined;

      const { data, error: fnError } = await invokeFn('checkout', {
        body: { plan_tier: tier, ...(dubId ? { dub_id: dubId } : {}) },
      });

      if (fnError) throw new Error(fnError.message || 'Checkout failed');
      if (data?.checkout_url) window.location.href = data.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-6">
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-[16px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-[14px] text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map(({ tier, bgImg, title, badge, price, description, features, credits }, index) => (
          // h-full + flex so the three cards are the same height and their CTAs
          // share a baseline. The site's version doesn't need this because its
          // plan descriptions happen to wrap to the same number of lines; ours
          // don't, and a staggered row of buttons reads as broken.
          <div key={tier} className="relative flex h-full flex-col overflow-hidden rounded-[20px] p-5">
            {/* Decorative card art. alt="" — the plan is fully described in text. */}
            <div className="absolute inset-0">
              <Image
                src={bgImg}
                width={363}
                height={490}
                quality={100}
                priority
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] border-gradient border-gradient-card-secondary" />

            <div className="relative flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px]/[150%] font-bold text-white">{title}</h2>
                {badge && (
                  <div className="absolute right-0 rounded-full bg-gradient-to-b from-white to-white/80 px-2 py-0.5 text-[16px]/[150%] font-medium tracking-[-0.02em] text-black">
                    {badge}
                  </div>
                )}
              </div>

              <div className="mt-1 text-[50px]/[108%] font-bold tracking-[-0.05em] text-white">
                ${price} <span className="text-[16px]/[150%] tracking-normal">/mo</span>
              </div>

              <div className="mt-3 text-pretty text-[16px]/[150%] font-medium tracking-[-0.02em] text-white/85 lg:text-[20px]/[140%]">
                {description}
              </div>

              <div className="mt-5 flex flex-col gap-2">
                {features.map((feature) => (
                  <div
                    key={feature}
                    className="grid grid-cols-[20px_auto] gap-2 text-[14px]/[143%] font-medium tracking-[-0.02em] text-white/85"
                  >
                    <Plus className="h-5 w-5 opacity-50" aria-hidden="true" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* mt-auto: the divider down is the card's footer, pinned to the
                  bottom so credits and CTA line up across all three. */}
              <div className="mt-auto pt-7" />
              <div className="mb-5 border-t border-white opacity-10" />

              <div className="text-[24px]/[117%] font-bold tracking-[-0.04em] text-white">
                {credits}
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() => handleSubscribe(tier)}
                  aria-label={`Subscribe to ${title} at $${price} per month`}
                  className={`inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50 ${
                    index % 2
                      ? 'bg-white text-black'
                      : 'bg-[#9162FF] text-white shadow-[0_0_28px_rgba(145,98,255,0.45)]'
                  }`}
                >
                  {loading === tier ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  {loading === tier ? 'Starting checkout…' : 'Get Started'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[14px]/[150%] text-white/50">
        Cancel anytime · No contracts · ~300 credits per 10s video (~$3)
      </p>
    </section>
  );
}
