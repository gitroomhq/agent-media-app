// Copyright 2026 agent-media contributors. Apache-2.0 license.
'use client';
import { useEffect } from 'react';
import type { OnboardingStep } from '@/lib/onboarding/events';
import { logOnboardingEvent } from '@/lib/onboarding/log-event';
export type { OnboardingStep } from '@/lib/onboarding/events';
export { logOnboardingEvent } from '@/lib/onboarding/log-event';
export function useOnboardingEvent(step: OnboardingStep) {
  useEffect(() => { void logOnboardingEvent(step, 'entered'); }, [step]);
}
