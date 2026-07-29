-- Backfill migration for already-applied tooling-first v1 release.
-- Adds missing RLS policies and shared tooling_run_events table safely.

CREATE TABLE IF NOT EXISTS public.tooling_run_events (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.tooling_runs(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tooling_run_events_run_created
  ON public.tooling_run_events (run_id, id ASC);

ALTER TABLE IF EXISTS public.tooling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tooling_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tooling_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tooling_skill_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tooling_skill_installs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_runs' AND policyname = 'tooling_runs_owner_select'
  ) THEN
    CREATE POLICY tooling_runs_owner_select ON public.tooling_runs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_runs' AND policyname = 'tooling_runs_owner_insert'
  ) THEN
    CREATE POLICY tooling_runs_owner_insert ON public.tooling_runs
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_runs' AND policyname = 'tooling_runs_owner_update'
  ) THEN
    CREATE POLICY tooling_runs_owner_update ON public.tooling_runs
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_runs' AND policyname = 'tooling_runs_owner_delete'
  ) THEN
    CREATE POLICY tooling_runs_owner_delete ON public.tooling_runs
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_runs' AND policyname = 'tooling_runs_service_all'
  ) THEN
    CREATE POLICY tooling_runs_service_all ON public.tooling_runs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_steps' AND policyname = 'tooling_run_steps_owner_select'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_steps' AND policyname = 'tooling_run_steps_owner_insert'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_steps' AND policyname = 'tooling_run_steps_owner_update'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_steps' AND policyname = 'tooling_run_steps_owner_delete'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_steps' AND policyname = 'tooling_run_steps_service_all'
  ) THEN
    CREATE POLICY tooling_run_steps_service_all ON public.tooling_run_steps
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_events' AND policyname = 'tooling_run_events_owner_select'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_events' AND policyname = 'tooling_run_events_owner_insert'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_events' AND policyname = 'tooling_run_events_owner_update'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_events' AND policyname = 'tooling_run_events_owner_delete'
  ) THEN
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
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_run_events' AND policyname = 'tooling_run_events_service_all'
  ) THEN
    CREATE POLICY tooling_run_events_service_all ON public.tooling_run_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_packages' AND policyname = 'tooling_skill_packages_owner_select'
  ) THEN
    CREATE POLICY tooling_skill_packages_owner_select ON public.tooling_skill_packages
      FOR SELECT TO authenticated USING (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_packages' AND policyname = 'tooling_skill_packages_owner_insert'
  ) THEN
    CREATE POLICY tooling_skill_packages_owner_insert ON public.tooling_skill_packages
      FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_packages' AND policyname = 'tooling_skill_packages_owner_update'
  ) THEN
    CREATE POLICY tooling_skill_packages_owner_update ON public.tooling_skill_packages
      FOR UPDATE TO authenticated USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_packages' AND policyname = 'tooling_skill_packages_owner_delete'
  ) THEN
    CREATE POLICY tooling_skill_packages_owner_delete ON public.tooling_skill_packages
      FOR DELETE TO authenticated USING (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_packages' AND policyname = 'tooling_skill_packages_service_all'
  ) THEN
    CREATE POLICY tooling_skill_packages_service_all ON public.tooling_skill_packages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_installs' AND policyname = 'tooling_skill_installs_owner_select'
  ) THEN
    CREATE POLICY tooling_skill_installs_owner_select ON public.tooling_skill_installs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_installs' AND policyname = 'tooling_skill_installs_owner_insert'
  ) THEN
    CREATE POLICY tooling_skill_installs_owner_insert ON public.tooling_skill_installs
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_installs' AND policyname = 'tooling_skill_installs_owner_update'
  ) THEN
    CREATE POLICY tooling_skill_installs_owner_update ON public.tooling_skill_installs
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_installs' AND policyname = 'tooling_skill_installs_owner_delete'
  ) THEN
    CREATE POLICY tooling_skill_installs_owner_delete ON public.tooling_skill_installs
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tooling_skill_installs' AND policyname = 'tooling_skill_installs_service_all'
  ) THEN
    CREATE POLICY tooling_skill_installs_service_all ON public.tooling_skill_installs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
