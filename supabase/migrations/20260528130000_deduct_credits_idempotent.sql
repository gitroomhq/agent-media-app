-- Migration: make deduct_credits idempotent on p_job_id.
--
-- WHY: vNext primitive Activities (and legacy generations) retry up to 3×.
-- deduct_credits is called near the top of each Activity, BEFORE the provider
-- call. The previous version had NO guard against being called twice for the
-- same job, so a *retryable* failure after the deduct line (OpenAI 5xx, R2
-- blip, transient DB error) re-ran the Activity and charged the user again —
-- 2-3× with no refund on a run that eventually succeeds.
--
-- FIX: after locking the user_credits row, if a generation_debit already
-- exists for this p_job_id, treat the call as an idempotent replay and return
-- the current balances WITHOUT deducting again. This mirrors refund_credits,
-- which already guards double-refund the same way (reference_id + type check).
--
-- Behavior is otherwise byte-for-byte identical to migration 015. p_job_id is
-- a fresh UUID per run (primitive_run_id / generation job id) and is never
-- reused, so legitimate separate charges are unaffected — only retries of the
-- SAME job collapse to one charge.
--
-- Forward-only. Replaces the function in place (CREATE OR REPLACE); no data
-- migration. Safe to run on production: existing rows are untouched.

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
    v_already_debited   boolean;
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
    -- Holding the row lock also serializes concurrent retries of the same job,
    -- so the idempotency check below is race-safe.
    -- =========================================================================
    SELECT monthly_credits_remaining, purchased_balance
    INTO v_monthly, v_purchased
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: no credit record for user %', p_user_id;
    END IF;

    -- =========================================================================
    -- Step 1b: IDEMPOTENCY GUARD — if this job was already debited, this is a
    -- retry. Return current balances without charging again.
    -- =========================================================================
    SELECT EXISTS (
        SELECT 1
        FROM public.credit_transactions
        WHERE reference_id = p_job_id
          AND type = 'generation_debit'
    ) INTO v_already_debited;

    IF v_already_debited THEN
        RETURN jsonb_build_object(
            'success',              true,
            'idempotent_replay',    true,
            'monthly_deducted',     0,
            'purchased_deducted',   0,
            'remaining_monthly',    v_monthly,
            'remaining_purchased',  v_purchased
        );
    END IF;

    -- =========================================================================
    -- Step 2: Check total available credits
    -- =========================================================================
    IF (v_monthly + v_purchased) < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDITS: need % credits, have % (monthly: %, purchased: %)',
            p_amount, (v_monthly + v_purchased), v_monthly, v_purchased;
    END IF;

    -- =========================================================================
    -- Step 3: Calculate deduction split (monthly first, then purchased)
    -- =========================================================================
    IF v_monthly >= p_amount THEN
        v_monthly_deducted := p_amount;
        v_purchased_deducted := 0;
    ELSE
        v_monthly_deducted := v_monthly;
        v_purchased_deducted := p_amount - v_monthly;
    END IF;

    v_new_monthly := v_monthly - v_monthly_deducted;
    v_new_purchased := v_purchased - v_purchased_deducted;

    -- =========================================================================
    -- Step 4: Update the user_credits row
    -- =========================================================================
    UPDATE public.user_credits
    SET monthly_credits_remaining = v_new_monthly,
        purchased_balance = v_new_purchased
    WHERE user_id = p_user_id;

    -- =========================================================================
    -- Step 5: Insert credit_transaction rows (one per bucket used)
    -- =========================================================================
    IF v_monthly_deducted > 0 THEN
        INSERT INTO public.credit_transactions (
            user_id, type, amount, bucket,
            running_monthly_balance, running_purchased_balance,
            reference_id, description
        ) VALUES (
            p_user_id, 'generation_debit', -v_monthly_deducted, 'monthly',
            v_new_monthly, v_new_purchased, p_job_id, p_description
        );
    END IF;

    IF v_purchased_deducted > 0 THEN
        INSERT INTO public.credit_transactions (
            user_id, type, amount, bucket,
            running_monthly_balance, running_purchased_balance,
            reference_id, description
        ) VALUES (
            p_user_id, 'generation_debit', -v_purchased_deducted, 'purchased',
            v_new_monthly, v_new_purchased, p_job_id, p_description
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
    IS 'Atomically deduct credits: monthly first, then purchased. Idempotent on p_job_id (retry-safe). Returns JSON with deduction breakdown.';
