-- Tooling-First V1: runtime graph execution + approved marketplace.
-- Additive migration; no existing table behavior changes.

-- ── Runtime graph run state ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tooling_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  graph jsonb NOT NULL,
  budget jsonb NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tooling_runs_user_created
  ON public.tooling_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tooling_run_steps (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.tooling_runs(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempt integer NOT NULL CHECK (attempt > 0),
  output jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tooling_run_steps_run_created
  ON public.tooling_run_steps (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tooling_run_steps_lookup
  ON public.tooling_run_steps (run_id, step_id, attempt DESC);

CREATE TABLE IF NOT EXISTS public.tooling_run_events (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.tooling_runs(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tooling_run_events_run_created
  ON public.tooling_run_events (run_id, id ASC);

-- ── Tooling marketplace (approved creators only) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.tooling_skill_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  skill_json jsonb NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  approved_creator boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_tooling_skill_packages_name_created
  ON public.tooling_skill_packages (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tooling_skill_packages_review
  ON public.tooling_skill_packages (review_state, approved_creator);

CREATE TABLE IF NOT EXISTS public.tooling_skill_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.tooling_skill_packages(id) ON DELETE CASCADE,
  pinned_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('installed', 'rolled_back')) DEFAULT 'installed',
  installed_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tooling_skill_installs_user_created
  ON public.tooling_skill_installs (user_id, installed_at DESC);

-- ── Row-level security ────────────────────────────────────────────────────
ALTER TABLE public.tooling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_skill_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tooling_skill_installs ENABLE ROW LEVEL SECURITY;

-- tooling_runs
CREATE POLICY tooling_runs_owner_select ON public.tooling_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tooling_runs_owner_insert ON public.tooling_runs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY tooling_runs_owner_update ON public.tooling_runs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tooling_runs_owner_delete ON public.tooling_runs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY tooling_runs_service_all ON public.tooling_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tooling_run_steps (ownership inherited through tooling_runs.user_id)
CREATE POLICY tooling_run_steps_owner_select ON public.tooling_run_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_steps.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_steps_owner_insert ON public.tooling_run_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_steps.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_steps_owner_update ON public.tooling_run_steps
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_steps.run_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_steps.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_steps_owner_delete ON public.tooling_run_steps
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_steps.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_steps_service_all ON public.tooling_run_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tooling_run_events (ownership inherited through tooling_runs.user_id)
CREATE POLICY tooling_run_events_owner_select ON public.tooling_run_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_events.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_events_owner_insert ON public.tooling_run_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_events.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_events_owner_update ON public.tooling_run_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_events.run_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_events.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_events_owner_delete ON public.tooling_run_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tooling_runs r
      WHERE r.id = tooling_run_events.run_id
        AND r.user_id = auth.uid()
    )
  );
CREATE POLICY tooling_run_events_service_all ON public.tooling_run_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tooling_skill_packages
CREATE POLICY tooling_skill_packages_owner_select ON public.tooling_skill_packages
  FOR SELECT TO authenticated USING (creator_id = auth.uid());
CREATE POLICY tooling_skill_packages_owner_insert ON public.tooling_skill_packages
  FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY tooling_skill_packages_owner_update ON public.tooling_skill_packages
  FOR UPDATE TO authenticated USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY tooling_skill_packages_owner_delete ON public.tooling_skill_packages
  FOR DELETE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY tooling_skill_packages_service_all ON public.tooling_skill_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tooling_skill_installs
CREATE POLICY tooling_skill_installs_owner_select ON public.tooling_skill_installs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tooling_skill_installs_owner_insert ON public.tooling_skill_installs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY tooling_skill_installs_owner_update ON public.tooling_skill_installs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tooling_skill_installs_owner_delete ON public.tooling_skill_installs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY tooling_skill_installs_service_all ON public.tooling_skill_installs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
