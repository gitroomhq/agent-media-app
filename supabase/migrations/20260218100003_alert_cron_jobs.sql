-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration: alert_cron_jobs
-- Sprint 11: Automated observability checks -- scheduled cron jobs that
-- evaluate provider health metrics and fire alerts when thresholds are
-- exceeded.
--
-- Jobs created:
--   1. check-error-rate           -- every 5 minutes
--   2. check-provider-latency     -- every 5 minutes
--   3. check-webhook-failures     -- every 10 minutes
--
-- All jobs respect the alert_thresholds table for dynamic configuration
-- and cooldown_minutes to prevent alert storms.
--
-- The pg_cron extension was already enabled in migration 019.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Stored procedure: check_error_rate
-- ═══════════════════════════════════════════════════════════════════════════
-- Computes the error rate across all generation jobs within the configured
-- window and fires an alert if the rate exceeds the threshold.

CREATE OR REPLACE FUNCTION public.check_error_rate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_threshold     numeric;
    v_window        integer;
    v_cooldown      integer;
    v_total         bigint;
    v_failed        bigint;
    v_error_rate    numeric;
    v_last_alert    timestamptz;
BEGIN
    -- Load threshold configuration
    SELECT threshold_value, window_minutes, cooldown_minutes
    INTO v_threshold, v_window, v_cooldown
    FROM public.alert_thresholds
    WHERE alert_type = 'error_rate'
      AND is_enabled = true;

    IF NOT FOUND THEN
        RETURN;  -- Alert type disabled or not configured
    END IF;

    -- Count total and failed jobs within the window
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_failed
    FROM public.generation_jobs
    WHERE created_at >= now() - (v_window || ' minutes')::interval;

    -- Avoid division by zero
    IF v_total = 0 THEN
        RETURN;
    END IF;

    v_error_rate := (v_failed::numeric / v_total::numeric) * 100.0;

    -- Check if threshold is exceeded
    IF v_error_rate > v_threshold THEN
        -- Check cooldown
        SELECT MAX(created_at)
        INTO v_last_alert
        FROM public.alert_events
        WHERE alert_type = 'error_rate';

        IF v_last_alert IS NULL
           OR v_last_alert < now() - (v_cooldown || ' minutes')::interval
        THEN
            INSERT INTO public.alert_events (alert_type, severity, message, details)
            VALUES (
                'error_rate',
                CASE
                    WHEN v_error_rate > 50.0 THEN 'critical'
                    WHEN v_error_rate > 25.0 THEN 'warning'
                    ELSE 'info'
                END,
                'Error rate ' || ROUND(v_error_rate, 2) || '% exceeds threshold ' || v_threshold || '% over last ' || v_window || ' minutes',
                jsonb_build_object(
                    'error_rate_pct', ROUND(v_error_rate, 2),
                    'threshold_pct', v_threshold,
                    'total_jobs', v_total,
                    'failed_jobs', v_failed,
                    'window_minutes', v_window
                )
            );
        END IF;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.check_error_rate()
    IS 'Evaluate generation job error rate and fire alert if threshold exceeded.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Stored procedure: check_provider_latency
-- ═══════════════════════════════════════════════════════════════════════════
-- Checks each provider's average latency against the configured threshold
-- and fires alerts for slow providers.

CREATE OR REPLACE FUNCTION public.check_provider_latency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_threshold     numeric;
    v_window        integer;
    v_cooldown      integer;
    v_provider      record;
    v_last_alert    timestamptz;
