-- Migration 022: feature_flags
-- Feature flag system for controlling rollout of platform capabilities.
-- Supports per-plan-tier access control and percentage-based gradual rollout.

CREATE TABLE public.feature_flags (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text UNIQUE NOT NULL,
    enabled                 boolean NOT NULL DEFAULT false,
    rollout_percentage      integer NOT NULL DEFAULT 100
                            CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    allowed_plan_tiers      text[] NOT NULL DEFAULT '{}',
    metadata                jsonb NOT NULL DEFAULT '{}',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_flags IS 'Feature flags controlling rollout of platform capabilities';
COMMENT ON COLUMN public.feature_flags.name IS 'Unique feature identifier (e.g., video_generation, kie_ai_provider)';
COMMENT ON COLUMN public.feature_flags.rollout_percentage IS 'Percentage of eligible users who see the feature (0-100)';
COMMENT ON COLUMN public.feature_flags.allowed_plan_tiers IS 'Plan tiers that have access; empty array means all tiers';

-- Index for fast feature lookups by name
CREATE INDEX idx_feature_flags_name ON public.feature_flags(name);

-- Updated-at trigger
CREATE TRIGGER feature_flags_updated_at
    BEFORE UPDATE ON public.feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read feature flags (needed for client-side gating)
CREATE POLICY feature_flags_select_authenticated
    ON public.feature_flags
    FOR SELECT
    TO authenticated
    USING (true);

-- ── Seed Data ───────────────────────────────────────────────────────────────

INSERT INTO public.feature_flags (name, enabled, rollout_percentage, allowed_plan_tiers, metadata)
VALUES
    (
        'video_generation',
        true,
        100,
        ARRAY['free', 'starter', 'growth', 'pro'],
        '{"description": "Core video generation capability"}'::jsonb
    ),
    (
        'image_generation',
        true,
        100,
        ARRAY['free', 'starter', 'growth', 'pro'],
        '{"description": "Core image generation capability"}'::jsonb
    ),
    (
        'kie_ai_provider',
        true,
        100,
        ARRAY['starter', 'growth', 'pro'],
        '{"description": "Access to Kie.ai provider for Seedance 2.0 models"}'::jsonb
    );
