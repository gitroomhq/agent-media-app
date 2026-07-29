-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP test suite for Sprint 3 billing components.
--
-- Tests cover:
--   1. stripe_webhook_events idempotent insert (duplicate event_id rejected)
--   2. Subscription status update flow
--   3. PAYG credit purchase adds to purchased_balance
--   4. idempotency_keys insert, scope, and cleanup eligibility
--
-- Run with: pg_prove -d <database> supabase/tests/billing_test.sql
--
-- Prerequisites:
--   - pgTAP extension installed (CREATE EXTENSION IF NOT EXISTS pgtap)
--   - All migrations 001-021 applied
--
-- Note: The entire test runs inside BEGIN/ROLLBACK so all data is cleaned up
-- automatically.

BEGIN;

-- Load pgTAP
SELECT plan(20);

-- ═════════════════════════════════════════════════════════════════════════════
-- Temporarily disable the immutability triggers on credit_transactions
-- so we can insert test transaction rows freely.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_update;
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_delete;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST FIXTURES
-- ═════════════════════════════════════════════════════════════════════════════

-- Insert test users into auth.users (profiles auto-created via trigger)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
    ('b0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'billing-alpha@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Billing Test Alpha"}'::jsonb),
    ('b0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'billing-beta@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Billing Test Beta"}'::jsonb);

-- Set up subscriptions for the test users
INSERT INTO public.subscriptions (id, user_id, plan_slug, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
VALUES
    ('c0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, 'starter', 'cus_test_alpha', 'sub_test_alpha', 'active', now(), now() + interval '30 days'),
    ('c0000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000002'::uuid, 'free', NULL, NULL, 'active', now(), now() + interval '30 days');

-- Set up credit balances
INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES
    ('b0000000-0000-0000-0000-000000000001'::uuid, 500, 100),
    ('b0000000-0000-0000-0000-000000000002'::uuid, 0, 0);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 1: stripe_webhook_events idempotent insert (5 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Insert a webhook event
INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type, processed_at, payload)
VALUES ('evt_test_001', 'invoice.paid', now(), '{"id":"evt_test_001"}'::jsonb);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.stripe_webhook_events
        WHERE stripe_event_id = 'evt_test_001'
    ),
    'stripe_webhook_events: event inserted successfully'
);

SELECT is(
    (SELECT event_type FROM public.stripe_webhook_events
     WHERE stripe_event_id = 'evt_test_001'),
    'invoice.paid',
    'stripe_webhook_events: event_type stored correctly'
);

SELECT ok(
    (SELECT processed_at FROM public.stripe_webhook_events
     WHERE stripe_event_id = 'evt_test_001') IS NOT NULL,
    'stripe_webhook_events: processed_at is set'
);

-- Attempt to insert a duplicate event_id (should fail due to UNIQUE constraint)
SELECT throws_like(
    $$ INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type, payload)
       VALUES ('evt_test_001', 'invoice.paid', '{}'::jsonb) $$,
    '%duplicate key%',
    'stripe_webhook_events: duplicate stripe_event_id is rejected'
);

-- Insert a different event (should succeed)
INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type, processed_at, payload)
VALUES ('evt_test_002', 'customer.subscription.updated', now(), '{"id":"evt_test_002"}'::jsonb);

SELECT ok(
    (SELECT COUNT(*)::integer FROM public.stripe_webhook_events
     WHERE stripe_event_id IN ('evt_test_001', 'evt_test_002')) = 2,
    'stripe_webhook_events: two distinct events stored successfully'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 2: Subscription status update flow (4 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Verify initial status
SELECT is(
    (SELECT status FROM public.subscriptions
     WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid),
    'active',
    'subscription: initial status is active'
);

-- Update to past_due
UPDATE public.subscriptions
SET status = 'past_due'
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT status FROM public.subscriptions
     WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid),
    'past_due',
    'subscription: status updated to past_due'
);

-- Update to canceled
UPDATE public.subscriptions
SET status = 'canceled', plan_slug = 'free'
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT status FROM public.subscriptions
     WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid),
    'canceled',
    'subscription: status updated to canceled'
);

