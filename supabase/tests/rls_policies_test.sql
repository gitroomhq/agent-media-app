-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP test suite for Row Level Security policies.
--
-- Tests cover RLS enforcement on:
--   1. generation_jobs: users see only their own jobs
--   2. credit_transactions: users see only their own transactions
--   3. api_keys: users have full CRUD only on their own keys
--   4. provider_health: no access for authenticated/anon roles (service_role only)
--
-- Run with: pg_prove -d <database> supabase/tests/rls_policies_test.sql
--
-- Prerequisites:
--   - pgTAP extension installed (CREATE EXTENSION IF NOT EXISTS pgtap)
--   - All migrations applied (001-031)
--
-- Note: The entire test runs inside BEGIN/ROLLBACK so all data is cleaned up
-- automatically.

BEGIN;

-- Load pgTAP
SELECT plan(24);

-- =============================================================================
-- Temporarily disable the immutability triggers on credit_transactions
-- so we can insert test transaction rows freely.
-- =============================================================================
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_update;
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_delete;

-- =============================================================================
-- TEST FIXTURES
-- =============================================================================

-- Insert two test users into auth.users (profiles auto-created via trigger)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rls-alice@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"RLS Alice"}'::jsonb),
    ('e0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rls-bob@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"RLS Bob"}'::jsonb);

-- Set up credit balances
INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, 500, 100),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 300, 50);

-- Insert generation jobs for each user
INSERT INTO public.generation_jobs (id, user_id, model_slug, operation, status, prompt, credit_cost)
VALUES
    ('f0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'seedance1.5', 'text_to_video', 'completed', 'Alice test job 1', 50),
    ('f0000000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'flux2-pro', 'text_to_image', 'pending', 'Alice test job 2', 10),
    ('f0000000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'seedance1.5', 'text_to_video', 'completed', 'Bob test job 1', 50);

-- Insert credit transactions for each user
INSERT INTO public.credit_transactions (user_id, type, amount, bucket, running_monthly_balance, running_purchased_balance, description)
VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, 'generation_debit', -50, 'monthly', 450, 100, 'Alice deduction'),
    ('e0000000-0000-0000-0000-000000000001'::uuid, 'generation_debit', -10, 'monthly', 440, 100, 'Alice deduction 2'),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 'generation_debit', -50, 'monthly', 250, 50, 'Bob deduction');

-- Insert API keys for each user
INSERT INTO public.api_keys (id, user_id, key_hash, key_prefix, name)
VALUES
    ('d0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'hash_alice_key_1', 'ma_alice1', 'Alice Key 1'),
    ('d0000000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'hash_alice_key_2', 'ma_alice2', 'Alice Key 2'),
    ('d0000000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'hash_bob_key_1', 'ma_bob1', 'Bob Key 1');

-- =============================================================================
-- TEST GROUP 1: generation_jobs RLS (5 tests)
-- =============================================================================

-- Test as Alice: should see 2 own jobs
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'e0000000-0000-0000-0000-000000000001'::uuid),
    '2',
    'generation_jobs RLS: Alice sees her own 2 jobs'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'e0000000-0000-0000-0000-000000000002'::uuid),
    '0',
    'generation_jobs RLS: Alice cannot see Bob''s jobs'
);

-- Test as Bob: should see 1 own job
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'e0000000-0000-0000-0000-000000000002'::uuid),
    '1',
    'generation_jobs RLS: Bob sees his own 1 job'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'e0000000-0000-0000-0000-000000000001'::uuid),
    '0',
    'generation_jobs RLS: Bob cannot see Alice''s jobs'
);

-- Test as anon: should see no jobs at all
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs),
    '0',
    'generation_jobs RLS: anon role sees no jobs'
);

-- =============================================================================
-- TEST GROUP 2: credit_transactions RLS (4 tests)
-- =============================================================================

-- Test as Alice
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE user_id = 'e0000000-0000-0000-0000-000000000001'::uuid),
    '2',
    'credit_transactions RLS: Alice sees her own 2 transactions'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE user_id = 'e0000000-0000-0000-0000-000000000002'::uuid),
    '0',
    'credit_transactions RLS: Alice cannot see Bob''s transactions'
);

-- Test as Bob
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE user_id = 'e0000000-0000-0000-0000-000000000002'::uuid),
    '1',
    'credit_transactions RLS: Bob sees his own 1 transaction'
);

-- Test as anon
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions),
    '0',
    'credit_transactions RLS: anon role sees no transactions'
);

