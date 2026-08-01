// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Onboarding step - "What is your goal with agent-media?".
 *
 * Multi-select pill grid. Each pill toggles independently; the answer
 * is recorded as an array of selected labels in
 * profiles.onboarding_data.goal. Hands off to /onboarding/tool, which
 * is the final step that calls /api/onboarding/complete.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { AgentMediaLogo } from '@/components/agent-media-logo';
import { Home2CTAButton } from '@/components/home2-cta-button';
import { useOnboardingEvent, logOnboardingEvent } from '@/components/onboarding/use-onboarding-event';

const GOALS = [
  'Grow TikTok pages',
  'Grow Instagram pages',
  'Grow Facebook pages',
  'Grow X pages',
  'Get sales/users',
  'Increase brand awareness',
  'Not sure yet',
  'Other',
] as const;

type Goal = (typeof GOALS)[number];

export default function OnboardingGoalPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Goal>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useOnboardingEvent('goal');

  function toggle(g: Goal) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const answerRes = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'goal',
          answer: { goals: Array.from(selected) },
        }),
      });
      if (!answerRes.ok) {
        const body = await answerRes.json().catch(() => ({}));
        throw new Error(body?.error || `Save failed (${answerRes.status})`);
      }
      logOnboardingEvent('goal', 'completed', {
        goals: Array.from(selected),
      });
      router.push('/onboarding/tool');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  const canContinue = selected.size > 0;

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-black">
      <header className="flex w-full items-center justify-between px-6 py-6">
        <Link
          href="/onboarding/source"
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
          What is your goal with agent-media?
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: 'rgba(0,0,0,0.55)' }}
        >
          Tell us about what you&apos;re hoping to achieve.
        </p>

        <div className="mt-8 flex w-full max-w-2xl flex-wrap items-center justify-center gap-3">
          {GOALS.map((g) => {
            const isActive = selected.has(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                style={{
                  color: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.85)',
                  backgroundColor: isActive ? '#0E0E0E' : '#FFFFFF',
                  border: isActive ? '1px solid #0E0E0E' : '1px solid rgba(0,0,0,0.12)',
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: isActive ? '#FF6B35' : 'transparent',
                    border: isActive
                      ? '1px solid #FF6B35'
                      : '1px solid rgba(0,0,0,0.18)',
                  }}
                  aria-hidden
                >
                  {isActive ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                </span>
                {g}
              </button>
            );
          })}
        </div>

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
