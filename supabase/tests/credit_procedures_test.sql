-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- credit_procedures_test.sql
-- pgTAP test suite for credit stored procedures.
-- Run with: pg_prove -d <dbname> supabase/tests/credit_procedures_test.sql
--
-- Tests cover:
--   1. get_credit_balance           -- balance lookup with monthly + purchased
--   2. has_sufficient_credits       -- credit sufficiency checks
--   3. deduct_credits               -- monthly-only, split, purchased-only, edge cases
--   4. refund_credits               -- simple, split, double-refund prevention
--   5. reset_monthly_credits        -- period reset
--   6. reconcile_credits            -- ledger vs balance drift detection
--
-- Prerequisites:
--   - pgTAP extension installed (CREATE EXTENSION IF NOT EXISTS pgtap)
--   - All migrations applied (001-031)
--
-- Note: The entire test runs inside BEGIN/ROLLBACK so all data is cleaned up
-- automatically. We disable the immutability triggers on credit_transactions
-- temporarily to allow mid-test state resets.

BEGIN;

-- Load pgTAP
SELECT plan(40);

-- =============================================================================
-- Temporarily disable the immutability triggers on credit_transactions
-- so we can reset state between test groups. The ROLLBACK at the end
-- will restore the triggers.
-- =============================================================================
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_update;
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_delete;

-- =============================================================================
-- TEST FIXTURES
-- =============================================================================

-- Insert test users into auth.users first (profiles auto-created via trigger)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
    ('a0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'alpha@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Test User Alpha"}'::jsonb),
    ('a0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'beta@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Test User Beta"}'::jsonb),
    ('a0000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'gamma@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Test User Gamma"}'::jsonb);

INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES
    ('a0000000-0000-0000-0000-000000000001'::uuid, 500, 200),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 50, 0),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 0, 100);

-- =============================================================================
-- TEST GROUP 1: get_credit_balance (4 tests)
-- =============================================================================

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'total_credits',
    '700',
    'get_credit_balance: returns correct total for user with both monthly and purchased'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '500',
    'get_credit_balance: returns correct monthly balance'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '200',
    'get_credit_balance: returns correct purchased balance'
);

SELECT throws_like(
    $$ SELECT public.get_credit_balance('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) $$,
    '%USER_NOT_FOUND%',
    'get_credit_balance: raises exception for nonexistent user'
);

-- =============================================================================
-- TEST GROUP 2: has_sufficient_credits (7 tests)
-- =============================================================================

SELECT ok(
    public.has_sufficient_credits('a0000000-0000-0000-0000-000000000001'::uuid, 700),
    'has_sufficient_credits: true when exact amount available'
);

SELECT ok(
    public.has_sufficient_credits('a0000000-0000-0000-0000-000000000001'::uuid, 100),
    'has_sufficient_credits: true when less than available'
);

SELECT ok(
    NOT public.has_sufficient_credits('a0000000-0000-0000-0000-000000000001'::uuid, 701),
    'has_sufficient_credits: false when more than available'
);

SELECT ok(
    NOT public.has_sufficient_credits('a0000000-0000-0000-0000-000000000002'::uuid, 100),
    'has_sufficient_credits: false when only 50 monthly and 0 purchased'
);

SELECT ok(
    NOT public.has_sufficient_credits('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 1),
    'has_sufficient_credits: false for nonexistent user'
);

SELECT ok(
    NOT public.has_sufficient_credits('a0000000-0000-0000-0000-000000000001'::uuid, 0),
    'has_sufficient_credits: false for zero amount'
);

SELECT ok(
    NOT public.has_sufficient_credits('a0000000-0000-0000-0000-000000000001'::uuid, -5),
    'has_sufficient_credits: false for negative amount'
);

-- =============================================================================
-- TEST GROUP 3: deduct_credits - monthly only (4 tests)
-- =============================================================================

-- Reset to known state
UPDATE public.user_credits
SET monthly_credits_remaining = 500, purchased_balance = 200
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (public.deduct_credits(
        'a0000000-0000-0000-0000-000000000001'::uuid,
        100,
        'b0000000-0000-0000-0000-000000000001'::uuid,
        'Test deduction monthly only'
    ))->>'monthly_deducted',
    '100',
    'deduct_credits: deducts entirely from monthly when sufficient'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '400',
    'deduct_credits: monthly balance reduced correctly after monthly-only deduction'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '200',
    'deduct_credits: purchased balance unchanged after monthly-only deduction'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE reference_id = 'b0000000-0000-0000-0000-000000000001'::uuid
       AND type = 'generation_debit'),
    '1',
    'deduct_credits: creates exactly 1 transaction for monthly-only deduction'
);

