-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration 021: pg_cron scheduled cleanup for idempotency keys and webhook events
--
-- Schedules hourly cleanup jobs for:
--   1. Expired idempotency_keys (older than 24 hours)
--   2. Processed stripe_webhook_events (older than 7 days)
--
-- These jobs prevent the tables from growing unbounded with stale data.
-- The pg_cron extension was already enabled in migration 019.
--
-- Reference: architecture doc Section 9.1 (pg_cron), Sprint 3 billing.

-- ── Job 1: Clean expired idempotency keys ────────────────────────────────────
-- Runs every hour.  Deletes rows where expires_at has passed.
-- The 24-hour TTL is set at insert time (see migration 010 default).

SELECT cron.schedule(
    'clean-expired-idempotency-keys',   -- job name (unique identifier)
    '0 * * * *',                        -- every hour, on the hour
    $$DELETE FROM public.idempotency_keys WHERE expires_at < now()$$
);

-- ── Job 2: Clean old processed stripe webhook events ─────────────────────────
-- Runs every hour.  Deletes fully-processed events older than 7 days.
-- We only delete rows with a non-null processed_at to preserve events
-- that are still in-flight (processed_at IS NULL).

SELECT cron.schedule(
    'clean-old-stripe-webhook-events',  -- job name (unique identifier)
    '0 * * * *',                        -- every hour, on the hour
    $$DELETE FROM public.stripe_webhook_events
      WHERE processed_at IS NOT NULL
        AND processed_at < now() - interval '7 days'$$
);
