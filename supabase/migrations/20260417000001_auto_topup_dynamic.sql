-- Migration: auto_topup_dynamic
-- Phase 3 foundation: replace fixed pack_slug with dynamic topup_amount_cents
-- so auto-recharge matches the dynamic Buy Credits flow ($50 minimum).

-- 1. Add the new column. Range enforced at the app layer too.
ALTER TABLE public.auto_topup_config
  ADD COLUMN IF NOT EXISTS topup_amount_cents integer
  CHECK (topup_amount_cents IS NULL OR (topup_amount_cents >= 5000 AND topup_amount_cents <= 500000));

COMMENT ON COLUMN public.auto_topup_config.topup_amount_cents
  IS 'Amount in USD cents to charge on auto-recharge. Must be between 5000 ($50) and 500000 ($5,000).';

-- 2. Make the legacy pack_slug column optional — some rows will only have topup_amount_cents.
ALTER TABLE public.auto_topup_config
  ALTER COLUMN pack_slug DROP NOT NULL;

-- 3. Drop the restrictive pack_slug CHECK (old values only); keep the column for historical rows.
ALTER TABLE public.auto_topup_config
  DROP CONSTRAINT IF EXISTS auto_topup_config_pack_slug_check;

-- 4. Rewrite check_and_topup to return topup_amount_cents when set, otherwise fall back to
--    pack_slug for backward compatibility. The off-session charge worker (Phase 3)
--    reads whichever field is populated.
CREATE OR REPLACE FUNCTION public.check_and_topup(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_config   public.auto_topup_config%ROWTYPE;
    v_balance  integer;
BEGIN
    SELECT *
      INTO v_config
      FROM public.auto_topup_config
     WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('should_topup', false, 'reason', 'disabled');
    END IF;

    IF NOT v_config.enabled THEN
        RETURN jsonb_build_object('should_topup', false, 'reason', 'disabled');
    END IF;

    SELECT COALESCE(monthly_credits_remaining, 0) + COALESCE(purchased_balance, 0)
      INTO v_balance
      FROM public.user_credits
     WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        v_balance := 0;
    END IF;

    IF v_balance >= v_config.threshold_credits THEN
        RETURN jsonb_build_object('should_topup', false, 'reason', 'above_threshold');
    END IF;

    -- Reset monthly counter if the billing window rolled over (30-day windows).
    IF v_config.current_period_start + interval '30 days' < now() THEN
        UPDATE public.auto_topup_config
           SET topups_this_month     = 0,
               current_period_start  = now()
         WHERE user_id = p_user_id;

        SELECT *
          INTO v_config
          FROM public.auto_topup_config
         WHERE user_id = p_user_id;
    END IF;

    IF v_config.topups_this_month >= v_config.max_monthly_topups THEN
        RETURN jsonb_build_object('should_topup', false, 'reason', 'limit_reached');
    END IF;

    UPDATE public.auto_topup_config
       SET topups_this_month = topups_this_month + 1
     WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'should_topup',        true,
        'topup_amount_cents',  v_config.topup_amount_cents,
        'pack_slug',           v_config.pack_slug,
        'threshold',           v_config.threshold_credits,
        'current_balance',     v_balance
    );
END;
$$;

-- 5. Low balance alert storage — lightweight one-row-per-user.
CREATE TABLE IF NOT EXISTS public.low_balance_alerts (
    user_id            uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    threshold_credits  integer     NOT NULL DEFAULT 1000 CHECK (threshold_credits >= 100),
    email              text        NOT NULL,
    last_sent_at       timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.low_balance_alerts
  IS 'Per-user email alert config. Send when total balance drops below threshold_credits.';

DROP TRIGGER IF EXISTS low_balance_alerts_updated_at ON public.low_balance_alerts;
CREATE TRIGGER low_balance_alerts_updated_at
    BEFORE UPDATE ON public.low_balance_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.low_balance_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "low_balance_alerts_select_own" ON public.low_balance_alerts;
CREATE POLICY "low_balance_alerts_select_own"
    ON public.low_balance_alerts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "low_balance_alerts_insert_own" ON public.low_balance_alerts;
CREATE POLICY "low_balance_alerts_insert_own"
    ON public.low_balance_alerts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "low_balance_alerts_update_own" ON public.low_balance_alerts;
CREATE POLICY "low_balance_alerts_update_own"
    ON public.low_balance_alerts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "low_balance_alerts_delete_own" ON public.low_balance_alerts;
CREATE POLICY "low_balance_alerts_delete_own"
    ON public.low_balance_alerts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
