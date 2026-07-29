-- Migration: reliable PAYG crediting
--
-- PAYG credits can be applied from checkout.session.completed and
-- payment_intent.succeeded. Make the credit RPC idempotent by Stripe
-- PaymentIntent ID so either event can arrive first without double-crediting.

ALTER TABLE public.stripe_webhook_events
    ALTER COLUMN processed_at DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.add_purchased_credits(
    p_user_id           uuid,
    p_amount            integer,
    p_payment_intent_id text DEFAULT NULL,
    p_description       text DEFAULT 'PAYG credit purchase'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_monthly              integer;
    v_new_purchased            integer;
    v_existing_transaction_id  uuid;
    v_existing_user_id         uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_INPUT: user_id cannot be null';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_INPUT: amount must be positive';
    END IF;

    IF p_payment_intent_id IS NOT NULL AND btrim(p_payment_intent_id) <> '' THEN
        -- Serialize by PaymentIntent ID to make concurrent Stripe retries safe.
        PERFORM pg_advisory_xact_lock(
            hashtextextended('add_purchased_credits:' || p_payment_intent_id, 0)
        );

        SELECT id, user_id
          INTO v_existing_transaction_id, v_existing_user_id
          FROM public.credit_transactions
         WHERE stripe_payment_intent_id = p_payment_intent_id
           AND type = 'purchase_credit'
         ORDER BY created_at
         LIMIT 1;

        IF FOUND THEN
            IF v_existing_user_id <> p_user_id THEN
                RAISE EXCEPTION
                    'PAYMENT_INTENT_ALREADY_CREDITED: % belongs to a different user',
                    p_payment_intent_id;
            END IF;

            SELECT monthly_credits_remaining, purchased_balance
              INTO v_new_monthly, v_new_purchased
              FROM public.user_credits
             WHERE user_id = p_user_id;

            RETURN jsonb_build_object(
                'success',                 true,
                'duplicate',               true,
                'credits_added',           0,
                'existing_transaction_id', v_existing_transaction_id,
                'new_monthly',             COALESCE(v_new_monthly, 0),
                'new_purchased',           COALESCE(v_new_purchased, 0)
            );
        END IF;
    END IF;

    -- Atomic upsert: create row if missing, or increment purchased_balance.
    INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
    VALUES (p_user_id, 0, p_amount)
    ON CONFLICT (user_id)
    DO UPDATE SET purchased_balance = user_credits.purchased_balance + EXCLUDED.purchased_balance;

    -- Read the final balances under a row lock for accurate ledger entry.
    SELECT monthly_credits_remaining, purchased_balance
      INTO v_new_monthly, v_new_purchased
      FROM public.user_credits
     WHERE user_id = p_user_id
     FOR UPDATE;

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
        NULLIF(btrim(p_payment_intent_id), ''),
        p_description
    );

    RETURN jsonb_build_object(
        'success',       true,
        'duplicate',     false,
        'credits_added', p_amount,
        'new_monthly',   v_new_monthly,
        'new_purchased', v_new_purchased
    );
END;
$$;
COMMENT ON FUNCTION public.add_purchased_credits(uuid, integer, text, text)
    IS 'Atomically add purchased credits. Idempotent for non-null Stripe PaymentIntent IDs.';
