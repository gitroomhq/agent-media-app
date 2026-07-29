-- vNext primitive runtime tables.
--
-- Fresh data plane for the primitive architecture (see
-- docs/handover/2026-05-27-primitive-architecture/). The legacy
-- generation_jobs table is deliberately NOT reused — that was the
-- biggest trap called out by the previous engineer.
--
-- Status values:
--   submitted   -- worker accepted, no provider call yet
--   running     -- provider task in flight
--   succeeded   -- artifact uploaded, credits reconciled
--   failed      -- terminal failure (validation, budget, provider, etc.)
--   canceled    -- explicit cancel by user / runtime
--
-- All access is mediated by service-role today (worker + api-v2 only).
-- RLS denies all rows to anon/authenticated until per-user policies
-- land in a follow-up migration once the API surface is settled.

-- ── primitive_runs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.primitive_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_run_id uuid,
  primitive_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted', 'running', 'succeeded', 'failed', 'canceled')),
  input jsonb NOT NULL,
  idempotency_key text,
  provider_task_id text,
  estimated_credits_usd numeric(10, 4),
  actual_credits_usd numeric(10, 4),
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_primitive_runs_user_created
  ON public.primitive_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_primitive_runs_primitive_status
  ON public.primitive_runs (primitive_id, status);

CREATE INDEX IF NOT EXISTS idx_primitive_runs_skill_run
  ON public.primitive_runs (skill_run_id)
  WHERE skill_run_id IS NOT NULL;

-- Partial unique idempotency: same (user, primitive, key) collapses to one run.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_primitive_runs_idempotency
  ON public.primitive_runs (user_id, primitive_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.primitive_runs ENABLE ROW LEVEL SECURITY;

-- ── primitive_artifacts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.primitive_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primitive_run_id uuid NOT NULL REFERENCES public.primitive_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  url text NOT NULL,
  bytes bigint,
  mime text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_primitive_artifacts_run
  ON public.primitive_artifacts (primitive_run_id);

ALTER TABLE public.primitive_artifacts ENABLE ROW LEVEL SECURITY;

-- ── primitive_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.primitive_events (
  id bigserial PRIMARY KEY,
  primitive_run_id uuid NOT NULL REFERENCES public.primitive_runs(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  code text NOT NULL,
  message jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_primitive_events_run_ts
  ON public.primitive_events (primitive_run_id, ts);

ALTER TABLE public.primitive_events ENABLE ROW LEVEL SECURITY;

-- ── provider_tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primitive_run_id uuid NOT NULL REFERENCES public.primitive_runs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_task_id text,
  status text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_tasks_run
  ON public.provider_tasks (primitive_run_id);

CREATE INDEX IF NOT EXISTS idx_provider_tasks_external
  ON public.provider_tasks (provider, external_task_id)
  WHERE external_task_id IS NOT NULL;

ALTER TABLE public.provider_tasks ENABLE ROW LEVEL SECURITY;

-- ── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_primitive_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_primitive_runs_updated_at ON public.primitive_runs;
CREATE TRIGGER trg_primitive_runs_updated_at
  BEFORE UPDATE ON public.primitive_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_primitive_updated_at();

DROP TRIGGER IF EXISTS trg_provider_tasks_updated_at ON public.provider_tasks;
CREATE TRIGGER trg_provider_tasks_updated_at
  BEFORE UPDATE ON public.provider_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_primitive_updated_at();

-- ── Service-role grants only; no anon/authenticated policies yet. ──────────
-- The worker and api-v2 talk to these tables via the service role key.
-- User-facing read policies will land when the GET /v1/primitives/:run_id
-- endpoint is added.
