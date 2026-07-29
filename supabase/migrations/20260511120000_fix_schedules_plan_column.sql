-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Fix: the 20260510160000_schedules.sql tier-check trigger reads
-- `subscriptions.plan_tier`, but the actual column on subscriptions is
-- `plan_slug` (see 20260216000002_subscriptions.sql). Inserting a new
-- video_schedules row therefore failed with:
--     column "plan_tier" does not exist
--
-- Replace the trigger function with the correct column name. Function
-- body otherwise identical to the original — tier limits unchanged.

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
