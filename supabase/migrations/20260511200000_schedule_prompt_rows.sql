-- Batch-row schedules: feed a list of per-tick prompts.
--
-- A schedule with prompt_rows IS NOT NULL consumes one row per cron
-- tick. Each row becomes that run's brief (replacing job_params.brief).
-- After the last row is consumed, the schedule auto-archives so it
-- stops firing — no need for the user to clean it up.
--
-- Existing schedules (prompt_rows IS NULL) keep their current recurring
-- behavior: same brief every tick, runs forever until user disables.

ALTER TABLE public.video_schedules
  ADD COLUMN IF NOT EXISTS prompt_rows   text[],
  ADD COLUMN IF NOT EXISTS prompt_cursor int  NOT NULL DEFAULT 0;

-- Sanity: cursor stays in range. We don't enforce <= length(prompt_rows)
-- as a CHECK because reaching length is the natural exit (next tick
-- finds cursor == length and archives), but we do guard against negative.
-- Wrapped in DO block + EXCEPTION so a re-run on a DB that already has
-- the constraint (e.g. partially-applied previous attempt) is a no-op.
DO $$
BEGIN
  ALTER TABLE public.video_schedules
    ADD CONSTRAINT video_schedules_prompt_cursor_nonneg
    CHECK (prompt_cursor >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tier limit: cap rows per batch so a Pro Plus account doesn't queue
-- 50,000 generations in one shot. Re-use existing tier helper pattern.
CREATE OR REPLACE FUNCTION public.max_prompt_rows_for_tier(p_tier text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_tier, 'free')
    WHEN 'free'      THEN 0
    WHEN 'starter'   THEN 30
    WHEN 'creator'   THEN 100
    WHEN 'pro_plus'  THEN 500
    WHEN 'pro+'      THEN 500
    WHEN 'admin'     THEN 10000
    ELSE 0
  END;
$$;

-- Extend the tier-check trigger to validate row count too.
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
  v_max_rows int;
BEGIN
  -- subscriptions.plan_slug is the real column name (not plan_tier).
  -- 20260511120000_fix_schedules_plan_column.sql fixed this once; we
  -- carry the fix forward so a fresh install is correct.
  SELECT plan_slug INTO v_tier
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
  v_max_rows := public.max_prompt_rows_for_tier(v_tier);

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

  IF NEW.prompt_rows IS NOT NULL AND array_length(NEW.prompt_rows, 1) > v_max_rows THEN
    RAISE EXCEPTION 'TIER_ROWS_LIMIT: tier "%" allows max % prompt rows per schedule (got %)', v_tier, v_max_rows, array_length(NEW.prompt_rows, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Re-bind so UPDATE on prompt_rows also re-validates.
DROP TRIGGER IF EXISTS trg_video_schedules_tier_check ON public.video_schedules;
CREATE TRIGGER trg_video_schedules_tier_check
  BEFORE INSERT OR UPDATE OF cadence_hours, archived_at, prompt_rows ON public.video_schedules
  FOR EACH ROW
  WHEN (NEW.archived_at IS NULL)
  EXECUTE FUNCTION public.video_schedules_check_tier();
