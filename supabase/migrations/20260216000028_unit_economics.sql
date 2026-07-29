-- Copyright 2026 agent-media contributors. Apache-2.0 license.

-- Migration 028: Unit economics tracking
-- Views and validation function for monitoring per-model margins and
-- per-generation profitability. Used by the economics dashboard and
-- the pricing quality gate.

-- =============================================================================
-- unit_economics_by_model: Per-model/operation pricing with margin analysis
-- =============================================================================
CREATE VIEW public.unit_economics_by_model AS
SELECT
    m.slug AS model_slug,
    m.display_name,
    mp.operation,
    mp.duration_seconds,
    mp.resolution,
    mp.credit_cost,
    mp.provider_cost_usd,
    (mp.credit_cost * 0.01) AS revenue_usd,
    ((mp.credit_cost * 0.01) - mp.provider_cost_usd) AS margin_usd,
    CASE WHEN mp.credit_cost > 0
        THEN ROUND(((mp.credit_cost * 0.01 - mp.provider_cost_usd) / (mp.credit_cost * 0.01)) * 100, 1)
        ELSE 0
    END AS margin_percent
FROM public.model_pricing mp
JOIN public.models m ON m.slug = mp.model_slug
ORDER BY m.slug, mp.operation, mp.duration_seconds;

COMMENT ON VIEW public.unit_economics_by_model IS
    'Per-model pricing breakdown with revenue, cost, and margin calculations. INTERNAL use only.';

-- =============================================================================
-- generation_economics: Per-job profitability for completed generations
-- =============================================================================
CREATE VIEW public.generation_economics AS
SELECT
    j.id AS job_id,
    j.model_slug,
    j.operation,
    j.duration_seconds,
    j.resolution,
    j.credit_cost,
    j.provider_cost_usd,
    (j.credit_cost * 0.01) AS revenue_usd,
    CASE WHEN j.credit_cost > 0
        THEN ROUND(((j.credit_cost * 0.01 - COALESCE(j.provider_cost_usd, 0)) / (j.credit_cost * 0.01)) * 100, 1)
        ELSE 0
    END AS margin_percent,
    j.status,
    j.created_at
FROM public.generation_jobs j
WHERE j.status = 'completed' AND j.deleted_at IS NULL;

COMMENT ON VIEW public.generation_economics IS
    'Per-generation profitability analysis for completed jobs. INTERNAL use only.';

-- =============================================================================
-- validate_unit_economics(): Quality gate function
-- Checks all model_pricing entries maintain >= 50% margin.
-- Returns JSON array of violations (empty array = all clear).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_unit_economics()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'model_slug', sub.model_slug,
                'operation', sub.operation,
                'duration_seconds', sub.duration_seconds,
                'resolution', sub.resolution,
                'margin_percent', sub.margin_percent,
                'below_threshold', true
            )
        ),
        '[]'::jsonb
    )
    FROM (
        SELECT
            mp.model_slug,
            mp.operation,
            mp.duration_seconds,
            mp.resolution,
            CASE WHEN mp.credit_cost > 0
                THEN ROUND(((mp.credit_cost * 0.01 - mp.provider_cost_usd) / (mp.credit_cost * 0.01)) * 100, 1)
                ELSE 0
            END AS margin_percent
        FROM public.model_pricing mp
        WHERE
            CASE WHEN mp.credit_cost > 0
                THEN ((mp.credit_cost * 0.01 - mp.provider_cost_usd) / (mp.credit_cost * 0.01)) * 100
                ELSE 0
            END < 50
    ) sub;
$$;

COMMENT ON FUNCTION public.validate_unit_economics() IS
    'Quality gate: returns JSON array of model_pricing entries with margin below 50%. Empty array means all entries pass.';
