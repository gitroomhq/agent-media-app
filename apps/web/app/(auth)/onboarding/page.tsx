// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step 1 - welcome.
 *
 * Plain white surface with the AgentMedia logo in BLACK (since the bg
 * is white this round), big "Welcome" headline, and a single primary
 * CTA. Top-left holds a back link + small wordmark. We'll iterate on
 * subsequent steps.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

// Map a stored onboarding_step back to the route the user should resume
// on. Welcome itself is also a valid resume target (or first visit).
const STEP_TO_ROUTE: Record<string, string> = {
  welcome:   '/onboarding',
  showcase:  '/onboarding/showcase',
  product:   '/onboarding/product',
  source:    '/onboarding/source',
  goal:      '/onboarding/goal',
  tool:      '/onboarding/tool',
  preparing: '/onboarding/preparing',
  plan:      '/onboarding/plan',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  useOnboardingEvent('welcome');

  // Resume logic: if profiles.onboarding_step is anything other than
  // null/'welcome', skip past the welcome screen and drop the user
  // back where they were. Best-effort - any failure leaves them on
  // the welcome page, which is harmless.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/state', { method: 'GET' });
        if (!res.ok) return;
        const body = (await res.json()) as {
          onboarded_at?: string | null;
          onboarding_step?: string | null;
        };
        if (cancelled) return;
        if (body.onboarded_at) {
          // Already done - nudge them into the app.
          router.replace('/dashboard');
          return;
        }
        const step = body.onboarding_step;
        if (step && step !== 'welcome') {
          const dest = STEP_TO_ROUTE[step];
          if (dest && dest !== '/onboarding') {
            router.replace(dest);
          }
        }
      } catch {
        // swallow - leave the user on the welcome page
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleGetStarted() {
    setSubmitting(true);
    logOnboardingEvent('welcome', 'completed');
    router.push('/onboarding/showcase');
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white text-black">
      {/* Top-left brand cluster */}
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>AgentMedia</span>
        </Link>
      </header>

      {/* Centered welcome */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <span
          aria-hidden
          className="mb-10 flex h-28 w-28 items-center justify-center rounded-[28px] bg-black"
        >
          <AgentMediaLogo size={68} color="#FFFFFF" />
        </span>
        <h1
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(20px, 2vw, 28px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Welcome to AgentMedia!
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          You are about to grow your social
        </p>
        {/* Same dark-pill CTA component the rest of the site uses
         *  (black bg + purple halo + inner glow). We can't simply
         *  pass an onClick because Home2CTAButton renders a Link, so
         *  intercept clicks at the wrapper level and prevent default
         *  while the API call is in flight. */}
        <div
          className="mt-12"
          onClickCapture={(e) => {
            e.preventDefault();
            if (!submitting) handleGetStarted();
          }}
          aria-disabled={submitting}
          style={{ opacity: submitting ? 0.7 : 1 }}
        >
          <Home2CTAButton href="#" variant="dark" size="lg" showArrow={false}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting things ready...
              </span>
            ) : (
              'Get Started'
            )}
          </Home2CTAButton>
        </div>
      </main>
    </div>
  );
}