-- =============================================================================
-- TEST GROUP 4: deduct_credits - split across buckets (4 tests)
-- =============================================================================

UPDATE public.user_credits
SET monthly_credits_remaining = 30, purchased_balance = 200
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Deduct 50: should take 30 from monthly + 20 from purchased
SELECT is(
    (public.deduct_credits(
        'a0000000-0000-0000-0000-000000000001'::uuid,
        50,
        'b0000000-0000-0000-0000-000000000003'::uuid,
        'Test split deduction'
    ))->>'purchased_deducted',
    '20',
    'deduct_credits: splits deduction - 20 from purchased when monthly has only 30'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE reference_id = 'b0000000-0000-0000-0000-000000000003'::uuid
       AND type = 'generation_debit'),
    '2',
    'deduct_credits: creates 2 transactions for split deduction'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '0',
    'deduct_credits: monthly fully drained after split deduction'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '180',
    'deduct_credits: purchased reduced by 20 after split deduction'
);

-- =============================================================================
-- TEST GROUP 5: deduct_credits - purchased only when monthly is 0 (1 test)
-- =============================================================================

SELECT is(
    (public.deduct_credits(
        'a0000000-0000-0000-0000-000000000003'::uuid,
        50,
        'b0000000-0000-0000-0000-000000000004'::uuid,
        'Test purchased-only deduction'
    ))->>'monthly_deducted',
    '0',
    'deduct_credits: zero monthly deducted when monthly balance is 0'
);

-- =============================================================================
-- TEST GROUP 6: deduct_credits - insufficient credits (1 test)
-- =============================================================================

SELECT throws_like(
    $$ SELECT public.deduct_credits(
        'a0000000-0000-0000-0000-000000000002'::uuid,
        999,
        'b0000000-0000-0000-0000-000000000005'::uuid,
        'Should fail'
    ) $$,
    '%INSUFFICIENT_CREDITS%',
    'deduct_credits: raises INSUFFICIENT_CREDITS when not enough total credits'
);

-- =============================================================================
-- TEST GROUP 7: deduct_credits - invalid inputs (2 tests)
-- =============================================================================

SELECT throws_like(
    $$ SELECT public.deduct_credits(
        'a0000000-0000-0000-0000-000000000001'::uuid,
        0,
        'b0000000-0000-0000-0000-000000000006'::uuid
    ) $$,
    '%INVALID_AMOUNT%',
    'deduct_credits: raises INVALID_AMOUNT for zero amount'
);

SELECT throws_like(
    $$ SELECT public.deduct_credits(
        'a0000000-0000-0000-0000-000000000001'::uuid,
        -10,
        'b0000000-0000-0000-0000-000000000007'::uuid
    ) $$,
    '%INVALID_AMOUNT%',
    'deduct_credits: raises INVALID_AMOUNT for negative amount'
);

-- =============================================================================
-- TEST GROUP 8: refund_credits - simple refund (2 tests)
-- =============================================================================

UPDATE public.user_credits
SET monthly_credits_remaining = 100, purchased_balance = 100
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Deduct 80 from monthly
SELECT public.deduct_credits(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    80,
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'Deduction to be refunded'
);

