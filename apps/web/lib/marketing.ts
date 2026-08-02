// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Where "home" is, and how to leave cleanly.
 *
 * The marketing site and the product are two deployments on two hosts. Inside
 * this app, `/` is not the marketing site — on app.agent-media.ai middleware
 * sends a signed-out visitor from `/` straight back to `/login`. So every
 * "Home" affordance that linked to `/` did nothing at all: it bounced the user
 * back to the page they were already on.
 *
 * Configurable because a self-hoster has no separate marketing host; set
 * NEXT_PUBLIC_MARKETING_URL to their own, or leave it and get ours.
 */
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL?.trim() || 'https://agent-media.ai';

/** Mirrors SESSION_HINT in middleware.ts. */
const SESSION_HINT = 'am_session_hint';

/**
 * Clear the parent-domain session hint from the browser.
 *
 * Middleware clears this automatically, but only on a request that reaches
 * THIS app. Sign-out now sends people to the marketing site, which is a
 * different deployment — so without this the hint would still say "1" when
 * agent-media.ai reads it, and its middleware would bounce the freshly
 * signed-out user to app.agent-media.ai/dashboard, which would bounce them to
 * /login. They would never see the marketing page they asked for.
 *
 * The cookie is deliberately httpOnly:false (it carries no credential) so the
 * client can do exactly this.
 *
 * The domain must match the one it was set with or the delete is a no-op, and
 * we cannot read that env var from the client, so derive it from the current
 * host: `app.agent-media.ai` → `.agent-media.ai`. On localhost there is no
 * parent domain and nothing to clear.
 */
export function clearSessionHint(): void {
  if (typeof document === 'undefined') return;

  const host = window.location.hostname;
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return;

  const parts = host.split('.');
  if (parts.length < 2) return;
  const parent = `.${parts.slice(-2).join('.')}`;

  const expired = 'Thu, 01 Jan 1970 00:00:00 GMT';
  // Clear at both scopes: the parent domain it was written to, and the current
  // host in case an older build ever wrote a host-only copy.
  document.cookie = `${SESSION_HINT}=; path=/; domain=${parent}; expires=${expired}; SameSite=Lax; Secure`;
  document.cookie = `${SESSION_HINT}=; path=/; expires=${expired}; SameSite=Lax; Secure`;
}

/**
 * Sign-out destination. Send people to the marketing site rather than /login:
 * someone who just signed out is leaving, and parking them on a login form is
 * asking them to do the thing they just undid.
 */
export function goToMarketingSite(): void {
  clearSessionHint();
  window.location.href = MARKETING_URL;
}
