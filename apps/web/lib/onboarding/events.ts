// Copyright 2026 agent-media contributors. Apache-2.0 license.
export const ONBOARDING_STEPS = ['welcome', 'showcase', 'product', 'source', 'goal', 'tool', 'preparing', 'plan', 'completed'] as const;
export type OnboardingStep = typeof ONBOARDING_STEPS[number];
export const ONBOARDING_EVENTS = ['entered', 'completed', 'skipped', 'checkout_started', 'checkout_ready', 'checkout_failed'] as const;
export type OnboardingEvent = typeof ONBOARDING_EVENTS[number];
export function parseOnboardingEvent(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Expected an event object' } as const;
  const input = body as Record<string, unknown>;
  const step = typeof input.step === 'string' ? input.step.trim() : '';
  const event = input.event === undefined ? 'entered' : input.event;
  if (!(ONBOARDING_STEPS as readonly unknown[]).includes(step)) return { error: 'Invalid onboarding step' } as const;
  if (!(ONBOARDING_EVENTS as readonly unknown[]).includes(event)) return { error: 'Invalid onboarding event' } as const;
  if (String(event).startsWith('checkout_') && step !== 'plan') return { error: 'Checkout events require the plan step' } as const;
  const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data as Record<string, unknown> : {};
  return { value: { step: step as OnboardingStep, event: event as OnboardingEvent, data } } as const;
}
