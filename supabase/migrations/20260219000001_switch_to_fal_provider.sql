-- Migration: Switch from Kie.ai to fal.ai provider
-- Disables Kie.ai, adds fal.ai config, replaces all models and pricing.

BEGIN;

-- =============================================================================
-- (a) Provider configs: add fal.ai, disable kie
-- =============================================================================

INSERT INTO public.provider_configs (provider_slug, display_name, base_url, api_version, enabled, rate_limits, metadata)
VALUES (
    'fal',
    'fal.ai',
    'https://queue.fal.run',
    'v1',
    true,
    '{"requests_per_minute": 60, "concurrent_max": 10}'::jsonb,
    '{"docs_url": "https://fal.ai/docs"}'::jsonb
)
ON CONFLICT (provider_slug) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        base_url     = EXCLUDED.base_url,
        api_version  = EXCLUDED.api_version,
        enabled      = EXCLUDED.enabled,
        rate_limits  = EXCLUDED.rate_limits,
        metadata     = EXCLUDED.metadata;

UPDATE public.provider_configs
SET enabled = false
WHERE provider_slug = 'kie';

-- Seed provider_health row for fal
INSERT INTO public.provider_health (provider_slug, circuit_state, failure_threshold, recovery_timeout_seconds)
VALUES ('fal', 'closed', 5, 60)
ON CONFLICT (provider_slug) DO NOTHING;

-- =============================================================================
-- (b) Delete old model_pricing rows
-- =============================================================================

DELETE FROM public.model_pricing
WHERE model_slug IN (
    'seedance2', 'seedance1.5', 'kling3.0', 'veo3.1',
    'flux2-pro', 'flux2-flex', 'seedream4.5'
);

-- =============================================================================
-- (c) Deactivate old models (cannot delete due to FK from generation_jobs)
-- =============================================================================

UPDATE public.models
SET is_active = false
WHERE slug IN (
    'seedance2', 'seedance1.5', 'kling3.0', 'veo3.1',
    'seedream4.5'
);

-- =============================================================================
-- (d) Insert new models (fal.ai)
-- =============================================================================

-- Video models
INSERT INTO public.models (slug, display_name, description, media_type, provider_slug, provider_model_id, supports_text_to_video, supports_image_to_video, supports_text_to_image, max_duration_seconds, max_resolution, is_active)
VALUES
    ('kling3',    'Kling 3.0 Pro',     'Kuaishou high-fidelity video generation via fal.ai',                         'video', 'fal', 'fal-ai/kling-video/v3/pro',              true, true, false, 10, '1080p', true),
    ('veo3',      'Veo 3.1',           'Google DeepMind video generation with natural motion via fal.ai',            'video', 'fal', 'fal-ai/veo3.1',                          true, true, false,  8, '4K',    true),
    ('sora2',     'Sora 2 Pro',        'OpenAI Sora 2 Pro video generation via fal.ai',                              'video', 'fal', 'fal-ai/sora-2/text-to-video/pro',        true, true, false, 25, '1080p', true),
    ('seedance1', 'Seedance 1.0 Pro',  'ByteDance Seedance v1 Pro video generation via fal.ai',                      'video', 'fal', 'fal-ai/bytedance/seedance/v1/pro',       true, true, false, 12, '1080p', true)
ON CONFLICT (slug) DO UPDATE
    SET display_name       = EXCLUDED.display_name,
        description        = EXCLUDED.description,
        media_type         = EXCLUDED.media_type,
        provider_slug      = EXCLUDED.provider_slug,
        provider_model_id  = EXCLUDED.provider_model_id,
        supports_text_to_video  = EXCLUDED.supports_text_to_video,
        supports_image_to_video = EXCLUDED.supports_image_to_video,
        supports_text_to_image  = EXCLUDED.supports_text_to_image,
        max_duration_seconds    = EXCLUDED.max_duration_seconds,
        max_resolution     = EXCLUDED.max_resolution,
        is_active          = EXCLUDED.is_active;

