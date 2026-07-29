// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * useOnboardingEvent(step)
 *
 * Fire-and-forget logger that hits POST /api/onboarding/event with
 * { step, event: 'entered' } once per mount. Used by each onboarding
 * page to record where the user is so we can build a churn funnel.
 *
 * Failures are silent on purpose - this must NEVER break the page.
 */

import { useEffect } from 'react';

export type OnboardingStep =
  | 'welcome'
  | 'showcase'
  | 'product'
  | 'source'
  | 'goal'
  | 'tool'
  | 'preparing'
  | 'plan'
  | 'completed';

export function useOnboardingEvent(step: OnboardingStep) {
  useEffect(() => {
    let cancelled = false;
    fetch('/api/onboarding/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, event: 'entered' }),
      keepalive: true,
    }).catch(() => {
      // intentionally swallowed
    });
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [step]);
}

/**
 * Imperatively log a different event (e.g. user clicked Skip).
 * Returns a promise but callers usually don't need to await it.
 */
export function logOnboardingEvent(
  step: OnboardingStep,
  event: 'entered' | 'completed' | 'skipped',
  data?: Record<string, unknown>,
) {
  return fetch('/api/onboarding/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, event, data: data ?? {} }),
    keepalive: true,
  }).catch(() => {
    // swallow
  });
}
