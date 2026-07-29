-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP test suite for Sprint 4 generation components.
--
-- Tests cover:
--   1. feature_flags table operations (insert, check enabled, rollout percentage)
--   2. provider_configs table (insert, lookup by slug)
--   3. generation_jobs with provider columns (provider_slug, provider_job_id, cost_credits, input_params)
--   4. generation job lifecycle (submitted -> processing -> completed)
--   5. concurrent job count for plan limits
--   6. deduct_credits + refund_credits round-trip for generation flow
--
-- Run with: pg_prove -d <database> supabase/tests/generation_test.sql
--
-- Prerequisites:
--   - pgTAP extension installed (CREATE EXTENSION IF NOT EXISTS pgtap)
--   - All migrations 001-023 applied
--
-- Note: The entire test runs inside BEGIN/ROLLBACK so all data is cleaned up
-- automatically. We disable the immutability triggers on credit_transactions
-- temporarily to allow mid-test state resets.

BEGIN;

-- Load pgTAP
SELECT plan(37);

-- =============================================================================
-- Temporarily disable the immutability triggers on credit_transactions
-- so we can reset state between test groups.
-- =============================================================================
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_update;
ALTER TABLE public.credit_transactions DISABLE TRIGGER credit_transactions_no_delete;

-- =============================================================================
-- TEST FIXTURES
-- =============================================================================

-- Insert test users into auth.users (profiles auto-created via trigger)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES
    ('d0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'gen-alpha@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Gen Test Alpha"}'::jsonb),
    ('d0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'gen-beta@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Gen Test Beta"}'::jsonb);

-- Set up credit balances
INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES
    ('d0000000-0000-0000-0000-000000000001'::uuid, 500, 200),
    ('d0000000-0000-0000-0000-000000000002'::uuid, 100, 50);

-- Set up subscriptions
INSERT INTO public.subscriptions (id, user_id, plan_slug, status, current_period_start, current_period_end)
VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, 'd0000000-0000-0000-0000-000000000001'::uuid, 'starter', 'active', now(), now() + interval '30 days'),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 'free', 'active', now(), now() + interval '30 days');

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 1: feature_flags table operations (7 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1a. Verify seed data was inserted by migration 022
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.feature_flags
        WHERE name = 'video_generation'
    ),
    'feature_flags: video_generation flag exists from seed data'
);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.feature_flags
        WHERE name = 'image_generation'
    ),
    'feature_flags: image_generation flag exists from seed data'
);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.feature_flags
        WHERE name = 'kie_ai_provider'
    ),
    'feature_flags: kie_ai_provider flag exists from seed data'
);

-- 1b. Check enabled status
SELECT is(
    (SELECT enabled FROM public.feature_flags WHERE name = 'video_generation'),
    true,
    'feature_flags: video_generation is enabled'
);

-- 1c. Check rollout percentage
SELECT is(
    (SELECT rollout_percentage FROM public.feature_flags WHERE name = 'video_generation'),
    100,
    'feature_flags: video_generation has 100% rollout'
);

-- 1d. Check allowed_plan_tiers
SELECT ok(
    'starter' = ANY(
        (SELECT allowed_plan_tiers FROM public.feature_flags WHERE name = 'kie_ai_provider')
    ),
    'feature_flags: kie_ai_provider includes starter in allowed_plan_tiers'
);

-- 1e. Insert a new feature flag with partial rollout
INSERT INTO public.feature_flags (name, enabled, rollout_percentage, allowed_plan_tiers, metadata)
VALUES ('test_new_feature', true, 50, ARRAY['pro'], '{"description": "Test feature"}'::jsonb);

SELECT is(
    (SELECT rollout_percentage FROM public.feature_flags WHERE name = 'test_new_feature'),
    50,
    'feature_flags: new flag inserted with rollout_percentage 50'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 2: provider_configs table (5 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. Verify seed data for Kie.ai provider from migration 023
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.provider_configs
        WHERE provider_slug = 'kie'
    ),
    'provider_configs: kie provider exists from seed data'
);

-- 2b. Check base_url
SELECT is(
    (SELECT base_url FROM public.provider_configs WHERE provider_slug = 'kie'),
    'https://api.kie.ai',
    'provider_configs: kie base_url is correct'
);

-- 2c. Check enabled status
SELECT is(
    (SELECT enabled FROM public.provider_configs WHERE provider_slug = 'kie'),
    true,
    'provider_configs: kie provider is enabled'
);