-- Image models
INSERT INTO public.models (slug, display_name, description, media_type, provider_slug, provider_model_id, supports_text_to_video, supports_image_to_video, supports_text_to_image, max_duration_seconds, max_resolution, is_active)
VALUES
    ('flux2-pro',   'Flux 2 Pro',    'Black Forest Labs professional image generation via fal.ai',     'image', 'fal', 'fal-ai/flux-2-pro',        false, false, true, NULL, '2K', true),
    ('flux2-flex',  'Flux 2 Flex',   'Black Forest Labs flexible image generation via fal.ai',         'image', 'fal', 'fal-ai/flux-2-flex',       false, false, true, NULL, '2K', true),
    ('grok-image',  'Grok Imagine',  'xAI Grok image generation via fal.ai',                          'image', 'fal', 'xai/grok-imagine-image',   false, false, true, NULL, '1K', true)
ON CONFLICT (slug) DO UPDATE
    SET display_name       = EXCLUDED.display_name,
        description        = EXCLUDED.description,
        media_type         = EXCLUDED.media_type,
        provider_slug      = EXCLUDED.provider_slug,
        provider_model_id  = EXCLUDED.provider_model_id,
        supports_text_to_video  = EXCLUDED.supports_text_to_video,
        supports_image_to_video = EXCLUDED.supports_image_to_video,
        supports_text_to_image  = EXCLUDED.supports_text_to_image,
        max_duration_seconds    = EXCLUDED.max_duration_seconds,
        max_resolution     = EXCLUDED.max_resolution,
        is_active          = EXCLUDED.is_active;

-- =============================================================================
-- (e) Insert model_pricing (40% margin: credit_cost = CEIL(provider_cost_usd / 0.60 * 100))
-- =============================================================================

-- Kling 3.0 Pro video
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('kling3', 'text_to_video',  5,  NULL, 1.120000, 187),
    ('kling3', 'text_to_video',  10, NULL, 2.240000, 374),
    ('kling3', 'image_to_video', 5,  NULL, 1.120000, 187),
    ('kling3', 'image_to_video', 10, NULL, 2.240000, 374)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Veo 3.1 video
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('veo3', 'text_to_video',  4, '720p',  0.800000, 134),
    ('veo3', 'text_to_video',  6, '720p',  1.200000, 200),
    ('veo3', 'text_to_video',  8, '720p',  1.600000, 267),
    ('veo3', 'text_to_video',  4, '1080p', 0.800000, 134),
    ('veo3', 'text_to_video',  6, '1080p', 1.200000, 200),
    ('veo3', 'text_to_video',  8, '1080p', 1.600000, 267),
    ('veo3', 'image_to_video', 4, '720p',  0.800000, 134),
    ('veo3', 'image_to_video', 8, '720p',  1.600000, 267)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Sora 2 Pro video
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('sora2', 'text_to_video',  4,  '720p',  1.200000, 200),
    ('sora2', 'text_to_video',  8,  '720p',  2.400000, 400),
    ('sora2', 'text_to_video',  12, '720p',  3.600000, 600),
    ('sora2', 'text_to_video',  4,  '1080p', 2.000000, 334),
    ('sora2', 'text_to_video',  8,  '1080p', 4.000000, 667),
    ('sora2', 'text_to_video',  12, '1080p', 6.000000, 1000),
    ('sora2', 'image_to_video', 4,  '720p',  1.200000, 200),
    ('sora2', 'image_to_video', 8,  '720p',  2.400000, 400)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Seedance 1.0 Pro video
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('seedance1', 'text_to_video',  5,  '1080p', 0.620000, 104),
    ('seedance1', 'text_to_video',  10, '1080p', 1.240000, 207),
    ('seedance1', 'image_to_video', 5,  '1080p', 0.620000, 104)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Flux 2 Pro image
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('flux2-pro', 'text_to_image', NULL, '1K', 0.030000, 5),
    ('flux2-pro', 'text_to_image', NULL, '2K', 0.045000, 8)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Flux 2 Flex image
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('flux2-flex', 'text_to_image', NULL, '1K', 0.050000, 9),
    ('flux2-flex', 'text_to_image', NULL, '2K', 0.100000, 17)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

-- Grok Imagine image
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, provider_cost_usd, credit_cost)
VALUES
    ('grok-image', 'text_to_image', NULL, '1K', 0.040000, 7)
ON CONFLICT ON CONSTRAINT uq_model_pricing_combo DO UPDATE
    SET provider_cost_usd = EXCLUDED.provider_cost_usd,
        credit_cost       = EXCLUDED.credit_cost;

COMMIT;
