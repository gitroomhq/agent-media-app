-- Migration 015: deduct_credits stored procedure
-- Atomic credit deduction: monthly credits first, then purchased balance.
-- Uses READ COMMITTED isolation with SELECT FOR UPDATE to prevent race conditions.
-- SECURITY DEFINER bypasses RLS so Edge Functions can call this safely.

CREATE OR REPLACE FUNCTION public.deduct_credits(
    p_user_id   uuid,
    p_amount    integer,
    p_job_id    uuid,
    p_description text DEFAULT 'Generation debit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_monthly           integer;
    v_purchased         integer;
    v_monthly_deducted  integer := 0;
    v_purchased_deducted integer := 0;
    v_new_monthly       integer;
    v_new_purchased     integer;
BEGIN
    -- Validate inputs
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: deduction amount must be a positive integer, got %', p_amount;
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_USER: user_id cannot be null';
    END IF;

    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_JOB: job_id cannot be null';
    END IF;

    -- =========================================================================
    -- Step 1: Lock the user_credits row with SELECT FOR UPDATE
    -- This prevents concurrent deductions from creating race conditions.
    -- Under READ COMMITTED, only the locked row is held; other users are not blocked.
    -- =========================================================================
    SELECT monthly_credits_remaining, purchased_balance
    INTO v_monthly, v_purchased
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- If no row found, the user has no credit record
    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: no credit record for user %', p_user_id;
    END IF;

    -- =========================================================================
    -- Step 2: Check total available credits
    -- =========================================================================
    IF (v_monthly + v_purchased) < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: need % credits, have % (monthly: %, purchased: %)',
            p_amount, (v_monthly + v_purchased), v_monthly, v_purchased;
    END IF;

    -- =========================================================================
    -- Step 3: Calculate deduction split
    -- Deduct from monthly_credits_remaining FIRST, then purchased_balance.
    -- This maximizes the value of monthly credits (which expire) before
    -- touching purchased credits (which never expire).
    -- =========================================================================
    IF v_monthly >= p_amount THEN
        -- Entire deduction from monthly
        v_monthly_deducted := p_amount;
        v_purchased_deducted := 0;
    ELSE
        -- Split: all remaining monthly + remainder from purchased
        v_monthly_deducted := v_monthly;
        v_purchased_deducted := p_amount - v_monthly;
    END IF;

    -- Calculate new balances
    v_new_monthly := v_monthly - v_monthly_deducted;
    v_new_purchased := v_purchased - v_purchased_deducted;

    -- =========================================================================
    -- Step 4: Update the user_credits row
    -- CHECK constraints on the table prevent negative balances as a safety net.
    -- =========================================================================
    UPDATE public.user_credits
    SET monthly_credits_remaining = v_new_monthly,
        purchased_balance = v_new_purchased
    WHERE user_id = p_user_id;

    -- =========================================================================
    -- Step 5: Insert credit_transaction rows (one per bucket used)
    -- This maintains an accurate, auditable ledger with running balances.
    -- =========================================================================
    IF v_monthly_deducted > 0 THEN
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
            'generation_debit',
            -v_monthly_deducted,
            'monthly',
            v_new_monthly,
            v_new_purchased,
            p_job_id,
            p_description
        );
    END IF;

    IF v_purchased_deducted > 0 THEN
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
            'generation_debit',
            -v_purchased_deducted,
            'purchased',
            v_new_monthly,
            v_new_purchased,
            p_job_id,
            p_description
        );
    END IF;

    -- =========================================================================
    -- Step 6: Return result
    -- =========================================================================
    RETURN jsonb_build_object(
        'success',              true,
        'monthly_deducted',     v_monthly_deducted,
        'purchased_deducted',   v_purchased_deducted,
        'remaining_monthly',    v_new_monthly,
        'remaining_purchased',  v_new_purchased
    );
END;
$$;

COMMENT ON FUNCTION public.deduct_credits(uuid, integer, uuid, text)
    IS 'Atomically deduct credits: monthly first, then purchased. Returns JSON with deduction breakdown.';
