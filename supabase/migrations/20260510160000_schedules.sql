-- Recurring video schedules — the cron layer that powers /jobs.
--
-- A schedule is a parameterized job template that fires every N hours.
-- Each fire creates a row in generation_jobs with input_params.schedule_id
-- so the /jobs dashboard can find them and the webhook → Postiz fanout
-- still flows through the existing webhook-provider edge function.
--
-- Subscription-tier rate limits are enforced at INSERT time via a
-- BEFORE INSERT trigger that checks max_schedules_for_tier() and
-- min_cadence_for_tier(). Same checks at PATCH time on cadence changes.

CREATE TABLE IF NOT EXISTS public.video_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  generator_id        text NOT NULL CHECK (generator_id IN (
                        'ugc_video', 'show_your_app', 'product_acting_ugc',
                        'laptop_ugc', 'character_video', 'saas_review'
                      )),
  job_params          jsonb NOT NULL,                 -- the body sent to /v1/generate/<generator_id>
  caption_template    text,                           -- optional; falls back to action_prompt etc.
  cadence_hours       int  NOT NULL CHECK (cadence_hours BETWEEN 1 AND 168),
  postiz_integration_ids text[] NOT NULL DEFAULT '{}',
  enabled             boolean NOT NULL DEFAULT true,
  next_run_at         timestamptz NOT NULL DEFAULT now(),
  last_run_at         timestamptz,
  last_run_job_id     uuid REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  failure_count       int NOT NULL DEFAULT 0,         -- consecutive failures; auto-disable threshold = 5
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.video_schedules IS
  'Recurring video generation schedules. The schedule-runner edge function fires every 5 min via pg_cron, picks rows where enabled AND next_run_at <= now(), creates a generation_jobs row per schedule, and bumps next_run_at += cadence_hours.';

CREATE INDEX IF NOT EXISTS idx_video_schedules_user
  ON public.video_schedules (user_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_video_schedules_due
  ON public.video_schedules (next_run_at)
  WHERE enabled = true AND archived_at IS NULL;

-- updated_at auto-bump on UPDATE
CREATE OR REPLACE FUNCTION public.video_schedules_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_schedules_updated_at ON public.video_schedules;
CREATE TRIGGER trg_video_schedules_updated_at
  BEFORE UPDATE ON public.video_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.video_schedules_set_updated_at();

-- ── Tier limit helpers ─────────────────────────────────────────────────────
--
-- Source of truth lives here so every consumer (edge function, api-v2
-- route, future CLI command) reads the same numbers.

CREATE OR REPLACE FUNCTION public.max_schedules_for_tier(p_tier text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_tier, 'free')
    WHEN 'free'      THEN 0
    WHEN 'starter'   THEN 1
    WHEN 'creator'   THEN 3
    WHEN 'pro_plus'  THEN 10
    WHEN 'pro+'      THEN 10
    WHEN 'admin'     THEN 100
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.min_cadence_for_tier(p_tier text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_tier, 'free')
    WHEN 'free'      THEN 168 -- effectively disabled
    WHEN 'starter'   THEN 24
    WHEN 'creator'   THEN 6
    WHEN 'pro_plus'  THEN 1
    WHEN 'pro+'      THEN 1
    WHEN 'admin'     THEN 1
    ELSE 168
  END;
$$;

-- ── Tier validation trigger ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.video_schedules_check_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_active_count int;
  v_max int;
  v_min_cadence int;
BEGIN
  -- Look up the user's plan tier from active subscription.
  SELECT plan_tier INTO v_tier
  FROM public.subscriptions
  WHERE user_id = NEW.user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  v_max := public.max_schedules_for_tier(v_tier);
  v_min_cadence := public.min_cadence_for_tier(v_tier);

  -- Count user's currently-active schedules (excluding this row on UPDATE).
  SELECT count(*) INTO v_active_count
  FROM public.video_schedules
  WHERE user_id = NEW.user_id
    AND archived_at IS NULL
    AND id <> NEW.id;

  IF TG_OP = 'INSERT' AND v_active_count >= v_max THEN
    RAISE EXCEPTION 'TIER_SCHEDULES_LIMIT: tier "%" allows max % schedules; you have % already', v_tier, v_max, v_active_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.cadence_hours < v_min_cadence THEN
    RAISE EXCEPTION 'TIER_CADENCE_LIMIT: tier "%" requires cadence_hours >= % (got %)', v_tier, v_min_cadence, NEW.cadence_hours
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_schedules_tier_check ON public.video_schedules;
CREATE TRIGGER trg_video_schedules_tier_check
  BEFORE INSERT OR UPDATE OF cadence_hours, archived_at ON public.video_schedules
  FOR EACH ROW
  WHEN (NEW.archived_at IS NULL)
  EXECUTE FUNCTION public.video_schedules_check_tier();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.video_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_schedules_select_own ON public.video_schedules;
CREATE POLICY video_schedules_select_own
  ON public.video_schedules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS video_schedules_insert_own ON public.video_schedules;
CREATE POLICY video_schedules_insert_own
  ON public.video_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS video_schedules_update_own ON public.video_schedules;
CREATE POLICY video_schedules_update_own
  ON public.video_schedules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS video_schedules_delete_own ON public.video_schedules;
CREATE POLICY video_schedules_delete_own
  ON public.video_schedules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ── pg_cron job: invoke schedule-runner every 5 minutes ────────────────────
--
-- The edge function reads the service-role key from Vault and uses it
-- for its DB calls. The cron trigger uses the project's anon key (only
-- to authenticate the HTTP call to Functions); the function itself
-- runs with elevated privileges.

DO $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
BEGIN
  -- These env vars exist in the Supabase production project. If they're
  -- absent (e.g. local dev DB), skip cron registration; the runner is
  -- still callable manually for testing.
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_anon_key    FROM vault.decrypted_secrets WHERE name = 'anon_key';
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := NULL;
    v_anon_key := NULL;
  END;

  IF v_supabase_url IS NOT NULL AND v_anon_key IS NOT NULL THEN
    -- Idempotent: drop then re-create
    PERFORM cron.unschedule('schedule-runner-tick') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'schedule-runner-tick'
    );
    PERFORM cron.schedule(
      'schedule-runner-tick',
      '*/5 * * * *',  -- every 5 minutes
      format(
        $cron$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', %L
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        );
        $cron$,
        v_supabase_url || '/functions/v1/schedule-runner',
        'Bearer ' || v_anon_key
      )
    );
  END IF;
END;
$$;