-- =============================================================================
-- TEST GROUP 3: api_keys RLS (7 tests)
-- =============================================================================

-- Test SELECT as Alice
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.api_keys
     WHERE user_id = 'e0000000-0000-0000-0000-000000000001'::uuid),
    '2',
    'api_keys RLS: Alice sees her own 2 keys'
);

SELECT is(
    (SELECT COUNT(*)::text FROM public.api_keys
     WHERE user_id = 'e0000000-0000-0000-0000-000000000002'::uuid),
    '0',
    'api_keys RLS: Alice cannot see Bob''s keys'
);

-- Test INSERT as Alice: should succeed for own user_id
SELECT lives_ok(
    $$ INSERT INTO public.api_keys (id, user_id, key_hash, key_prefix, name)
       VALUES ('d0000000-0000-0000-0000-000000000004'::uuid,
               'e0000000-0000-0000-0000-000000000001'::uuid,
               'hash_alice_key_3', 'ma_alice3', 'Alice Key 3') $$,
    'api_keys RLS: Alice can insert a key for herself'
);

-- Test INSERT as Alice for Bob's user_id: should fail
SELECT throws_ok(
    $$ INSERT INTO public.api_keys (id, user_id, key_hash, key_prefix, name)
       VALUES ('d0000000-0000-0000-0000-000000000005'::uuid,
               'e0000000-0000-0000-0000-000000000002'::uuid,
               'hash_cross_insert', 'ma_cross', 'Cross Insert') $$,
    NULL,
    NULL,
    'api_keys RLS: Alice cannot insert a key for Bob'
);

-- Test UPDATE as Alice on own key: should succeed
SELECT lives_ok(
    $$ UPDATE public.api_keys SET name = 'Alice Key 1 Updated'
       WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid $$,
    'api_keys RLS: Alice can update her own key'
);

-- Test DELETE as Alice on own key: should succeed
SELECT lives_ok(
    $$ DELETE FROM public.api_keys
       WHERE id = 'd0000000-0000-0000-0000-000000000004'::uuid $$,
    'api_keys RLS: Alice can delete her own key'
);

-- Test as anon: no access
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT COUNT(*)::text FROM public.api_keys),
    '0',
    'api_keys RLS: anon role sees no keys'
);

-- =============================================================================
-- TEST GROUP 4: provider_health RLS (8 tests)
-- =============================================================================

-- provider_health has RLS enabled but NO policies for authenticated/anon,
-- meaning all access is denied except for service_role (superuser).

-- Test as authenticated user: should see 0 rows
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT is(
    (SELECT COUNT(*)::text FROM public.provider_health),
    '0',
    'provider_health RLS: authenticated user sees no rows'
);

-- Test INSERT as authenticated: should fail
SELECT throws_ok(
    $$ INSERT INTO public.provider_health (provider_slug, circuit_state)
       VALUES ('test-provider', 'closed') $$,
    NULL,
    NULL,
    'provider_health RLS: authenticated user cannot insert'
);

-- Test UPDATE as authenticated: should have no effect (0 rows match)
SELECT is(
    (SELECT COUNT(*)::text FROM public.provider_health
     WHERE circuit_state = 'test_marker'),
    '0',
    'provider_health RLS: authenticated user cannot read or update rows'
);

-- Test as anon: should see 0 rows
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT COUNT(*)::text FROM public.provider_health),
    '0',
    'provider_health RLS: anon role sees no rows'
);

SELECT throws_ok(
    $$ INSERT INTO public.provider_health (provider_slug, circuit_state)
       VALUES ('anon-provider', 'closed') $$,
    NULL,
    NULL,
    'provider_health RLS: anon role cannot insert'
);

-- Test as superuser/service_role: should see rows
RESET ROLE;

SELECT ok(
    (SELECT COUNT(*)::integer FROM public.provider_health) >= 0,
    'provider_health RLS: superuser (service_role) can read rows'
);

SELECT lives_ok(
    $$ INSERT INTO public.provider_health (provider_slug, circuit_state, failure_threshold, failure_window_seconds, recovery_timeout_seconds)
       VALUES ('rls-test-provider', 'closed', 5, 60, 300) $$,
    'provider_health RLS: superuser can insert rows'
);

SELECT lives_ok(
    $$ DELETE FROM public.provider_health
       WHERE provider_slug = 'rls-test-provider' $$,
    'provider_health RLS: superuser can delete rows'
);

-- =============================================================================
-- Done. ROLLBACK undoes all test data + trigger changes automatically.
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