SELECT is(
    (SELECT plan_slug FROM public.subscriptions
     WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid),
    'free',
    'subscription: plan_slug downgraded to free on cancellation'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 3: PAYG credit purchase adds to purchased_balance (4 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Verify initial purchased_balance
SELECT is(
    (SELECT purchased_balance::text FROM public.user_credits
     WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid),
    '100',
    'PAYG: initial purchased_balance is 100'
);

-- Simulate a PAYG credit purchase: add 500 credits
UPDATE public.user_credits
SET purchased_balance = purchased_balance + 500
WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT purchased_balance::text FROM public.user_credits
     WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid),
    '600',
    'PAYG: purchased_balance increased by 500 after purchase'
);

-- Record a credit transaction for the purchase
INSERT INTO public.credit_transactions (
    user_id, type, amount, bucket,
    running_monthly_balance, running_purchased_balance,
    stripe_payment_intent_id, description
)
VALUES (
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'purchase_credit', 500, 'purchased',
    500, 600,
    'pi_test_payg_001',
    'PAYG credit purchase: 500 credits (pack_500)'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid
       AND type = 'purchase_credit'
       AND stripe_payment_intent_id = 'pi_test_payg_001'),
    '1',
    'PAYG: credit transaction recorded with stripe_payment_intent_id'
);

-- Verify total credits (monthly + purchased)
SELECT is(
    (SELECT (monthly_credits_remaining + purchased_balance)::text
     FROM public.user_credits
     WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid),
    '1100',
    'PAYG: total credits correct after purchase (500 monthly + 600 purchased)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 4: idempotency_keys insert, scope, and cleanup (7 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Insert an idempotency key with default scope
INSERT INTO public.idempotency_keys (key, endpoint, scope, response_status, response_body)
VALUES ('test-key-001', 'checkout', 'checkout', 200, '{"session_id":"cs_test"}'::jsonb);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.idempotency_keys
        WHERE key = 'test-key-001'
    ),
    'idempotency_keys: key inserted successfully'
);

SELECT is(
    (SELECT scope FROM public.idempotency_keys WHERE key = 'test-key-001'),
    'checkout',
    'idempotency_keys: scope stored correctly'
);

SELECT is(
    (SELECT response_status::text FROM public.idempotency_keys WHERE key = 'test-key-001'),
    '200',
    'idempotency_keys: response_status stored correctly'
);

-- Attempt to insert a duplicate key (should fail due to UNIQUE constraint)
SELECT throws_like(
    $$ INSERT INTO public.idempotency_keys (key, endpoint, scope, response_status, response_body)
       VALUES ('test-key-001', 'checkout', 'checkout', 200, '{}'::jsonb) $$,
    '%duplicate key%',
    'idempotency_keys: duplicate key rejected by UNIQUE constraint'
);

-- Verify expires_at defaults to ~24 hours from now
SELECT ok(
    (SELECT expires_at FROM public.idempotency_keys WHERE key = 'test-key-001')
        BETWEEN now() + interval '23 hours' AND now() + interval '25 hours',
    'idempotency_keys: expires_at defaults to approximately 24 hours from now'
);

-- Insert an expired key (simulate an old entry)
INSERT INTO public.idempotency_keys (key, endpoint, scope, response_status, response_body, expires_at)
VALUES ('test-key-expired', 'checkout', 'checkout', 200, '{}'::jsonb, now() - interval '1 hour');

SELECT ok(
    (SELECT expires_at FROM public.idempotency_keys WHERE key = 'test-key-expired') < now(),
    'idempotency_keys: expired key has expires_at in the past'
);

-- Verify that the expired key would be eligible for cleanup
-- (the pg_cron job deletes WHERE expires_at < now())
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.idempotency_keys
        WHERE key = 'test-key-expired'
          AND expires_at < now()
    ),
    'idempotency_keys: expired key is eligible for pg_cron cleanup'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Done. ROLLBACK undoes all test data + trigger changes automatically.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT * FROM finish();

ROLLBACK;
