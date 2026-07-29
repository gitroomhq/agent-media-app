-- Migration: Atomic PAYG credit addition RPC
-- Fixes race condition in webhook-stripe where concurrent PAYG purchases
-- could overwrite each other's balance. Uses INSERT...ON CONFLICT with
-- atomic increment and FOR UPDATE locking for the ledger entry.

CREATE OR REPLACE FUNCTION public.add_purchased_credits(
    p_user_id          uuid,
    p_amount           integer,
    p_payment_intent_id text DEFAULT NULL,
    p_description      text DEFAULT 'PAYG credit purchase'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_monthly   integer;
    v_new_purchased integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_INPUT: user_id cannot be null';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: amount must be positive';
    END IF;

    -- Atomic upsert: create row if missing, or increment purchased_balance
    INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
    VALUES (p_user_id, 0, p_amount)
    ON CONFLICT (user_id)
    DO UPDATE SET purchased_balance = user_credits.purchased_balance + EXCLUDED.purchased_balance;

    -- Read the final balances under a row lock for accurate ledger entry
    SELECT monthly_credits_remaining, purchased_balance
    INTO v_new_monthly, v_new_purchased
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Record in the credit transaction ledger
    INSERT INTO public.credit_transactions (
        user_id,
        type,
        amount,
        bucket,
        running_monthly_balance,
        running_purchased_balance,
        stripe_payment_intent_id,
        description
    ) VALUES (
        p_user_id,
        'purchase_credit',
        p_amount,
        'purchased',
        v_new_monthly,
        v_new_purchased,
        p_payment_intent_id,
        p_description
    );

    RETURN jsonb_build_object(
        'success',            true,
        'credits_added',      p_amount,
        'new_monthly',        v_new_monthly,
        'new_purchased',      v_new_purchased
    );
END;
$$;

COMMENT ON FUNCTION public.add_purchased_credits(uuid, integer, text, text)
    IS 'Atomically add purchased credits with proper locking and ledger entry. Prevents race conditions in concurrent PAYG purchases.';
