// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step - "What is your product / SaaS / website URL?".
 *
 * User can paste a URL or skip. The answer is PATCHed into
 * profiles.onboarding_data.product via /api/onboarding/answer, then we
 * advance to /onboarding/source (the final step) which calls
 * /api/onboarding/complete.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

export default function OnboardingProductPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOnboardingEvent('product');

  async function advance(answer: { url: string } | { skipped: true }) {
    setError(null);
    setSubmitting(true);
    try {
      const answerRes = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'product', answer }),
      });
      if (!answerRes.ok) {
        const body = await answerRes.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${answerRes.status})`);
      }
      logOnboardingEvent(
        'product',
        'skipped' in answer ? 'skipped' : 'completed',
      );
      router.push('/onboarding/source');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const trimmed = url.trim();
  const canContinue = trimmed.length > 0;

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/onboarding/showcase"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>AgentMedia</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <h1
          className="font-normal text-black"
          style={{
            fontSize: 'clamp(20px, 2vw, 28px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          What is your product / SaaS / website URL?
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          You can skip and add it later.
        </p>

        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://play.google.com/store/apps/meditation-app"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
          className="mt-8 h-14 w-full max-w-xl rounded-2xl border border-black/10 bg-white px-5 text-base text-black outline-none transition-colors placeholder:text-black/30 focus:border-black/40 disabled:opacity-60"
        />

        {/* Primary CTA - dark pill, disabled visual until input is non-empty. */}
        <div
          className="mt-8"
          onClickCapture={(e) => {
            e.preventDefault();
            if (canContinue && !submitting) {
              advance({ url: trimmed });
            }
          }}
          aria-disabled={!canContinue || submitting}
          style={{
            opacity: !canContinue || submitting ? 0.5 : 1,
            pointerEvents: !canContinue || submitting ? 'none' : 'auto',
          }}
        >
          <Home2CTAButton href="#" variant="dark" size="lg" showArrow={false}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Continue
              </span>
            ) : (
              'Continue'
            )}
          </Home2CTAButton>
        </div>

        {/* Secondary skip — saves answer:{skipped:true} so we know
         *  the user actively opted out, then completes onboarding. */}
        <button
          type="button"
          onClick={() => advance({ skipped: true })}
          disabled={submitting}
          className="mt-4 text-sm transition-opacity hover:opacity-100 disabled:opacity-40"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          Skip for now
        </button>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}
      </main>
    </div>
  );
}
