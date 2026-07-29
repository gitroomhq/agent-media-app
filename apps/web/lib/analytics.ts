// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Lightweight analytics wrapper.
 *
 * PostHog-ready but works standalone -- if no PostHog key is configured (or
 * posthog-js is not installed) all tracking calls gracefully degrade to
 * dev-mode console logs only.
 */

import { loadVars } from '@/components/variable-context';

type EventProperties = Record<string, string | number | boolean | null>;

class Analytics {
  private posthog: any = null;
  private initialized = false;

  async init() {
    if (this.initialized) return;

    // Runtime config, not build-time: read from the VariableContext the root
    // layout populated (window.vars), so one image works in any environment.
    // Falls back to the build-time value for non-container deployments.
    const key = loadVars().posthogKey || process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (key && typeof window !== 'undefined') {
      try {
        const ph = await import('posthog-js');
        this.posthog = ph.default;
        this.posthog.init(key, {
          api_host: 'https://us.i.posthog.com',
          loaded: () => {
            this.initialized = true;
          },
        });
      } catch {
        /* PostHog not installed, graceful degradation */
      }
    }

    this.initialized = true;
  }

  trackEvent(name: string, properties?: EventProperties) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[analytics]', name, properties);
    }
    this.posthog?.capture(name, properties);
  }

  trackPageView(path: string) {
    this.trackEvent('$pageview', { $current_url: path });
  }

  identify(userId: string, traits?: EventProperties) {
    this.posthog?.identify(userId, traits);
  }

  reset() {
    this.posthog?.reset();
  }
}

export const analytics = new Analytics();
