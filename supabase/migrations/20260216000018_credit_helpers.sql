-- Migration 018: Credit helper functions
-- Lightweight read-only helpers for checking credit balances.
-- SECURITY DEFINER bypasses RLS so Edge Functions can call these safely.

-- =============================================================================
-- get_credit_balance: Returns both balances + total for a user
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_credit_balance(
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_monthly   integer;
    v_purchased integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_USER: user_id cannot be null';
    END IF;

    SELECT monthly_credits_remaining, purchased_balance
    INTO v_monthly, v_purchased
    FROM public.user_credits
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: no credit record for user %', p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'monthly_credits_remaining',    v_monthly,
        'purchased_balance',            v_purchased,
        'total_credits',                v_monthly + v_purchased
    );
END;
$$;

COMMENT ON FUNCTION public.get_credit_balance(uuid)
    IS 'Returns monthly, purchased, and total credit balances for a user.';


-- =============================================================================
-- has_sufficient_credits: Quick boolean check before starting a generation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_sufficient_credits(
    p_user_id uuid,
    p_amount  integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_total integer;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN false;
    END IF;

    SELECT (monthly_credits_remaining + purchased_balance)
    INTO v_total
    FROM public.user_credits
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN v_total >= p_amount;
END;
$$;

COMMENT ON FUNCTION public.has_sufficient_credits(uuid, integer)
    IS 'Returns true if user has enough total credits (monthly + purchased) for the given amount.';
