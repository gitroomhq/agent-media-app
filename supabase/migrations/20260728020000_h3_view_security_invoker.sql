-- Migration: H3 — definer views leak all-tenant economics + anon reads COGS
--
-- Finding H3 (see 50-Security/Security-Findings.md):
--   * Economics/summary views ship without `security_invoker`, so on Postgres 15
--     they evaluate with the OWNER's privileges and bypass the querying role's
--     RLS. They expose per-tenant / all-tenant economics including
--     provider_cost_usd and computed margin, with no auth.uid() filter in the
--     view body:
--       - generation_economics     (20260216000028:36-52) provider_cost_usd + margin per completed job, ALL tenants
--       - unit_economics_by_model  (20260216000028:11-28) per-model COGS/margin rollups (INTERNAL only)
--       - user_generation_summary  (20260216000013:31-43) per-user job totals, ALL tenants
--   * model_pricing_select_anon (20260216000012_rls_policies.sql:111-114) grants
--     ANON read of model_pricing.provider_cost_usd via `USING (true)`, despite
--     that column being marked "Never exposed to users."
--
-- Postgres 15 (config.toml major_version = 15) supports security_invoker on
-- views, so this is an omission, not a platform limitation. Setting
-- security_invoker = on makes each view enforce the RLS of the *caller* instead
-- of the view owner. The three views below read from RLS-protected base tables
-- (generation_jobs, model_pricing), so invoker semantics correctly scope
-- generation_economics / user_generation_summary to the calling user's own rows
-- and gate unit_economics_by_model's COGS behind model_pricing RLS. Workers and
-- api-v2 read via the service-role client (bypasses RLS), so they are unaffected.
--
-- DELIBERATELY EXCLUDED (verified against the actual schema, not just the vault):
--   * public_models — intentionally public catalog view consumed by anon.
--   * generation_dispatch_depth — DOES NOT EXIST: dropped by
--       20260504000001_dispatch_status_view.sql (`drop view if exists
--       public.generation_dispatch_depth cascade`). Altering it would abort this
--       whole transaction.
--   * generation_dispatch_status — an intentional DEFINER ops view. It reads
--       pgmq.q_generation_dispatch and is granted to anon/authenticated
--       SPECIFICALLY so it can surface queue depth/age to /admin/metrics WITHOUT
--       leaking pgmq SELECT privileges to those roles (see its own migration
--       comment). It exposes only aggregate counts (depth, oldest/newest age),
--       NO tenant data. Flipping it to security_invoker would make anon evaluate
--       it under a role with no pgmq grant and break the metrics page. Left as-is.

BEGIN;

-- 1. Force the leaking economics/summary views to run with the caller's
--    privileges / RLS. ALTER VIEW ... SET (...) is idempotent and re-runnable.
ALTER VIEW public.generation_economics      SET (security_invoker = on);
ALTER VIEW public.unit_economics_by_model   SET (security_invoker = on);
ALTER VIEW public.user_generation_summary   SET (security_invoker = on);

-- NOTE: public_models, generation_dispatch_depth (dropped) and
-- generation_dispatch_status (intentional definer ops view) are left untouched.

-- 2. Remove BOTH permissive SELECT policies on model_pricing.
--
--    20260216000012_rls_policies.sql created two `USING (true)` policies — one for
--    anon, one for authenticated. Dropping only the anon one still leaves
--    provider_cost_usd (and therefore our margins) readable by any signed-up user,
--    which is the same leak with one extra step. Both must go.
--
--    Safe for the app: the only reader is the `pricing` edge function, which uses
--    supabaseAdmin() (service_role, bypasses RLS). Customer-facing pricing is
--    served by the public_models view, which deliberately excludes
--    provider_cost_usd — see 20260216000013_views.sql.
DROP POLICY IF EXISTS model_pricing_select_anon ON public.model_pricing;
DROP POLICY IF EXISTS model_pricing_select_authenticated ON public.model_pricing;

COMMIT;
