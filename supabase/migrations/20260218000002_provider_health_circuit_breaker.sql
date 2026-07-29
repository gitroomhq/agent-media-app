-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration: provider_health + alert_events
-- Adds provider health monitoring and circuit breaker infrastructure.
--
-- Creates:
--   - provider_health: per-provider circuit breaker state and health metrics
--   - alert_events: system alert events (unacked alerts shown in health-status)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. provider_health
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks per-provider circuit breaker state and rolling health metrics.
-- One row per provider_slug. Updated by the generate pipeline on every
-- provider interaction (success or failure).

CREATE TABLE public.provider_health (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_slug               text UNIQUE NOT NULL REFERENCES public.provider_configs(provider_slug),
    circuit_state               text NOT NULL DEFAULT 'closed'
                                CHECK (circuit_state IN ('closed', 'open', 'half_open')),
    failure_count               integer NOT NULL DEFAULT 0,
    failure_threshold           integer NOT NULL DEFAULT 5,
    recovery_timeout_seconds    integer NOT NULL DEFAULT 60,
    opened_at                   timestamptz,
    last_success_at             timestamptz,
    last_failure_at             timestamptz,
    last_error_message          text,
    total_successes             bigint NOT NULL DEFAULT 0,
    total_failures              bigint NOT NULL DEFAULT 0,
    avg_latency_ms              numeric(10, 2) DEFAULT 0,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.provider_health IS 'Per-provider circuit breaker state and health metrics.';
COMMENT ON COLUMN public.provider_health.circuit_state IS 'Circuit breaker state: closed (healthy), open (failing), half_open (testing recovery).';
COMMENT ON COLUMN public.provider_health.failure_count IS 'Consecutive failure count since last success. Reset to 0 on success.';
COMMENT ON COLUMN public.provider_health.failure_threshold IS 'Number of consecutive failures before circuit opens.';
COMMENT ON COLUMN public.provider_health.recovery_timeout_seconds IS 'Seconds to wait in open state before transitioning to half_open.';
COMMENT ON COLUMN public.provider_health.opened_at IS 'Timestamp when circuit was last opened.';
COMMENT ON COLUMN public.provider_health.avg_latency_ms IS 'Exponential moving average of provider response latency in milliseconds.';

-- Index for provider lookups
CREATE INDEX idx_provider_health_slug ON public.provider_health(provider_slug);
CREATE INDEX idx_provider_health_state ON public.provider_health(circuit_state);

-- Updated-at trigger
CREATE TRIGGER provider_health_updated_at
    BEFORE UPDATE ON public.provider_health
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. alert_events
-- ═══════════════════════════════════════════════════════════════════════════
-- System alert events for operational monitoring. Unacknowledged alerts
-- appear in the health-status endpoint.

CREATE TABLE public.alert_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type          text NOT NULL
                        CHECK (alert_type IN (
                            'circuit_open',
                            'provider_degraded',
                            'high_failure_rate',
                            'latency_spike',
                            'credit_system_error',
                            'webhook_backlog'
                        )),
    severity            text NOT NULL DEFAULT 'warning'
                        CHECK (severity IN ('info', 'warning', 'critical')),
    provider_slug       text REFERENCES public.provider_configs(provider_slug),
    message             text NOT NULL,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at     timestamptz,
    acknowledged_by     uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alert_events IS 'System alert events for operational monitoring and incident tracking.';
COMMENT ON COLUMN public.alert_events.alert_type IS 'Category of alert event.';
COMMENT ON COLUMN public.alert_events.severity IS 'Alert severity: info, warning, or critical.';
COMMENT ON COLUMN public.alert_events.acknowledged_at IS 'NULL means unacknowledged (active alert).';

-- Indexes
CREATE INDEX idx_alert_events_unacked
    ON public.alert_events(created_at)
    WHERE acknowledged_at IS NULL;

CREATE INDEX idx_alert_events_provider
    ON public.alert_events(provider_slug, created_at);

CREATE INDEX idx_alert_events_type
    ON public.alert_events(alert_type, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

-- provider_health: internal-only, accessed via service_role in Edge Functions.
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;

-- alert_events: internal-only, accessed via service_role in Edge Functions.
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Seed: initial provider_health rows
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-populate a health row for each existing provider so the circuit
-- breaker logic always finds a row.

INSERT INTO public.provider_health (provider_slug, circuit_state, failure_threshold, recovery_timeout_seconds)
SELECT provider_slug, 'closed', 5, 60
FROM public.provider_configs
ON CONFLICT (provider_slug) DO NOTHING;
