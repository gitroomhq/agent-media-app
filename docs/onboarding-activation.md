# Account access and onboarding events

Signed-in users can reach `/billing` and `/settings` (including child routes) before completing onboarding or buying a plan. The plan page links to both. These pages support credit purchases, account recovery and API-key configuration. They still require authentication. Dashboard/generation subscription and onboarding gates, API credit checks, payment fulfillment and existing historical-subscription behavior are unchanged.

The shared onboarding event contract is in `apps/web/lib/onboarding/events.ts`. The plan step is accepted by the ingestion endpoint and included in the admin funnel order. A plan click records `checkout_started`, a returned checkout URL records `checkout_ready`, and failed checkout creation records `checkout_failed`. None is proof of payment: authoritative subscriptions/credits still come from server-side billing fulfillment. The existing `completed` onboarding event also does not prove payment.

Event ingestion binds rows to the authenticated account. Invalid events are rejected; database details are not returned to the browser. Client delivery failures are reported through the existing Sentry integration without including the event payload or blocking checkout. No retry loop is added, so this remains best-effort telemetry, not an exactly-once financial ledger. Funnel reach counts distinct users; raw events can repeat on a genuine page revisit.

Run `pnpm --filter @agent-media/web test` and `pnpm --filter @agent-media/web typecheck`. Tests cover new-account recovery access, unauthenticated route protection, unchanged dashboard gates, all shared steps, checkout event semantics, invalid input, owner binding and non-blocking telemetry failures. No database migration or marketing-email send is part of this change.

## Continue a creation after sign-in or checkout

Login preserves the full local destination, including query parameters. OTP,
Google OAuth and Postiz use the same destination validation. Failed OAuth returns
to login with that destination intact, including connector consent and device
authorization flows.

When onboarding or the plan gate interrupts a dashboard/gallery visit, a
24-hour, account-scoped, HttpOnly cookie retains the destination. A subscribed
user leaving the plan picker returns there. Both billing pages offer **Continue
creating**; the link works after checkout success or cancellation and passes
through the existing access checks. A successful visit consumes the destination.
Link prefetches neither replace nor consume it. Refreshed authentication cookies
are retained on middleware redirects.

Skill forms also save editable inputs in sessionStorage for up to 24 hours,
separately for each account and skill. Restoration works in the same browser tab;
closing the tab, disabled storage, or an oversized draft can prevent recovery.
Only fields still present in the form are restored. An accepted run clears the
draft. Expiring reference URLs retain their original expiry. The recovery UI
offers login for 401 responses and billing for 402 responses.

Returning restores the page/draft for review: it never submits generation,
grants free credits, or treats a checkout return URL as proof of payment.
No Stripe fulfillment, subscription eligibility, or credit-award logic changes.
