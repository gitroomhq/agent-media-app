-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP test suite for Sprint 5 webhook lifecycle components.
--
-- Tests cover:
--   1. update_job_checkpoint: forward transitions (none -> received -> processing -> media_received -> completed)
--   2. update_job_checkpoint: idempotency (repeat same transition returns false)
--   3. update_job_checkpoint: skip transition (none -> completed works)
--   4. update_job_checkpoint: backward transition (completed -> processing returns false)
--   5. update_job_checkpoint: ANY -> failed (overrides any state)
--   6. find_stuck_jobs: finds jobs stuck beyond timeout threshold
--   7. dead_letter_webhooks: insert, retry_count increment, max_retries limit
--
-- Run with: pg_prove -d <database> supabase/tests/webhook_lifecycle_test.sql
--
-- Prerequisites:
--   - pgTAP extension installed (CREATE EXTENSION IF NOT EXISTS pgtap)
--   - All migrations 001-024 applied
--
-- Note: The entire test runs inside BEGIN/ROLLBACK so all data is cleaned up
-- automatically. We disable the immutability triggers on credit_transactions
-- temporarily to allow mid-test state resets.

BEGIN;

-- Load pgTAP
SELECT plan(29);

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
    ('e0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'webhook-alpha@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Webhook Test Alpha"}'::jsonb),
    ('e0000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'webhook-beta@test.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Webhook Test Beta"}'::jsonb);

-- Set up credit balances
INSERT INTO public.user_credits (user_id, monthly_credits_remaining, purchased_balance)
VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, 500, 200),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 300, 100);

-- Set up subscriptions
INSERT INTO public.subscriptions (id, user_id, plan_slug, status, current_period_start, current_period_end)
VALUES
    ('f0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'starter', 'active', now(), now() + interval '30 days'),
    ('f0000000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'starter', 'active', now(), now() + interval '30 days');

-- Insert test generation jobs for checkpoint tests
INSERT INTO public.generation_jobs (
    id, user_id, model_slug, operation, status, prompt,
    credit_cost, provider_slug, provider_job_id, webhook_checkpoint
)
VALUES
    -- Job 1: for forward transition tests
    ('a1000000-0000-0000-0000-000000000001'::uuid,
     'e0000000-0000-0000-0000-000000000001'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'A sunset over the ocean', 60, 'kie', 'kie-wh-001', 'none'),
    -- Job 2: for idempotency + backward transition tests
    ('a1000000-0000-0000-0000-000000000002'::uuid,
     'e0000000-0000-0000-0000-000000000001'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'A cat playing piano', 60, 'kie', 'kie-wh-002', 'none'),
    -- Job 3: for skip transition test (none -> completed)
    ('a1000000-0000-0000-0000-000000000003'::uuid,
     'e0000000-0000-0000-0000-000000000001'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'A robot dancing', 60, 'kie', 'kie-wh-003', 'none'),
    -- Job 4: for ANY -> failed test
    ('a1000000-0000-0000-0000-000000000004'::uuid,
     'e0000000-0000-0000-0000-000000000001'::uuid,
     'seedance2', 'text_to_video', 'processing',
     'A dragon flying', 60, 'kie', 'kie-wh-004', 'processing'),
    -- Job 5: stuck job test - processing, updated 20 min ago
    ('a1000000-0000-0000-0000-000000000005'::uuid,
     'e0000000-0000-0000-0000-000000000002'::uuid,
     'seedance2', 'text_to_video', 'processing',
     'Stuck job test old', 60, 'kie', 'kie-wh-005', 'processing'),
    -- Job 6: NOT stuck - processing, updated 5 min ago
    ('a1000000-0000-0000-0000-000000000006'::uuid,
     'e0000000-0000-0000-0000-000000000002'::uuid,
     'seedance2', 'text_to_video', 'processing',
     'Stuck job test recent', 60, 'kie', 'kie-wh-006', 'processing'),
    -- Job 7: NOT stuck - completed, updated 20 min ago
    ('a1000000-0000-0000-0000-000000000007'::uuid,
     'e0000000-0000-0000-0000-000000000002'::uuid,
     'seedance2', 'text_to_video', 'completed',
     'Stuck job test completed', 60, 'kie', 'kie-wh-007', 'completed'),
    -- Job 8: for ANY -> failed from none test (with credits deducted)
    ('a1000000-0000-0000-0000-000000000008'::uuid,
     'e0000000-0000-0000-0000-000000000001'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'Failure test job', 60, 'kie', 'kie-wh-008', 'none'),
    -- Job 9: queued submitted job, old enough for processing timeout but not queue timeout
    ('a1000000-0000-0000-0000-000000000009'::uuid,
     'e0000000-0000-0000-0000-000000000002'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'Queued job test recent', 60, 'railway', 'a1000000-0000-0000-0000-000000000009', 'none'),
    -- Job 10: queued submitted job beyond the longer queue timeout
    ('a1000000-0000-0000-0000-000000000010'::uuid,
     'e0000000-0000-0000-0000-000000000002'::uuid,
     'seedance2', 'text_to_video', 'submitted',
     'Queued job test old', 60, 'railway', 'a1000000-0000-0000-0000-000000000010', 'none');

-- Manually set updated_at for stuck-job testing (bypass set_updated_at trigger)
UPDATE public.generation_jobs
SET updated_at = now() - interval '20 minutes'
WHERE id = 'a1000000-0000-0000-0000-000000000005'::uuid;

UPDATE public.generation_jobs
SET updated_at = now() - interval '5 minutes'
WHERE id = 'a1000000-0000-0000-0000-000000000006'::uuid;

UPDATE public.generation_jobs
SET updated_at = now() - interval '20 minutes'
WHERE id = 'a1000000-0000-0000-0000-000000000007'::uuid;

UPDATE public.generation_jobs
SET updated_at = now() - interval '20 minutes'
WHERE id = 'a1000000-0000-0000-0000-000000000009'::uuid;

UPDATE public.generation_jobs
SET updated_at = now() - interval '70 minutes'
WHERE id = 'a1000000-0000-0000-0000-000000000010'::uuid;

-- Deduct credits for job 8 so refund_credits can be tested on failure path
SELECT public.deduct_credits(
    'e0000000-0000-0000-0000-000000000001'::uuid,
    60,
    'a1000000-0000-0000-0000-000000000008'::uuid,
    'Generation: Seedance 2.0 (text_to_video)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 1: update_job_checkpoint forward transitions (8 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1a. Transition none -> received (should update, return true)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000001'::uuid,
        'received', 'submitted'
    ),
    true,
    'update_job_checkpoint: none -> received returns true'
);

SELECT is(
    (SELECT webhook_checkpoint FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000001'::uuid),
    'received',
    'update_job_checkpoint: checkpoint updated to received'
);

-- 1b. Transition received -> processing (should update, set started_at)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000001'::uuid,
        'processing', 'processing'
    ),
    true,
    'update_job_checkpoint: received -> processing returns true'
);