-- 2d. Check api_version
SELECT is(
    (SELECT api_version FROM public.provider_configs WHERE provider_slug = 'kie'),
    'v1',
    'provider_configs: kie api_version is v1'
);

-- 2e. Insert a new provider and look it up by slug
INSERT INTO public.provider_configs (provider_slug, display_name, base_url, api_version, enabled, rate_limits)
VALUES ('fal', 'fal.ai', 'https://queue.fal.run', 'v1', true, '{"requests_per_minute": 120, "concurrent_max": 20}'::jsonb);

SELECT is(
    (SELECT display_name FROM public.provider_configs WHERE provider_slug = 'fal'),
    'fal.ai',
    'provider_configs: fal provider inserted and retrievable by slug'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 3: generation_jobs with provider columns (6 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 3a. Insert a generation job with all provider columns
INSERT INTO public.generation_jobs (
    id, user_id, model_slug, operation, status, prompt,
    credit_cost, provider_slug, provider_job_id,
    input_params
)
VALUES (
    'f0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000001'::uuid,
    'seedance2', 'text_to_video', 'submitted',
    'A robot walking through a neon city',
    60, 'kie', 'kie-job-abc-123',
    '{"model": "seedance2", "prompt": "A robot walking through a neon city", "duration": 5, "resolution": "1080p"}'::jsonb
);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.generation_jobs
        WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid
    ),
    'generation_jobs: job with provider columns inserted successfully'
);

