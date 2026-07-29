-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- pgTAP tests for the device_codes table and device flow logic.
--
-- Tests cover:
--   1. Device code creation stores correctly
--   2. Device code approval updates status and links user
--   3. Expired device codes are rejected (cannot be approved)
--   4. Confirmation code must match for approval
--
-- Run with: pg_prove -d <database> supabase/tests/device_flow_test.sql

BEGIN;

-- Load pgTAP
SELECT plan(15);

-- ════════════════════════════════════════════════════════════════════════════
-- Setup: create a test user in profiles (simulating a Supabase Auth user)
-- ════════════════════════════════════════════════════════════════════════════

-- Insert a test auth user (profile auto-created via trigger on auth.users)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data)
VALUES (
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated', 'authenticated',
    'test-device@example.com',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(), '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Device Test User"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- Test 1: Device code creation stores correctly
-- ════════════════════════════════════════════════════════════════════════════

-- Insert a valid device code
INSERT INTO public.device_codes (
    device_code, user_code, confirmation_code, status, expires_at
) VALUES (
    'aabbccdd11223344aabbccdd11223344',
    'ABCD-EFGH',
    '123456',
    'pending',
    now() + interval '15 minutes'
);

SELECT ok(
    EXISTS(
        SELECT 1 FROM public.device_codes
        WHERE device_code = 'aabbccdd11223344aabbccdd11223344'
    ),
    'Device code row was inserted'
);

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    'pending',
    'Initial status is pending'
);

SELECT is(
    (SELECT user_code FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    'ABCD-EFGH',
    'User code stored correctly'
);

SELECT is(
    (SELECT confirmation_code FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    '123456',
    'Confirmation code stored correctly'
);

SELECT ok(
    (SELECT expires_at FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344') > now(),
    'Expires_at is in the future'
);

SELECT isnt(
    (SELECT id FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    NULL,
    'Auto-generated UUID id is populated'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Test 2: Device code approval updates status and links user
-- ════════════════════════════════════════════════════════════════════════════

-- Simulate approval: update status to approved and link user_id
UPDATE public.device_codes
SET status = 'approved',
    user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
WHERE device_code = 'aabbccdd11223344aabbccdd11223344'
  AND status = 'pending'
  AND confirmation_code = '123456';

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    'approved',
    'Status updated to approved after valid approval'
);

SELECT is(
    (SELECT user_id FROM public.device_codes
     WHERE device_code = 'aabbccdd11223344aabbccdd11223344'),
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
    'user_id linked after approval'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Test 3: Expired device codes are rejected
-- ════════════════════════════════════════════════════════════════════════════

-- Insert an already-expired device code
INSERT INTO public.device_codes (
    device_code, user_code, confirmation_code, status, expires_at
) VALUES (
    'expired0expired0expired0expired0',
    'WXYZ-MNPQ',
    '654321',
    'pending',
    now() - interval '5 minutes'
);

SELECT ok(
    (SELECT expires_at FROM public.device_codes
     WHERE device_code = 'expired0expired0expired0expired0') < now(),
    'Expired device code has expires_at in the past'
);

-- Attempt to approve the expired code (should not match due to application logic,
-- but at the database level the row still exists and status is still pending)
-- In the Edge Function, we check expires_at before approving. Simulate that:
-- Only approve if NOT expired
UPDATE public.device_codes
SET status = 'approved',
    user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
WHERE device_code = 'expired0expired0expired0expired0'
  AND status = 'pending'
  AND expires_at > now();

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'expired0expired0expired0expired0'),
    'pending',
    'Expired device code was NOT approved (status still pending)'
);

SELECT is(
    (SELECT user_id FROM public.device_codes
     WHERE device_code = 'expired0expired0expired0expired0'),
    NULL,
    'Expired device code has no user_id linked'
);

-- Mark it as expired explicitly (as the Edge Function would)
UPDATE public.device_codes
SET status = 'expired'
WHERE device_code = 'expired0expired0expired0expired0';

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'expired0expired0expired0expired0'),
    'expired',
    'Device code status set to expired'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Test 4: Confirmation code must match for approval
-- ════════════════════════════════════════════════════════════════════════════

-- Insert a new pending device code
INSERT INTO public.device_codes (
    device_code, user_code, confirmation_code, status, expires_at
) VALUES (
    'confirm0confirm0confirm0confirm0',
    'JKLM-NRST',
    '999888',
    'pending',
    now() + interval '15 minutes'
);

-- Attempt approval with WRONG confirmation code
UPDATE public.device_codes
SET status = 'approved',
    user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
WHERE device_code = 'confirm0confirm0confirm0confirm0'
  AND status = 'pending'
  AND confirmation_code = '111111'
  AND expires_at > now();

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'confirm0confirm0confirm0confirm0'),
    'pending',
    'Wrong confirmation code does NOT approve device code'
);

SELECT is(
    (SELECT user_id FROM public.device_codes
     WHERE device_code = 'confirm0confirm0confirm0confirm0'),
    NULL,
    'Wrong confirmation code leaves user_id as NULL'
);

-- Now approve with the CORRECT confirmation code
UPDATE public.device_codes
SET status = 'approved',
    user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
WHERE device_code = 'confirm0confirm0confirm0confirm0'
  AND status = 'pending'
  AND confirmation_code = '999888'
  AND expires_at > now();

SELECT is(
    (SELECT status FROM public.device_codes
     WHERE device_code = 'confirm0confirm0confirm0confirm0'),
    'approved',
    'Correct confirmation code approves the device code'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Cleanup and finish
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM finish();

ROLLBACK;
