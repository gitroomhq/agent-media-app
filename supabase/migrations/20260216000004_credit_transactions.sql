-- Migration 004: credit_transactions
-- Immutable ledger of all credit movements. No UPDATE or DELETE allowed.

CREATE TABLE public.credit_transactions (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL REFERENCES public.profiles(id),
    type                        text NOT NULL
                                CHECK (type IN (
                                    'monthly_reset',
                                    'generation_debit',
                                    'generation_refund',
                                    'purchase_credit',
                                    'auto_topup_credit'
                                )),
    amount                      integer NOT NULL,
    bucket                      text NOT NULL
                                CHECK (bucket IN ('monthly', 'purchased')),
    running_monthly_balance     integer,
    running_purchased_balance   integer,
    reference_id                uuid,
    description                 text,
    metadata                    jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_transactions IS 'Immutable ledger of all credit transactions. Never update or delete rows.';

CREATE INDEX idx_credit_transactions_user_created
    ON public.credit_transactions(user_id, created_at);

-- Prevent UPDATE on credit_transactions (immutable ledger)
CREATE OR REPLACE FUNCTION public.prevent_credit_transaction_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'credit_transactions is an immutable ledger. UPDATE and DELETE are not allowed.';
    RETURN NULL;
END;
$$;

CREATE TRIGGER credit_transactions_no_update
    BEFORE UPDATE ON public.credit_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_credit_transaction_modification();

CREATE TRIGGER credit_transactions_no_delete
    BEFORE DELETE ON public.credit_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_credit_transaction_modification();
