-- Migration 020: stripe_billing_setup
-- Sprint 3 Phase 1: Add Stripe billing columns and webhook event tracking.
--
-- Adds missing Stripe-related columns to subscriptions and credit_transactions,
-- creates the stripe_webhook_events table for idempotent event processing,
-- and extends idempotency_keys with a scope column for namespacing.
--
-- NOTE: stripe_customer_id and stripe_subscription_id already exist on
-- the subscriptions table (migration 002). This migration only adds
-- the new columns required for full Stripe integration.

-- ── Subscriptions: add Stripe price/product IDs and trial tracking ──────────

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS stripe_price_id   text,
    ADD COLUMN IF NOT EXISTS stripe_product_id  text,
    ADD COLUMN IF NOT EXISTS trial_ends_at      timestamptz;

COMMENT ON COLUMN public.subscriptions.stripe_price_id
    IS 'Stripe price ID for the current subscription item (e.g., price_xxx)';
COMMENT ON COLUMN public.subscriptions.stripe_product_id
    IS 'Stripe product ID for the current plan (e.g., prod_xxx)';
COMMENT ON COLUMN public.subscriptions.trial_ends_at
    IS 'When the trial period ends. NULL if no trial is active.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_price
    ON public.subscriptions(stripe_price_id)
    WHERE stripe_price_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_product
    ON public.subscriptions(stripe_product_id)
    WHERE stripe_product_id IS NOT NULL;

-- ── Credit Transactions: add Stripe payment intent ID for PAYG ──────────────

ALTER TABLE public.credit_transactions
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMENT ON COLUMN public.credit_transactions.stripe_payment_intent_id
    IS 'Stripe PaymentIntent ID for PAYG credit purchases. Used for reconciliation.';

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_pi
    ON public.credit_transactions(stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- ── Stripe Webhook Events: idempotent event processing ──────────────────────

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id text        UNIQUE NOT NULL,
    event_type      text        NOT NULL,
    processed_at    timestamptz NOT NULL DEFAULT now(),
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.stripe_webhook_events
    IS 'Tracks processed Stripe webhook events for idempotent handling. Check stripe_event_id before processing any event.';

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type
    ON public.stripe_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
    ON public.stripe_webhook_events(processed_at);

-- ── Idempotency Keys: add scope column for namespacing ──────────────────────

ALTER TABLE public.idempotency_keys
    ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'default';

COMMENT ON COLUMN public.idempotency_keys.scope
    IS 'Namespace scope for idempotency keys (e.g., stripe_webhook, payg_purchase, credit_deduction)';

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_scope
    ON public.idempotency_keys(scope);
