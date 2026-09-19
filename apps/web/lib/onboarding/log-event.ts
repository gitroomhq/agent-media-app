// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { captureMessage } from '@sentry/nextjs';
import type { OnboardingEvent, OnboardingStep } from './events';
/** Best effort: expose delivery failures to operators without blocking checkout. */
export async function logOnboardingEvent(step: OnboardingStep, event: OnboardingEvent, data: Record<string, unknown> = {}) {
  try {
    const response = await fetch('/api/onboarding/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, event, data }), keepalive: true,
    });
    if (!response.ok) {
      captureMessage('Onboarding event delivery failed', { level: 'warning', tags: { step, event, status: String(response.status) } });
    }
  } catch {
    // No payload or identity in telemetry. Reporting must also remain non-blocking.
    try { captureMessage('Onboarding event transport failed', { level: 'warning', tags: { step, event } }); } catch { /* best effort */ }
  }
}
