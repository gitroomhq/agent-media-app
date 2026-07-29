-- Migration 016: refund_credits stored procedure
-- Reverses a credit deduction for a given job_id.
-- Refunds credits to the SAME buckets they were originally deducted from.
-- Prevents double-refund via explicit check on existing refund transactions.
-- SECURITY DEFINER bypasses RLS so Edge Functions can call this safely.

CREATE OR REPLACE FUNCTION public.refund_credits(
    p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id               uuid;
    v_monthly_to_refund     integer := 0;
    v_purchased_to_refund   integer := 0;
    v_new_monthly           integer;
    v_new_purchased         integer;
    v_debit_row             record;
    v_refund_exists         boolean;
BEGIN
    -- Validate input
    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_JOB: job_id cannot be null';
    END IF;

    -- =========================================================================
    -- Step 1: Check that deduction transactions exist for this job
    -- =========================================================================
    SELECT EXISTS (
        SELECT 1
        FROM public.credit_transactions
        WHERE reference_id = p_job_id
          AND type = 'generation_debit'
    ) INTO v_refund_exists;

    IF NOT v_refund_exists THEN
        RAISE EXCEPTION 'NO_DEDUCTION_FOUND: no debit transactions found for job %', p_job_id;
    END IF;

    -- =========================================================================
    -- Step 2: Check that a refund has NOT already been issued for this job
    -- =========================================================================
    SELECT EXISTS (
        SELECT 1
        FROM public.credit_transactions
        WHERE reference_id = p_job_id
          AND type = 'generation_refund'
    ) INTO v_refund_exists;

    IF v_refund_exists THEN
        RAISE EXCEPTION 'ALREADY_REFUNDED: credits for job % have already been refunded', p_job_id;
    END IF;

    -- =========================================================================
    -- Step 3: Sum up deductions by bucket for this job
    -- Debit amounts are stored as negative numbers, so we negate them.
    -- =========================================================================
    FOR v_debit_row IN
        SELECT bucket, SUM(ABS(amount)) AS total_deducted
        FROM public.credit_transactions
        WHERE reference_id = p_job_id
          AND type = 'generation_debit'
        GROUP BY bucket
    LOOP
        IF v_debit_row.bucket = 'monthly' THEN
            v_monthly_to_refund := v_debit_row.total_deducted;
        ELSIF v_debit_row.bucket = 'purchased' THEN
            v_purchased_to_refund := v_debit_row.total_deducted;
        END IF;
    END LOOP;

    -- Get the user_id from one of the debit transactions
    SELECT user_id INTO v_user_id
    FROM public.credit_transactions
    WHERE reference_id = p_job_id
      AND type = 'generation_debit'
    LIMIT 1;

    -- =========================================================================
    -- Step 4: Lock the user_credits row and apply the refund
    -- =========================================================================
    SELECT monthly_credits_remaining, purchased_balance
    INTO v_new_monthly, v_new_purchased
    FROM public.user_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: no credit record for user %', v_user_id;
    END IF;

    v_new_monthly := v_new_monthly + v_monthly_to_refund;
    v_new_purchased := v_new_purchased + v_purchased_to_refund;

    UPDATE public.user_credits
    SET monthly_credits_remaining = v_new_monthly,
        purchased_balance = v_new_purchased
    WHERE user_id = v_user_id;

    -- =========================================================================
    -- Step 5: Insert refund transaction rows (one per bucket refunded)
    -- =========================================================================
    IF v_monthly_to_refund > 0 THEN
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
            v_user_id,
            'generation_refund',
            v_monthly_to_refund,
            'monthly',
            v_new_monthly,
            v_new_purchased,
            p_job_id,
            'Refund: monthly credits for failed/canceled job'
        );
    END IF;

    IF v_purchased_to_refund > 0 THEN
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
            v_user_id,
            'generation_refund',
            v_purchased_to_refund,
            'purchased',
            v_new_monthly,
            v_new_purchased,
            p_job_id,
            'Refund: purchased credits for failed/canceled job'
        );
    END IF;

    -- =========================================================================
    -- Step 6: Return result
    -- =========================================================================
    RETURN jsonb_build_object(
        'success',              true,
        'monthly_refunded',     v_monthly_to_refund,
        'purchased_refunded',   v_purchased_to_refund,
        'remaining_monthly',    v_new_monthly,
        'remaining_purchased',  v_new_purchased
    );
END;
$$;

COMMENT ON FUNCTION public.refund_credits(uuid)
    IS 'Refund credits for a job back to the same buckets they were deducted from. Prevents double-refund.';
