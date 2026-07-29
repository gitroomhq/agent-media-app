-- Seed data for agent-media
-- All models routed through the unified provider.
-- Pricing: credit_cost = CEIL(provider_cost_usd / 0.60 * 100) for 40% margin.
-- 1 credit = $0.01

-- =============================================================================
-- Models
-- =============================================================================
INSERT INTO public.models (slug, display_name, description, media_type, provider_slug, provider_model_id, supports_text_to_video, supports_image_to_video, supports_text_to_image, max_duration_seconds, max_resolution, is_active)
VALUES
    ('kling3',    'Kling 3.0 Pro',     'High-fidelity video generation',                         'video', 'fal', 'fal-ai/kling-video/v3/pro',              true, true, false, 10, '1080p', true),
    ('veo3',      'Veo 3.1',           'Video generation with natural motion',            'video', 'fal', 'fal-ai/veo3.1',                          true, true, false,  8, '4K',    true),
    ('sora2',     'Sora 2 Pro',        'Professional video generation',                              'video', 'fal', 'fal-ai/sora-2/text-to-video/pro',        true, true, false, 25, '1080p', true),
    ('seedance1', 'Seedance 1.0 Pro',  'Professional video generation',                      'video', 'fal', 'fal-ai/bytedance/seedance/v1/pro',       true, true, false, 12, '1080p', true),
    ('flux2-pro',  'Flux 2 Pro',       'Professional image generation',                 'image', 'fal', 'fal-ai/flux-2-pro',                      false, false, true, NULL, '2K', true),
    ('flux2-flex', 'Flux 2 Flex',      'Flexible image generation',                     'image', 'fal', 'fal-ai/flux-2-flex',                     false, false, true, NULL, '2K', true),
    ('grok-image', 'Grok Imagine',     'AI image generation',                                      'image', 'fal', 'xai/grok-imagine-image',                 false, false, true, NULL, '1K', true);

-- =============================================================================
-- Model Pricing
-- =============================================================================

-- Kling 3.0 Pro
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('kling3', 'text_to_video',  5,  NULL, 187, 1.120000),
    ('kling3', 'text_to_video',  10, NULL, 374, 2.240000),
    ('kling3', 'image_to_video', 5,  NULL, 187, 1.120000),
    ('kling3', 'image_to_video', 10, NULL, 374, 2.240000);

-- Veo 3.1
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('veo3', 'text_to_video',  4, '720p',  134, 0.800000),
    ('veo3', 'text_to_video',  6, '720p',  200, 1.200000),
    ('veo3', 'text_to_video',  8, '720p',  267, 1.600000),
    ('veo3', 'text_to_video',  4, '1080p', 134, 0.800000),
    ('veo3', 'text_to_video',  6, '1080p', 200, 1.200000),
    ('veo3', 'text_to_video',  8, '1080p', 267, 1.600000),
    ('veo3', 'image_to_video', 4, '720p',  134, 0.800000),
    ('veo3', 'image_to_video', 8, '720p',  267, 1.600000);

-- Sora 2 Pro
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('sora2', 'text_to_video',  4,  '720p',  200, 1.200000),
    ('sora2', 'text_to_video',  8,  '720p',  400, 2.400000),
    ('sora2', 'text_to_video',  12, '720p',  600, 3.600000),
    ('sora2', 'text_to_video',  4,  '1080p', 334, 2.000000),
    ('sora2', 'text_to_video',  8,  '1080p', 667, 4.000000),
    ('sora2', 'text_to_video',  12, '1080p', 1000, 6.000000),
    ('sora2', 'image_to_video', 4,  '720p',  200, 1.200000),
    ('sora2', 'image_to_video', 8,  '720p',  400, 2.400000);

-- Seedance 1.0 Pro
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('seedance1', 'text_to_video',  5,  '1080p', 104, 0.620000),
    ('seedance1', 'text_to_video',  10, '1080p', 207, 1.240000),
    ('seedance1', 'image_to_video', 5,  '1080p', 104, 0.620000);

-- Flux 2 Pro
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('flux2-pro', 'text_to_image', NULL, '1K', 5, 0.030000),
    ('flux2-pro', 'text_to_image', NULL, '2K', 8, 0.045000);

-- Flux 2 Flex
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('flux2-flex', 'text_to_image', NULL, '1K', 9, 0.050000),
    ('flux2-flex', 'text_to_image', NULL, '2K', 17, 0.100000);

-- Grok Imagine
INSERT INTO public.model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
VALUES
    ('grok-image', 'text_to_image', NULL, '1K', 7, 0.040000);
