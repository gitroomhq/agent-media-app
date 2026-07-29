-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP tests for reconcile_unrefunded_failed_jobs() — the credit-refund safety net.
--
-- Run with: pg_prove -d <db> supabase/tests/reconcile_refund_test.sql
--   (or: psql -d <db> -f supabase/tests/reconcile_refund_test.sql)
--
-- The whole test runs inside BEGIN/ROLLBACK so nothing persists.

BEGIN;
SELECT plan(7);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, confirmation_token,
                        raw_app_meta_data, raw_user_meta_data)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
        'refund-net@test.local', crypt('pw', gen_salt('bf')), now(), now(), now(), '',
        '{"provider":"email"}'::jsonb, '{}'::jsonb);

INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid, 100, 0)
ON CONFLICT (user_id) DO UPDATE SET monthly_credits_remaining = 100, purchased_balance = 0;

-- Job A: failed + debited + NOT refunded  → the sweep should refund it.
INSERT INTO public.generation_jobs (id, user_id, model_slug, operation, status, prompt, credit_cost, completed_at)
VALUES ('a1111111-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-0000000000e1'::uuid,
        'sora2', 'character_create', 'failed', 'p', 27, now());
INSERT INTO public.credit_transactions (user_id, amount, type, bucket, reference_id, description)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid, -27, 'generation_debit', 'monthly',
        'a1111111-0000-0000-0000-000000000001'::uuid, 'debit A');

-- Job B: failed + debited + ALREADY refunded → must NOT be double-refunded.
INSERT INTO public.generation_jobs (id, user_id, model_slug, operation, status, prompt, credit_cost, completed_at)
VALUES ('b2222222-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-0000000000e1'::uuid,
        'sora2', 'character_create', 'failed', 'p', 15, now());
INSERT INTO public.credit_transactions (user_id, amount, type, bucket, reference_id, description)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid, -15, 'generation_debit', 'monthly',
        'b2222222-0000-0000-0000-000000000002'::uuid, 'debit B');
INSERT INTO public.credit_transactions (user_id, amount, type, bucket, reference_id, description)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid, 15, 'generation_refund', 'monthly',
        'b2222222-0000-0000-0000-000000000002'::uuid, 'refund B');

-- Job C: COMPLETED + debited → not a failure, must be left alone.
INSERT INTO public.generation_jobs (id, user_id, model_slug, operation, status, prompt, credit_cost, completed_at)
VALUES ('c3333333-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-0000000000e1'::uuid,
        'sora2', 'character_create', 'completed', 'p', 12, now());
INSERT INTO public.credit_transactions (user_id, amount, type, bucket, reference_id, description)
VALUES ('a0000000-0000-0000-0000-0000000000e1'::uuid, -12, 'generation_debit', 'monthly',
        'c3333333-0000-0000-0000-000000000003'::uuid, 'debit C');

-- ── Act ─────────────────────────────────────────────────────────────────────
SELECT is(
    public.reconcile_unrefunded_failed_jobs(500), 1,
    'sweep refunds exactly the one failed+debited+unrefunded job (A)'
);

-- ── Assert ──────────────────────────────────────────────────────────────────
SELECT is(
    (SELECT count(*)::int FROM public.credit_transactions
     WHERE reference_id = 'a1111111-0000-0000-0000-000000000001'::uuid AND type = 'generation_refund'),
    1, 'job A now has exactly one refund'
);

SELECT is(
    (SELECT monthly_credits_remaining FROM public.user_credits
     WHERE user_id = 'a0000000-0000-0000-0000-0000000000e1'::uuid),
    127, 'user balance restored by 27 (100 -> 127)'
);

SELECT is(
    (SELECT count(*)::int FROM public.credit_transactions
     WHERE reference_id = 'b2222222-0000-0000-0000-000000000002'::uuid AND type = 'generation_refund'),
    1, 'already-refunded job B is NOT double-refunded'
);

SELECT is(
    (SELECT count(*)::int FROM public.credit_transactions
     WHERE reference_id = 'c3333333-0000-0000-0000-000000000003'::uuid AND type = 'generation_refund'),
    0, 'completed job C is left untouched'
);

-- ── Idempotency: a second sweep refunds nothing new ─────────────────────────
SELECT is(
    public.reconcile_unrefunded_failed_jobs(500), 0,
    'second sweep is a no-op (nothing left unrefunded)'
);
SELECT is(
    (SELECT count(*)::int FROM public.credit_transactions
     WHERE reference_id = 'a1111111-0000-0000-0000-000000000001'::uuid AND type = 'generation_refund'),
    1, 'job A still has exactly one refund after the second sweep'
);

SELECT * FROM finish();
ROLLBACK;
