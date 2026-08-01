// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step - "How did you find AgentMedia?".
 *
 * A grid of attribution pills. Exactly one is selectable at a time.
 * "Other" is just recorded as "other" - we intentionally do NOT ask a
 * follow-up "what" because that drops conversion.
 *
 * On Continue:
 *   1. POST /api/onboarding/answer { step: 'source', answer: { source } }
 *   2. router.push('/onboarding/goal') - final step does the complete.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

const SOURCES = [
  'X / Twitter',
  'Friend / Referral',
  'Instagram',
  'Facebook',
  'ChatGPT',
  'TikTok',
  'Reddit',
  'Google',
  'YouTube',
  'Blog or Article',
  'Other',
] as const;

type Source = (typeof SOURCES)[number];

export default function OnboardingSourcePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Source | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOnboardingEvent('source');

  async function handleContinue() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const answerRes = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'source', answer: { source: selected } }),
      });
      if (!answerRes.ok) {
        const body = await answerRes.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${answerRes.status})`);
      }
      logOnboardingEvent('source', 'completed', { source: selected });
      router.push('/onboarding/goal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const canContinue = !!selected;

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/onboarding/product"
          className="inline-flex items-center gap-3 text-sm font-semibold text-black transition-opacity hover:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
            <AgentMediaLogo size={22} color="#FFFFFF" />
          </span>
          <span style={{ letterSpacing: '-0.01em' }}>agent-media</span>
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
          How did you find AgentMedia?
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          Help us understand how you discovered us.
        </p>

        <div className="mt-8 flex w-full max-w-2xl flex-wrap items-center justify-center gap-3">
          {SOURCES.map((s) => {
            const isActive = selected === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelected(s)}
                disabled={submitting}
                className="rounded-full px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                style={{
                  color: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.85)',
                  backgroundColor: isActive ? '#0E0E0E' : '#FFFFFF',
                  border: isActive ? '1px solid #0E0E0E' : '1px solid rgba(0,0,0,0.12)',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Continue (dark Home2CTAButton). Disabled visual until a
         *  pill is selected. */}
        <div
          className="mt-10"
          onClickCapture={(e) => {
            e.preventDefault();
            if (canContinue && !submitting) handleContinue();
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

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}
      </main>
    </div>
  );
}
