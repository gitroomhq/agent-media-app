-- vNext primitive runtime — hardening follow-up.
--
-- Forward-only, additive. Adds:
--   1. DEFAULT gen_random_uuid() on primitive_runs.id so a future
--      code path that omits the id doesn't raise a NULL error.
--   2. Covering partial index for the per-day budget-cap query so the
--      SUM does not need a heap fetch on every row in the date window.

ALTER TABLE public.primitive_runs
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_primitive_runs_budget_cap
  ON public.primitive_runs (user_id, created_at DESC)
  INCLUDE (actual_credits_usd)
  WHERE actual_credits_usd IS NOT NULL;