-- 3b. Check provider_slug stored correctly
SELECT is(
    (SELECT provider_slug FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'kie',
    'generation_jobs: provider_slug stored correctly'
);

-- 3c. Check provider_job_id stored correctly
SELECT is(
    (SELECT provider_job_id FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'kie-job-abc-123',
    'generation_jobs: provider_job_id stored correctly'
);

-- 3d. Check credit_cost stored correctly
SELECT is(
    (SELECT credit_cost::text FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    '60',
    'generation_jobs: credit_cost stored correctly'
);

-- 3e. Check input_params stored correctly
SELECT is(
    (SELECT input_params->>'model' FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'seedance2',
    'generation_jobs: input_params JSON stored and queryable'
);

-- 3f. Check input_params contains nested fields
SELECT is(
    (SELECT input_params->>'resolution' FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    '1080p',
    'generation_jobs: input_params resolution field accessible'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 4: generation job lifecycle (5 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 4a. Verify initial status is submitted
SELECT is(
    (SELECT status FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'submitted',
    'job lifecycle: initial status is submitted'
);

-- 4b. Transition to processing
UPDATE public.generation_jobs
SET status = 'processing', started_at = now()
WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT status FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'processing',
    'job lifecycle: status updated to processing'
);

SELECT ok(
    (SELECT started_at FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid) IS NOT NULL,
    'job lifecycle: started_at is set when processing'
);

-- 4c. Transition to completed
UPDATE public.generation_jobs
SET status = 'completed',
    completed_at = now(),
    output_media_url = 'https://storage.example.com/output/video.mp4',
    output_thumbnail_url = 'https://storage.example.com/output/thumb.jpg'
WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT status FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid),
    'completed',
    'job lifecycle: status updated to completed'
);

SELECT ok(
    (SELECT completed_at FROM public.generation_jobs
     WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid) IS NOT NULL,
    'job lifecycle: completed_at is set when completed'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 5: concurrent job count for plan limits (4 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Insert multiple active jobs for user 2 to test concurrent counting
INSERT INTO public.generation_jobs (id, user_id, model_slug, operation, status, prompt, credit_cost, provider_slug, provider_job_id)
VALUES
    ('f0000000-0000-0000-0000-000000000010'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 'seedance2', 'text_to_video', 'submitted', 'Test prompt 1', 60, 'kie', 'kie-job-010'),
    ('f0000000-0000-0000-0000-000000000011'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 'seedance2', 'text_to_video', 'processing', 'Test prompt 2', 60, 'kie', 'kie-job-011'),
    ('f0000000-0000-0000-0000-000000000012'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 'seedance2', 'text_to_video', 'completed', 'Test prompt 3', 60, 'kie', 'kie-job-012'),
    ('f0000000-0000-0000-0000-000000000013'::uuid, 'd0000000-0000-0000-0000-000000000002'::uuid, 'seedance2', 'text_to_video', 'pending', 'Test prompt 4', 60, 'kie', 'kie-job-013');

-- 5a. Count active jobs (pending, submitted, processing) - should be 3
SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'd0000000-0000-0000-0000-000000000002'::uuid
       AND status IN ('pending', 'submitted', 'processing')),
    '3',
    'concurrent jobs: 3 active jobs counted (pending + submitted + processing)'
);

-- 5b. Completed jobs should NOT count as active
SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'd0000000-0000-0000-0000-000000000002'::uuid
       AND status = 'completed'),
    '1',
    'concurrent jobs: 1 completed job not counted as active'
);

-- 5c. Total jobs for user 2 should be 4
SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'd0000000-0000-0000-0000-000000000002'::uuid),
    '4',
    'concurrent jobs: total job count is 4 for user 2'
);

-- 5d. User 1 has 1 job (the completed one from lifecycle test)
SELECT is(
    (SELECT COUNT(*)::text FROM public.generation_jobs
     WHERE user_id = 'd0000000-0000-0000-0000-000000000001'::uuid),
    '1',
    'concurrent jobs: user 1 has exactly 1 job'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 6: deduct_credits + refund_credits round-trip (10 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- Reset user 1 credits to known state
UPDATE public.user_credits
SET monthly_credits_remaining = 500, purchased_balance = 200
WHERE user_id = 'd0000000-0000-0000-0000-000000000001'::uuid;

DELETE FROM public.credit_transactions
WHERE user_id = 'd0000000-0000-0000-0000-000000000001'::uuid;

-- 6a. Deduct credits for a generation job (60 credits from monthly)
SELECT is(
    (public.deduct_credits(
        'd0000000-0000-0000-0000-000000000001'::uuid,
        60,
        'f1000000-0000-0000-0000-000000000001'::uuid,
        'Generation: Seedance 2.0 (text_to_video)'
    ))->>'monthly_deducted',
    '60',
    'generation credit flow: deducted 60 from monthly'
);

-- 6b. Verify balance after deduction
SELECT is(
    (public.get_credit_balance('d0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '440',
    'generation credit flow: monthly reduced from 500 to 440'
);

-- 6c. Purchased balance unchanged
SELECT is(
    (public.get_credit_balance('d0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '200',
    'generation credit flow: purchased balance unchanged after monthly deduction'
);

-- 6d. Transaction recorded
SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE reference_id = 'f1000000-0000-0000-0000-000000000001'::uuid
       AND type = 'generation_debit'),
    '1',
    'generation credit flow: debit transaction recorded'
);

-- 6e. Now refund the credits (simulating a provider failure)
SELECT is(
    (public.refund_credits('f1000000-0000-0000-0000-000000000001'::uuid))->>'monthly_refunded',
    '60',
    'generation credit flow: refunded 60 to monthly'
);

-- 6f. Balance restored after refund
SELECT is(
    (public.get_credit_balance('d0000000-0000-0000-0000-000000000001'::uuid))->>'monthly_credits_remaining',
    '500',
    'generation credit flow: monthly balance restored to 500 after refund'
);

-- 6g. Purchased balance still unchanged
SELECT is(
    (public.get_credit_balance('d0000000-0000-0000-0000-000000000001'::uuid))->>'purchased_balance',
    '200',
    'generation credit flow: purchased balance still 200 after refund'
);

-- 6h. Refund transaction recorded
SELECT is(
    (SELECT COUNT(*)::text FROM public.credit_transactions
     WHERE reference_id = 'f1000000-0000-0000-0000-000000000001'::uuid
       AND type = 'generation_refund'),
    '1',
    'generation credit flow: refund transaction recorded'
);

-- 6i. Double refund is prevented
SELECT throws_like(
    $$ SELECT public.refund_credits('f1000000-0000-0000-0000-000000000001'::uuid) $$,
    '%ALREADY_REFUNDED%',
    'generation credit flow: double refund prevented'
);

-- 6j. Deduction with insufficient credits fails
SELECT throws_like(
    $$ SELECT public.deduct_credits(
        'd0000000-0000-0000-0000-000000000002'::uuid,
        999,
        'f1000000-0000-0000-0000-000000000099'::uuid,
        'Should fail - insufficient credits'
    ) $$,
    '%INSUFFICIENT_CREDITS%',
    'generation credit flow: insufficient credits raises exception'
);

-- =============================================================================
-- Done. ROLLBACK undoes all test data + trigger changes automatically.
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