SELECT ok(
    (SELECT started_at FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000001'::uuid) IS NOT NULL,
    'update_job_checkpoint: started_at set when transitioning to processing'
);

-- 1c. Transition processing -> media_received (should update, set output_media_url)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000001'::uuid,
        'media_received', 'processing',
        'https://storage.example.com/output/video.mp4',
        'https://storage.example.com/output/thumb.jpg'
    ),
    true,
    'update_job_checkpoint: processing -> media_received returns true'
);

SELECT is(
    (SELECT output_media_url FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000001'::uuid),
    'https://storage.example.com/output/video.mp4',
    'update_job_checkpoint: output_media_url set on media_received'
);

-- 1d. Transition media_received -> completed (should update, set completed_at)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000001'::uuid,
        'completed', 'completed'
    ),
    true,
    'update_job_checkpoint: media_received -> completed returns true'
);

SELECT ok(
    (SELECT completed_at FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000001'::uuid) IS NOT NULL,
    'update_job_checkpoint: completed_at set when transitioning to completed'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 2: update_job_checkpoint idempotency (2 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- First advance job 2 to processing
SELECT public.update_job_checkpoint(
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'processing', 'processing'
);

-- 2a. Repeat same transition: processing -> processing (should return false)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000002'::uuid,
        'processing', 'processing'
    ),
    false,
    'update_job_checkpoint: idempotent repeat returns false'
);

-- 2b. Verify state unchanged
SELECT is(
    (SELECT webhook_checkpoint FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000002'::uuid),
    'processing',
    'update_job_checkpoint: idempotent repeat leaves checkpoint unchanged'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 3: update_job_checkpoint skip transition (1 test)
-- ═════════════════════════════════════════════════════════════════════════════

-- 3a. Skip transition: none -> completed (should work -- allows direct completion)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000003'::uuid,
        'completed', 'completed'
    ),
    true,
    'update_job_checkpoint: skip transition none -> completed returns true'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 4: update_job_checkpoint backward transition (1 test)
-- ═════════════════════════════════════════════════════════════════════════════

-- 4a. Backward: completed -> processing (should return false -- no backward)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000001'::uuid,
        'processing', 'processing'
    ),
    false,
    'update_job_checkpoint: backward completed -> processing returns false'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 5: update_job_checkpoint ANY -> failed (3 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 5a. Transition processing -> failed (should work from any state)
SELECT is(
    public.update_job_checkpoint(
        'a1000000-0000-0000-0000-000000000004'::uuid,
        'failed', 'failed',
        NULL, NULL,
        'Provider returned an error', 'PROVIDER_ERROR'
    ),
    true,
    'update_job_checkpoint: processing -> failed returns true'
);

-- 5b. Verify error_message was set
SELECT is(
    (SELECT error_message FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000004'::uuid),
    'Provider returned an error',
    'update_job_checkpoint: error_message set on failed transition'
);

-- 5c. Verify completed_at was set (failed is a terminal state)
SELECT ok(
    (SELECT completed_at FROM public.generation_jobs
     WHERE id = 'a1000000-0000-0000-0000-000000000004'::uuid) IS NOT NULL,
    'update_job_checkpoint: completed_at set on failed transition (terminal state)'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 6: find_stuck_jobs (5 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 6a. Job updated 20 min ago in processing -> should be found (default timeout 15 min)
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.find_stuck_jobs(15)
        WHERE id = 'a1000000-0000-0000-0000-000000000005'::uuid
    ),
    'find_stuck_jobs: finds job stuck for 20 min in processing'
);

-- 6b. Job updated 5 min ago in processing -> should NOT be found
SELECT ok(
    NOT EXISTS(
        SELECT 1 FROM public.find_stuck_jobs(15)
        WHERE id = 'a1000000-0000-0000-0000-000000000006'::uuid
    ),
    'find_stuck_jobs: does NOT find recent processing job (5 min ago)'
);

-- 6c. Job updated 20 min ago but completed -> should NOT be found
SELECT ok(
    NOT EXISTS(
        SELECT 1 FROM public.find_stuck_jobs(15)
        WHERE id = 'a1000000-0000-0000-0000-000000000007'::uuid
    ),
    'find_stuck_jobs: does NOT find completed job even if old'
);

-- 6d. Submitted job updated 20 min ago -> should NOT be found because it may be queued
SELECT ok(
    NOT EXISTS(
        SELECT 1 FROM public.find_stuck_jobs(15)
        WHERE id = 'a1000000-0000-0000-0000-000000000009'::uuid
    ),
    'find_stuck_jobs: does NOT find submitted queue job after processing timeout only'
);

-- 6e. Submitted job updated 70 min ago -> should be found after queue timeout
SELECT ok(
    EXISTS(
        SELECT 1 FROM public.find_stuck_jobs(15)
        WHERE id = 'a1000000-0000-0000-0000-000000000010'::uuid
    ),
    'find_stuck_jobs: finds submitted queue job after queue timeout'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST GROUP 7: dead_letter_webhooks operations (5 tests)
-- ═════════════════════════════════════════════════════════════════════════════

-- 7a. Insert a dead letter entry, verify retry_count starts at 0
INSERT INTO public.dead_letter_webhooks (
    id, provider_slug, payload, error_message, max_retries, status
)
VALUES (
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'kie',
    '{"event":"generation.complete","job_id":"kie-wh-999"}'::jsonb,
    'Failed to process webhook: timeout',
    3,
    'pending'
);

SELECT is(
    (SELECT retry_count::text FROM public.dead_letter_webhooks
     WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid),
    '0',
    'dead_letter_webhooks: retry_count starts at 0'
);

-- 7b. Verify next_retry_at is initially NULL
SELECT ok(
    (SELECT next_retry_at FROM public.dead_letter_webhooks
     WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid) IS NULL,
    'dead_letter_webhooks: next_retry_at is NULL initially'
);

-- 7c. Increment retry_count and set next_retry_at (simulating cron retry)
UPDATE public.dead_letter_webhooks
SET retry_count = retry_count + 1,
    next_retry_at = now() + interval '30 minutes',
    status = 'retrying'
WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT retry_count::text FROM public.dead_letter_webhooks
     WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid),
    '1',
    'dead_letter_webhooks: retry_count incremented to 1'
);

-- 7d. Verify next_retry_at was set
SELECT ok(
    (SELECT next_retry_at FROM public.dead_letter_webhooks
     WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid) IS NOT NULL,
    'dead_letter_webhooks: next_retry_at set after retry increment'
);

-- 7e. Verify max_retries limit is respected (cron UPDATE with WHERE clause)
-- Advance retry_count to max_retries (3), then verify the cron-style UPDATE
-- does NOT touch the row.
UPDATE public.dead_letter_webhooks
SET retry_count = 3, status = 'exhausted'
WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid;

-- Simulate the cron job UPDATE (only updates rows where retry_count < max_retries)
UPDATE public.dead_letter_webhooks
SET retry_count = retry_count + 1,
    next_retry_at = now() + ((retry_count + 1) * interval '30 minutes')
WHERE retry_count < max_retries
  AND id = 'b1000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
    (SELECT retry_count::text FROM public.dead_letter_webhooks
     WHERE id = 'b1000000-0000-0000-0000-000000000001'::uuid),
    '3',
    'dead_letter_webhooks: max_retries respected -- retry_count stays at 3'
);

-- =============================================================================
-- Done. ROLLBACK undoes all test data + trigger changes automatically.
-- =============================================================================
SELECT * FROM finish();

ROLLBACK;
