-- vNext skill_runs ledger — tracks composed skill executions.
--
-- A skill_run groups one or more primitive_runs that share a single
-- user-facing call (e.g. make_ugc_video chains portrait_gpt2,
-- character_sheet_gpt2, simple_selfie). Each primitive_runs row already
-- carries skill_run_id as a nullable FK (column added in the original
-- 20260527150000 migration), so the composed-skill status surface joins
-- primitive_runs WHERE skill_run_id = :id.
--
-- Forward-only, additive. No existing tables are altered.

CREATE TABLE IF NOT EXISTS public.skill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_slug text NOT NULL,
  skill_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted', 'running', 'succeeded', 'failed', 'canceled')),
  input jsonb NOT NULL,
  current_step text,
  final_output jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_user_created
  ON public.skill_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_status
  ON public.skill_runs (skill_slug, status);

ALTER TABLE public.skill_runs ENABLE ROW LEVEL SECURITY;

-- Foreign key from primitive_runs.skill_run_id back to skill_runs. The
-- column already exists (added in 20260527150000); this just promotes it
-- to a real FK now that the parent table exists.
ALTER TABLE public.primitive_runs
  ADD CONSTRAINT primitive_runs_skill_run_id_fkey
  FOREIGN KEY (skill_run_id) REFERENCES public.skill_runs(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_skill_runs_updated_at ON public.skill_runs;
CREATE TRIGGER trg_skill_runs_updated_at
  BEFORE UPDATE ON public.skill_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_primitive_updated_at();
