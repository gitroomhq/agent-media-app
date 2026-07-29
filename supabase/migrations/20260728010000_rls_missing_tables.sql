-- Copyright 2026 agent-media contributors.
--
-- Wave 0 · FIX 2 — RLS on three tables that shipped without it (H2).
--
-- All three are reachable via the publishable anon key over PostgREST. Enabling
-- RLS with no permissive policy denies anon/authenticated; service_role (api-v2,
-- edge functions) bypasses RLS, so server-side reads/writes are unaffected.
--
-- Acceptance:
--   * anon select on stripe_webhook_events -> [] / 401
--   * a logged-in user can still write onboarding_events (click-through)
--   * rate_limit_config still readable, but no longer writable by anon/authenticated

-- onboarding_events: written by the browser as the logged-in user (SSR client =
-- authenticated, user_id = auth.uid()). Owner-scoped insert + select.
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_events_insert_own ON public.onboarding_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_events_select_own ON public.onboarding_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- stripe_webhook_events: raw Stripe payloads (customer ids, emails, amounts,
-- PaymentIntents). Written only by the webhook-stripe edge function (service_role).
-- Deny-all to anon/authenticated: RLS enabled, no policy = no non-service access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- rate_limit_config: a reference table. The real bug is it was WRITABLE by
-- anon/authenticated. Allow read; deny writes (no insert/update/delete policy).
ALTER TABLE public.rate_limit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_limit_config_read ON public.rate_limit_config
  FOR SELECT TO anon, authenticated USING (true);
