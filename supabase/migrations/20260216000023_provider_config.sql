-- Migration 023: provider_configs + generation_jobs input_params
-- Provider configuration table for managing AI provider connections.
-- Also adds input_params jsonb column to generation_jobs for storing
-- the full normalized request parameters.

-- ── Provider Configs ────────────────────────────────────────────────────────

CREATE TABLE public.provider_configs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_slug           text UNIQUE NOT NULL,
    display_name            text NOT NULL,
    base_url                text NOT NULL,
    api_version             text,
    enabled                 boolean NOT NULL DEFAULT true,
    rate_limits             jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.provider_configs IS 'INTERNAL: Provider connection configuration. Never exposed to end users.';
COMMENT ON COLUMN public.provider_configs.provider_slug IS 'Unique provider identifier (e.g., kie, fal, replicate)';
COMMENT ON COLUMN public.provider_configs.base_url IS 'Base URL for the provider API';
COMMENT ON COLUMN public.provider_configs.rate_limits IS 'Provider-specific rate limit configuration (requests_per_minute, concurrent_max)';

-- Index for provider lookups
CREATE INDEX idx_provider_configs_slug ON public.provider_configs(provider_slug);
CREATE INDEX idx_provider_configs_enabled ON public.provider_configs(enabled) WHERE enabled = true;

-- Updated-at trigger
CREATE TRIGGER provider_configs_updated_at
    BEFORE UPDATE ON public.provider_configs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.provider_configs ENABLE ROW LEVEL SECURITY;

-- Provider configs are internal-only; no user-facing RLS policy.
-- Access is via service_role key in Edge Functions only.

-- ── Seed: Kie.ai Provider ───────────────────────────────────────────────────

INSERT INTO public.provider_configs (provider_slug, display_name, base_url, api_version, enabled, rate_limits, metadata)
VALUES
    (
        'kie',
        'Kie.ai',
        'https://api.kie.ai',
        'v1',
        true,
        '{"requests_per_minute": 60, "concurrent_max": 10}'::jsonb,
        '{"docs_url": "https://docs.kie.ai", "supported_models": ["bytedance/seedance-2.0"]}'::jsonb
    );

-- ── Add input_params to generation_jobs ─────────────────────────────────────
-- Stores the full normalized GenerationRequest parameters for audit
-- and replay purposes. Existing columns (provider_slug, provider_job_id,
-- credit_cost) are already present from migration 007.

ALTER TABLE public.generation_jobs
    ADD COLUMN IF NOT EXISTS input_params jsonb;

COMMENT ON COLUMN public.generation_jobs.input_params IS 'Full normalized generation request parameters (GenerationRequest)';
