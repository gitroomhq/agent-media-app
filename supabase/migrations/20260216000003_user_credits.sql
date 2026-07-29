-- Migration 003: user_credits
-- Tracks current credit balances per user (monthly + purchased)

CREATE TABLE public.user_credits (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    monthly_credits_remaining   integer NOT NULL DEFAULT 0
                                CHECK (monthly_credits_remaining >= 0),
    purchased_balance           integer NOT NULL DEFAULT 0
                                CHECK (purchased_balance >= 0),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_credits IS 'Current credit balances: monthly allowance + purchased PAYG credits';

CREATE TRIGGER user_credits_updated_at
    BEFORE UPDATE ON public.user_credits
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