-- Refund
SELECT is(
    (public.refund_credits('c0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_refunded',
    '80',
    'refund_credits: refunds to monthly bucket correctly'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '100',
    'refund_credits: monthly balance restored after refund'
);

-- =============================================================================
-- TEST GROUP 9: refund_credits - split refund (1 test)
-- =============================================================================

UPDATE public.user_credits
SET monthly_credits_remaining = 20, purchased_balance = 100
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Deduct 50: 20 from monthly + 30 from purchased
SELECT public.deduct_credits(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    50,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'Split deduction to be refunded'
);

SELECT is(
    (public.refund_credits('c0000000-0000-0000-0000-000000000002'::uuid))->>'purchased_refunded',
    '30',
    'refund_credits: refunds purchased portion of split deduction correctly'
);

-- =============================================================================
-- TEST GROUP 10: refund_credits - double refund prevention (1 test)
-- =============================================================================

SELECT throws_like(
    $$ SELECT public.refund_credits('c0000000-0000-0000-0000-000000000002'::uuid) $$,
    '%ALREADY_REFUNDED%',
    'refund_credits: raises ALREADY_REFUNDED on second refund attempt'
);

-- =============================================================================
-- TEST GROUP 11: refund_credits - no deduction found (1 test)
-- =============================================================================

SELECT throws_like(
    $$ SELECT public.refund_credits('d0000000-0000-0000-0000-000000000099'::uuid) $$,
    '%NO_DEDUCTION_FOUND%',
    'refund_credits: raises NO_DEDUCTION_FOUND for unknown job_id'
);

-- =============================================================================
-- TEST GROUP 12: reset_monthly_credits (4 tests)
-- =============================================================================

UPDATE public.user_credits
SET monthly_credits_remaining = 37, purchased_balance = 500
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (public.reset_monthly_credits(
        'a0000000-0000-0000-0000-000000000001'::uuid,
        1200
    ))->>'new_monthly_balance',
    '1200',
    'reset_monthly_credits: sets monthly balance to new allowance'
);

SELECT is(
    (public.get_credit_balance('a0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '500',
    'reset_monthly_credits: purchased balance unchanged after monthly reset'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
       AND type = 'monthly_reset'),
    '1',
    'reset_monthly_credits: creates exactly 1 monthly_reset transaction'
);

SELECT is(
    (SELECT amount::text FROM public.credit_transactions
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
       AND type = 'monthly_reset'
     ORDER BY created_at DESC
     LIMIT 1),
    '1163',
    'reset_monthly_credits: transaction amount is net change (1200 - 37 = 1163)'
);

-- =============================================================================
-- TEST GROUP 13: reconcile_credits - no discrepancy (2 tests)
-- =============================================================================

-- Reset user Alpha to a clean state where ledger matches balances
UPDATE public.user_credits
SET monthly_credits_remaining = 300, purchased_balance = 100
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Insert a transaction whose running balances match user_credits exactly
INSERT INTO public.credit_transactions (
    user_id, type, amount, bucket,
    running_monthly_balance, running_purchased_balance,
    description
) VALUES (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'generation_debit', -50, 'monthly',
    300, 100,
    'Reconcile test: aligned transaction'
);

-- Clear any previous reconciliation logs for clean test
DELETE FROM public.credit_reconciliation_log
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Run reconciliation and verify zero discrepancies for this user
SELECT ok(
    public.reconcile_credits() >= 0,
    'reconcile_credits: returns integer count (>= 0)'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_reconciliation_log
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid),
    '0',
    'reconcile_credits: no discrepancy logged when ledger matches balance'
);

-- =============================================================================
-- TEST GROUP 14: reconcile_credits - detects monthly drift (3 tests)
-- =============================================================================

-- Introduce a discrepancy: ledger says 300 monthly, but user_credits shows 250
UPDATE public.user_credits
SET monthly_credits_remaining = 250
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Clear previous reconciliation logs
DELETE FROM public.credit_reconciliation_log
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Run reconciliation
SELECT ok(
    public.reconcile_credits() >= 1,
    'reconcile_credits: returns >= 1 when discrepancy exists'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_reconciliation_log
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
       AND is_reconciled = false),
    '1',
    'reconcile_credits: logs exactly 1 unresolved discrepancy for monthly drift'
);

SELECT is(
    (SELECT plan_credit_discrepancy::text FROM public.credit_reconciliation_log
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
     ORDER BY created_at DESC
     LIMIT 1),
    '50',
    'reconcile_credits: plan_credit_discrepancy is 50 (expected 300 - actual 250)'
);

-- =============================================================================
-- TEST GROUP 15: reconcile_credits - detects purchased drift (3 tests)
-- =============================================================================

-- Fix monthly to match but introduce purchased drift
UPDATE public.user_credits
SET monthly_credits_remaining = 300, purchased_balance = 80
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Clear previous reconciliation logs
DELETE FROM public.credit_reconciliation_log
WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Run reconciliation
SELECT ok(
    public.reconcile_credits() >= 1,
    'reconcile_credits: detects purchased balance drift'
);

SELECT is(
    (SELECT purchased_credit_discrepancy::text FROM public.credit_reconciliation_log
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
     ORDER BY created_at DESC
     LIMIT 1),
    '20',
    'reconcile_credits: purchased_credit_discrepancy is 20 (expected 100 - actual 80)'
);

SELECT is(
    (SELECT plan_credit_discrepancy::text FROM public.credit_reconciliation_log
     WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid
     ORDER BY created_at DESC
     LIMIT 1),
    '0',
    'reconcile_credits: plan_credit_discrepancy is 0 when monthly balance matches'
);

-- =============================================================================
-- Done. ROLLBACK undoes all test data + trigger changes automatically.
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
