-- Copyright 2026 agent-media contributors.
--
-- Wave 0 · FIX 1 — durable EXECUTE lock on public schema functions (C1).
--
-- Codifies the REVOKE that was applied BY HAND in the SQL editor during the C1
-- incident, so a `supabase db reset` / `db push` can never replay the migration
-- set and silently re-open the hole.
--
-- Incident (C1): ten SECURITY DEFINER money functions (add_purchased_credits,
-- deduct_credits, refund_credits, reset_monthly_credits, check_and_topup,
-- reconcile_credits, recover_stuck_jobs, consume_device_raw_key,
-- ensure_user_credits, reconcile_unrefunded_failed_jobs) shipped with the
-- Postgres/Supabase-default EXECUTE grant to PUBLIC/anon/authenticated and no
-- REVOKE anywhere in the prior migrations. Anyone with the publishable anon key
-- could mint credits, drain a balance, refund a delivered render, or extract a
-- plaintext ma_ key. Live-probed and closed this session; this makes it durable.
--
-- api-v2 and the edge functions are UNAFFECTED — they call these through the
-- service_role client, re-granted below. Triggers fire internally and do not
-- require caller EXECUTE, so signups / inserts are unaffected.
--
-- Acceptance: the C1 probe returns 42501 for anon AND a real authenticated JWT;
-- a POST /v1/skills/:slug/run still deducts and writes its credit_transactions.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
