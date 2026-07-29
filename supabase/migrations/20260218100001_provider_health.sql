-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration: provider_health (additive)
-- Sprint 11: Provider failover and observability -- add columns that were
-- missing from the initial provider_health table (created in migration
-- 20260218000002_provider_health_circuit_breaker.sql).
--
-- This migration is safe to re-run: it uses ADD COLUMN IF NOT EXISTS and
-- IF NOT EXISTS for indexes.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add missing columns to provider_health
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.provider_health
    ADD COLUMN IF NOT EXISTS failure_window_seconds integer NOT NULL DEFAULT 60
        CHECK (failure_window_seconds > 0);

ALTER TABLE public.provider_health
    ADD COLUMN IF NOT EXISTS total_requests bigint NOT NULL DEFAULT 0
        CHECK (total_requests >= 0);

ALTER TABLE public.provider_health
    ADD COLUMN IF NOT EXISTS p99_latency_ms numeric;

ALTER TABLE public.provider_health
    ADD COLUMN IF NOT EXISTS failure_window_start timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Comments on columns (only for columns that now exist)
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.provider_health.failure_window_seconds IS 'Rolling window duration for counting failures';
COMMENT ON COLUMN public.provider_health.recovery_timeout_seconds IS 'Seconds to wait in open state before transitioning to half_open';
COMMENT ON COLUMN public.provider_health.avg_latency_ms IS 'Exponential moving average of provider response latency';
COMMENT ON COLUMN public.provider_health.p99_latency_ms IS 'Approximate 99th percentile latency (updated via reservoir sampling)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes (safe to re-run with IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_provider_health_circuit_state
    ON public.provider_health(circuit_state);

CREATE INDEX IF NOT EXISTS idx_provider_health_non_closed
    ON public.provider_health(circuit_state)
    WHERE circuit_state <> 'closed';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Seed: provider health rows (kie already seeded in 000002)
-- ═══════════════════════════════════════════════════════════════════════════
-- No additional seed needed here; the fal provider health row
-- will be inserted in the switch_to_fal_provider migration after
-- the fal provider_config exists.
