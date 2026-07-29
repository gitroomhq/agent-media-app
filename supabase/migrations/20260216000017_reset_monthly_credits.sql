-- Migration 017: reset_monthly_credits stored procedure
-- Resets a user's monthly credit allowance (called by Stripe webhook on billing cycle).
-- Creates a monthly_reset transaction in the ledger for auditability.
-- SECURITY DEFINER bypasses RLS so Edge Functions can call this safely.

CREATE OR REPLACE FUNCTION public.reset_monthly_credits(
    p_user_id   uuid,
    p_allowance integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_monthly   integer;
    v_purchased     integer;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_USER: user_id cannot be null';
    END IF;

    IF p_allowance IS NULL OR p_allowance < 0 THEN
        RAISE EXCEPTION 'INVALID_ALLOWANCE: allowance must be a non-negative integer, got %', p_allowance;
    END IF;

    -- =========================================================================
    -- Step 1: Lock the user_credits row and read current state
    -- =========================================================================
    SELECT monthly_credits_remaining, purchased_balance
    INTO v_old_monthly, v_purchased
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: no credit record for user %', p_user_id;
    END IF;

    -- =========================================================================
    -- Step 2: Set monthly credits to the new allowance
    -- Note: unused monthly credits do NOT roll over (by business rule).
    -- The old balance is simply replaced with the new allowance.
    -- =========================================================================
    UPDATE public.user_credits
    SET monthly_credits_remaining = p_allowance
    WHERE user_id = p_user_id;

    -- =========================================================================
    -- Step 3: Record the reset in the ledger
    -- Amount is the net change (new allowance minus old remaining).
    -- This preserves full auditability of the reset event.
    -- =========================================================================
    INSERT INTO public.credit_transactions (
        user_id,
        type,
        amount,
        bucket,
        running_monthly_balance,
        running_purchased_balance,
        reference_id,
        description
    ) VALUES (
        p_user_id,
        'monthly_reset',
        p_allowance - v_old_monthly,
        'monthly',
        p_allowance,
        v_purchased,
        NULL,
        format('Monthly credit reset: %s -> %s', v_old_monthly, p_allowance)
    );

    -- =========================================================================
    -- Step 4: Return result
    -- =========================================================================
    RETURN jsonb_build_object(
        'success',              true,
        'new_monthly_balance',  p_allowance,
        'old_monthly_balance',  v_old_monthly,
        'purchased_balance',    v_purchased
    );
END;
$$;

COMMENT ON FUNCTION public.reset_monthly_credits(uuid, integer)
    IS 'Reset monthly credit allowance on billing cycle. Unused credits do not roll over.';
