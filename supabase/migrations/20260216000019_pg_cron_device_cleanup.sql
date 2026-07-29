-- Migration 019: pg_cron scheduled cleanup for expired device codes
--
-- Schedules a pg_cron job to DELETE expired device_codes rows every 10 minutes.
-- This prevents the device_codes table from growing unbounded with stale entries
-- left behind by CLI sessions that were never approved or that timed out.
--
-- Reference: architecture doc Section 9.1 (pg_cron), Sprint 2 plan.
-- Copyright 2026 agent-media contributors. Apache-2.0 license.

-- Enable the pg_cron extension (idempotent; Supabase has this available)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage so cron jobs can execute against the public schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the cleanup job: run every 10 minutes
-- Deletes device_codes rows where expires_at is in the past.
-- This covers all statuses -- expired pending codes, approved codes past their
-- window, and any other stale rows.
SELECT cron.schedule(
    'clean-expired-device-codes',   -- job name (unique identifier)
    '*/10 * * * *',                 -- every 10 minutes
    $$DELETE FROM public.device_codes WHERE expires_at < now()$$
);

COMMENT ON EXTENSION pg_cron IS 'Scheduled background jobs for agent-media (device code cleanup, etc.)';