BEGIN
    -- Load threshold configuration
    SELECT threshold_value, window_minutes, cooldown_minutes
    INTO v_threshold, v_window, v_cooldown
    FROM public.alert_thresholds
    WHERE alert_type = 'provider_latency'
      AND is_enabled = true;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Check each provider's health metrics
    FOR v_provider IN
        SELECT provider_slug, avg_latency_ms, p99_latency_ms, circuit_state
        FROM public.provider_health
        WHERE avg_latency_ms IS NOT NULL
          AND avg_latency_ms > v_threshold
    LOOP
        -- Check cooldown for this specific provider
        SELECT MAX(created_at)
        INTO v_last_alert
        FROM public.alert_events
        WHERE alert_type = 'provider_latency'
          AND details->>'provider_slug' = v_provider.provider_slug;

        IF v_last_alert IS NULL
           OR v_last_alert < now() - (v_cooldown || ' minutes')::interval
        THEN
            INSERT INTO public.alert_events (alert_type, severity, message, details)
            VALUES (
                'provider_latency',
                CASE
                    WHEN v_provider.avg_latency_ms > v_threshold * 3 THEN 'critical'
                    WHEN v_provider.avg_latency_ms > v_threshold * 2 THEN 'warning'
                    ELSE 'info'
                END,
                'Provider ' || v_provider.provider_slug || ' avg latency '
                    || ROUND(v_provider.avg_latency_ms, 0) || 'ms exceeds threshold '
                    || ROUND(v_threshold, 0) || 'ms',
                jsonb_build_object(
                    'provider_slug', v_provider.provider_slug,
                    'avg_latency_ms', ROUND(v_provider.avg_latency_ms, 2),
                    'p99_latency_ms', ROUND(COALESCE(v_provider.p99_latency_ms, 0), 2),
                    'threshold_ms', v_threshold,
                    'circuit_state', v_provider.circuit_state
                )
            );
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_provider_latency()
    IS 'Check provider latency metrics and fire alerts for slow providers.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Stored procedure: check_webhook_failures
-- ═══════════════════════════════════════════════════════════════════════════
-- Counts webhook delivery failures in the dead_letter_webhooks table
-- within the evaluation window and fires an alert if the count exceeds
-- the threshold.

CREATE OR REPLACE FUNCTION public.check_webhook_failures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_threshold     numeric;
    v_window        integer;
    v_cooldown      integer;
    v_failure_count bigint;
    v_last_alert    timestamptz;
BEGIN
    -- Load threshold configuration
    SELECT threshold_value, window_minutes, cooldown_minutes
    INTO v_threshold, v_window, v_cooldown
    FROM public.alert_thresholds
    WHERE alert_type = 'webhook_failure'
      AND is_enabled = true;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Count recent webhook failures
    SELECT COUNT(*)
    INTO v_failure_count
    FROM public.dead_letter_webhooks
    WHERE created_at >= now() - (v_window || ' minutes')::interval;

    -- Check if threshold is exceeded
    IF v_failure_count > v_threshold THEN
        -- Check cooldown
        SELECT MAX(created_at)
        INTO v_last_alert
        FROM public.alert_events
        WHERE alert_type = 'webhook_failure';

        IF v_last_alert IS NULL
           OR v_last_alert < now() - (v_cooldown || ' minutes')::interval
        THEN
            INSERT INTO public.alert_events (alert_type, severity, message, details)
            VALUES (
                'webhook_failure',
                CASE
                    WHEN v_failure_count > v_threshold * 5 THEN 'critical'
                    WHEN v_failure_count > v_threshold * 2 THEN 'warning'
                    ELSE 'info'
                END,
                v_failure_count || ' webhook failures in last ' || v_window || ' minutes (threshold: ' || v_threshold || ')',
                jsonb_build_object(
                    'failure_count', v_failure_count,
                    'threshold', v_threshold,
                    'window_minutes', v_window
                )
            );
        END IF;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.check_webhook_failures()
    IS 'Check dead-letter webhook count and fire alert if threshold exceeded.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Schedule cron jobs
-- ═══════════════════════════════════════════════════════════════════════════

-- Error rate check: every 5 minutes
SELECT cron.schedule(
    'check-error-rate',                 -- job name (unique identifier)
    '*/5 * * * *',                      -- every 5 minutes
    $$SELECT check_error_rate()$$
);

-- Provider latency check: every 5 minutes
SELECT cron.schedule(
    'check-provider-latency',           -- job name (unique identifier)
    '*/5 * * * *',                      -- every 5 minutes
    $$SELECT check_provider_latency()$$
);

-- Webhook failures check: every 10 minutes
SELECT cron.schedule(
    'check-webhook-failures',           -- job name (unique identifier)
    '*/10 * * * *',                     -- every 10 minutes
    $$SELECT check_webhook_failures()$$
);
