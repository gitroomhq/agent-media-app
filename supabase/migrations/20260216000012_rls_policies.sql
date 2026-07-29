-- Migration 012: Row Level Security policies
-- Enable RLS on ALL tables and define access policies

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dead_letter_webhooks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- profiles: Users can read and update their own profile
-- =============================================================================
CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- subscriptions: Users can read their own subscription
-- =============================================================================
CREATE POLICY "subscriptions_select_own"
    ON public.subscriptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- =============================================================================
-- user_credits: Users can read their own credit balance
-- =============================================================================
CREATE POLICY "user_credits_select_own"
    ON public.user_credits FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- =============================================================================
-- credit_transactions: Users can read their own transaction history
-- =============================================================================
CREATE POLICY "credit_transactions_select_own"
    ON public.credit_transactions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- =============================================================================
-- generation_jobs: Users can read own jobs; update only for soft delete
-- =============================================================================
CREATE POLICY "generation_jobs_select_own"
    ON public.generation_jobs FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "generation_jobs_soft_delete_own"
    ON public.generation_jobs FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- api_keys: Users have full CRUD on their own API keys
-- =============================================================================
CREATE POLICY "api_keys_select_own"
    ON public.api_keys FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "api_keys_insert_own"
    ON public.api_keys FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_update_own"
    ON public.api_keys FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_delete_own"
    ON public.api_keys FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- =============================================================================
-- models: Public read access for active models (anon + authenticated)
-- =============================================================================
CREATE POLICY "models_select_active_anon"
    ON public.models FOR SELECT
    TO anon
    USING (is_active = true);

CREATE POLICY "models_select_active_authenticated"
    ON public.models FOR SELECT
    TO authenticated
    USING (is_active = true);

-- =============================================================================
-- model_pricing: Public read access (anon + authenticated)
-- =============================================================================
CREATE POLICY "model_pricing_select_anon"
    ON public.model_pricing FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "model_pricing_select_authenticated"
    ON public.model_pricing FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- device_codes: No public access (service role only)
-- No policies needed; RLS enabled = deny all for anon/authenticated
-- =============================================================================

-- =============================================================================
-- idempotency_keys: No public access (service role only)
-- No policies needed; RLS enabled = deny all for anon/authenticated
-- =============================================================================

-- =============================================================================
-- dead_letter_webhooks: No public access (service role only)
-- No policies needed; RLS enabled = deny all for anon/authenticated
-- =============================================================================
