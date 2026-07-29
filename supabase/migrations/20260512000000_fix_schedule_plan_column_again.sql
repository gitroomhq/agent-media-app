-- Re-apply the plan_slug fix to video_schedules_check_tier().
--
-- 20260511120000_fix_schedules_plan_column.sql changed the trigger
-- function to read subscriptions.plan_slug (the real column name).
-- 20260511200000_schedule_prompt_rows.sql then redefined the function
-- and accidentally pasted the original 'plan_tier' code back, which
-- caused "column \"plan_tier\" does not exist" on INSERT/UPDATE.
--
-- Same function body as 20260511200000 but using plan_slug.

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
