-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration: observability_tables (additive)
-- Sprint 11: Observability infrastructure -- credit reconciliation,
-- alert thresholds, alert events additions, and hourly reconciliation cron job.
--
-- This migration adds new tables and columns on top of existing schema
-- created in 20260218000002_provider_health_circuit_breaker.sql.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. credit_reconciliation_log
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.credit_reconciliation_log (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expected_plan_credits       integer NOT NULL,
    expected_purchased_credits  integer NOT NULL,
    actual_plan_credits         integer NOT NULL,
    actual_purchased_credits    integer NOT NULL,
    plan_credit_discrepancy     integer NOT NULL DEFAULT 0,
    purchased_credit_discrepancy integer NOT NULL DEFAULT 0,
    is_reconciled               boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_reconciliation_log IS 'Audit log of credit balance reconciliations. Tracks drift between ledger and balances.';
COMMENT ON COLUMN public.credit_reconciliation_log.plan_credit_discrepancy IS 'expected_plan_credits - actual_plan_credits; zero means no drift';
COMMENT ON COLUMN public.credit_reconciliation_log.is_reconciled IS 'Whether the discrepancy has been reviewed and resolved';

CREATE INDEX IF NOT EXISTS idx_credit_reconciliation_user
    ON public.credit_reconciliation_log(user_id);

CREATE INDEX IF NOT EXISTS idx_credit_reconciliation_unresolved
    ON public.credit_reconciliation_log(is_reconciled)
    WHERE is_reconciled = false;

ALTER TABLE public.credit_reconciliation_log ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. alert_thresholds
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.alert_thresholds (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type          text UNIQUE NOT NULL
                        CHECK (alert_type IN (
                            'error_rate',
                            'webhook_failure',
                            'credit_discrepancy',
                            'provider_latency',
                            'circuit_breaker_open'
                        )),
    threshold_value     numeric NOT NULL
                        CHECK (threshold_value >= 0),
    window_minutes      integer NOT NULL DEFAULT 5
                        CHECK (window_minutes > 0),
    cooldown_minutes    integer NOT NULL DEFAULT 15
                        CHECK (cooldown_minutes > 0),
    is_enabled          boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alert_thresholds IS 'Configurable alerting thresholds for observability monitors.';
COMMENT ON COLUMN public.alert_thresholds.alert_type IS 'Category of alert: error_rate, webhook_failure, credit_discrepancy, provider_latency, circuit_breaker_open';
COMMENT ON COLUMN public.alert_thresholds.threshold_value IS 'Threshold that triggers the alert (interpretation depends on alert_type)';
COMMENT ON COLUMN public.alert_thresholds.window_minutes IS 'Evaluation window in minutes over which the threshold is computed';
COMMENT ON COLUMN public.alert_thresholds.cooldown_minutes IS 'Minimum minutes between consecutive firings of the same alert type';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'alert_thresholds_updated_at'
    ) THEN
        CREATE TRIGGER alert_thresholds_updated_at
            BEFORE UPDATE ON public.alert_thresholds
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;

ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. alert_events: add missing columns to existing table
-- ═══════════════════════════════════════════════════════════════════════════
-- The alert_events table was already created in migration 000002. We add
-- columns that the observability functions need.

ALTER TABLE public.alert_events
    ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.alert_events
    ADD COLUMN IF NOT EXISTS acknowledged boolean NOT NULL DEFAULT false;

-- Additional indexes (IF NOT EXISTS is safe to re-run)
CREATE INDEX IF NOT EXISTS idx_alert_events_severity
    ON public.alert_events(severity);

CREATE INDEX IF NOT EXISTS idx_alert_events_created
    ON public.alert_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_unacknowledged
    ON public.alert_events(acknowledged)
    WHERE acknowledged = false;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Seed: Default alert thresholds
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.alert_thresholds (alert_type, threshold_value, window_minutes, cooldown_minutes, is_enabled)
VALUES
    ('error_rate',            10.0,  5,  15, true),
    ('webhook_failure',        5.0, 10,  30, true),
    ('credit_discrepancy',     1.0, 60,  60, true),
    ('provider_latency',   30000.0,  5,  15, true),
    ('circuit_breaker_open',   1.0,  1,  60, true)
ON CONFLICT (alert_type) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Stored procedure: reconcile_credits
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user              record;
    v_expected_monthly  integer;
    v_expected_purchased integer;
    v_plan_diff         integer;
    v_purchased_diff    integer;
    v_discrepancy_count integer := 0;
    v_threshold         numeric;
    v_cooldown          integer;
    v_last_alert        timestamptz;
BEGIN
    FOR v_user IN
        SELECT uc.user_id,
               uc.monthly_credits_remaining AS actual_monthly,
               uc.purchased_balance         AS actual_purchased
        FROM public.user_credits uc
    LOOP
        SELECT COALESCE(running_monthly_balance, 0),
               COALESCE(running_purchased_balance, 0)
        INTO v_expected_monthly, v_expected_purchased
        FROM public.credit_transactions
        WHERE user_id = v_user.user_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        v_plan_diff := v_expected_monthly - v_user.actual_monthly;
        v_purchased_diff := v_expected_purchased - v_user.actual_purchased;

        IF v_plan_diff <> 0 OR v_purchased_diff <> 0 THEN
            INSERT INTO public.credit_reconciliation_log (
                user_id,
                expected_plan_credits,
                expected_purchased_credits,
                actual_plan_credits,
                actual_purchased_credits,
                plan_credit_discrepancy,
                purchased_credit_discrepancy,
                is_reconciled
            ) VALUES (
                v_user.user_id,
                v_expected_monthly,
                v_expected_purchased,
                v_user.actual_monthly,
                v_user.actual_purchased,
                v_plan_diff,
                v_purchased_diff,
                false
            );

            v_discrepancy_count := v_discrepancy_count + 1;
        END IF;
    END LOOP;

    IF v_discrepancy_count > 0 THEN
        SELECT threshold_value, cooldown_minutes
        INTO v_threshold, v_cooldown
        FROM public.alert_thresholds
        WHERE alert_type = 'credit_discrepancy'
          AND is_enabled = true;

        IF FOUND AND v_discrepancy_count >= v_threshold THEN
            SELECT MAX(created_at)
            INTO v_last_alert
            FROM public.alert_events
            WHERE alert_type = 'credit_discrepancy';

            IF v_last_alert IS NULL
               OR v_last_alert < now() - (v_cooldown || ' minutes')::interval
            THEN
                INSERT INTO public.alert_events (
                    alert_type,
                    severity,
                    message,
                    details
                ) VALUES (
                    'credit_discrepancy',
                    CASE
                        WHEN v_discrepancy_count >= 10 THEN 'critical'
                        WHEN v_discrepancy_count >= 3  THEN 'warning'
                        ELSE 'info'
                    END,
                    'Credit reconciliation found ' || v_discrepancy_count || ' user(s) with balance discrepancies',
                    jsonb_build_object(
                        'discrepancy_count', v_discrepancy_count,
                        'reconciled_at', now()::text
                    )
                );
            END IF;
        END IF;
    END IF;

    RETURN v_discrepancy_count;
END;
$$;

COMMENT ON FUNCTION public.reconcile_credits()
    IS 'Compare user_credits balances against credit_transactions ledger. Logs discrepancies and fires alerts.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. pg_cron: Hourly credit reconciliation
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
    'reconcile-credits-hourly',
    '0 * * * *',
    $$SELECT reconcile_credits()$$
);
