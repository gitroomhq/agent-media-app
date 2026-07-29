-- Migration 027: auto_topup_config
-- Sprint 8 MVP: Auto top-up configuration and check-and-topup function.
--
-- Allows users to configure automatic credit pack purchases when their
-- balance drops below a threshold. The check_and_topup() function is
-- called by the credit deduction pipeline to determine whether a top-up
-- should be triggered.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE public.auto_topup_config (
    user_id               uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    enabled               boolean     NOT NULL DEFAULT false,
    threshold_credits     integer     NOT NULL DEFAULT 50
                          CHECK (threshold_credits >= 0),
    pack_slug             text        NOT NULL DEFAULT 'pack_500'
                          CHECK (pack_slug IN ('pack_500', 'pack_2000', 'pack_5000')),
    max_monthly_topups    integer     NOT NULL DEFAULT 3
                          CHECK (max_monthly_topups >= 0),
    topups_this_month     integer     NOT NULL DEFAULT 0
                          CHECK (topups_this_month >= 0),
    current_period_start  timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auto_topup_config
    IS 'Per-user auto top-up settings. When enabled, a credit pack is purchased automatically when balance falls below threshold.';
COMMENT ON COLUMN public.auto_topup_config.threshold_credits
    IS 'Credit balance below which an automatic top-up is triggered.';
COMMENT ON COLUMN public.auto_topup_config.pack_slug
    IS 'PAYG pack purchased on each auto top-up (pack_500, pack_2000, pack_5000).';
COMMENT ON COLUMN public.auto_topup_config.max_monthly_topups
    IS 'Maximum automatic top-ups allowed per billing month to cap spending.';
COMMENT ON COLUMN public.auto_topup_config.topups_this_month
    IS 'Counter of auto top-ups executed in the current billing month.';
COMMENT ON COLUMN public.auto_topup_config.current_period_start
    IS 'Start of the current billing month for top-up counting. Reset by the monthly cron job.';

-- ── Updated-at trigger ──────────────────────────────────────────────────────

CREATE TRIGGER auto_topup_config_updated_at
    BEFORE UPDATE ON public.auto_topup_config
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.auto_topup_config ENABLE ROW LEVEL SECURITY;

-- Users can read their own auto top-up configuration
CREATE POLICY "auto_topup_config_select_own"
    ON public.auto_topup_config
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can update their own auto top-up configuration
CREATE POLICY "auto_topup_config_update_own"
    ON public.auto_topup_config
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can insert their own auto top-up configuration
CREATE POLICY "auto_topup_config_insert_own"
    ON public.auto_topup_config
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ── Function: check_and_topup ───────────────────────────────────────────────

/**
 * Checks whether an automatic top-up should be triggered for the given user.
 *
 * Called from the credit deduction pipeline after a successful deduction.
 * Does NOT execute the Stripe charge itself — it returns a JSON payload
 * that the Edge Function uses to decide whether to initiate a purchase.
 *
 * Returns jsonb:
 *   { should_topup: true,  pack_slug, threshold, current_balance }
 *   { should_topup: false, reason: 'disabled' | 'above_threshold' | 'limit_reached' }
 */
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
    -- 1. Load the user's auto top-up configuration
    SELECT *
      INTO v_config
      FROM public.auto_topup_config
     WHERE user_id = p_user_id;

    -- No config row → feature is implicitly disabled
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'should_topup', false,
            'reason',       'disabled'
        );
    END IF;

    -- 2. Check if auto top-up is enabled
    IF NOT v_config.enabled THEN
        RETURN jsonb_build_object(
            'should_topup', false,
            'reason',       'disabled'
        );
    END IF;

    -- 3. Get the user's current total credit balance
    SELECT COALESCE(monthly_credits_remaining, 0) + COALESCE(purchased_balance, 0)
      INTO v_balance
      FROM public.user_credits
     WHERE user_id = p_user_id;

    -- No credit row → treat as zero balance
    IF NOT FOUND THEN
        v_balance := 0;
    END IF;

    -- 4. Check if balance is still above threshold
    IF v_balance >= v_config.threshold_credits THEN
        RETURN jsonb_build_object(
            'should_topup', false,
            'reason',       'above_threshold'
        );
    END IF;

    -- 5. Check if the monthly top-up limit has been reached.
    --    Reset the counter if the current period has rolled over (30-day window).
    IF v_config.current_period_start + interval '30 days' < now() THEN
        UPDATE public.auto_topup_config
           SET topups_this_month     = 0,
               current_period_start  = now()
         WHERE user_id = p_user_id;

        -- Reload after reset
        SELECT *
          INTO v_config
          FROM public.auto_topup_config
         WHERE user_id = p_user_id;
    END IF;

    IF v_config.topups_this_month >= v_config.max_monthly_topups THEN
        RETURN jsonb_build_object(
            'should_topup', false,
            'reason',       'limit_reached'
        );
    END IF;

    -- 6. All conditions met — increment the counter and signal a top-up
    UPDATE public.auto_topup_config
       SET topups_this_month = topups_this_month + 1
     WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'should_topup',    true,
        'pack_slug',       v_config.pack_slug,
        'threshold',       v_config.threshold_credits,
        'current_balance', v_balance
    );
END;
$$;

COMMENT ON FUNCTION public.check_and_topup(uuid)
    IS 'Checks auto top-up eligibility and increments the monthly counter if a top-up should be triggered.';
