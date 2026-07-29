-- Fix pricing gaps: missing image_to_video rows and allowed_durations config
-- Resolves pricing_not_found errors when using --input flag with certain models/durations

-- 1. Set allowed_durations for seedance1 (only supports 5s and 10s)
UPDATE models
SET allowed_durations = '[5, 10]'::jsonb
WHERE slug = 'seedance1' AND allowed_durations IS NULL;

-- 2. Set allowed_durations for veo3 (supports 4s, 6s, 8s)
UPDATE models
SET allowed_durations = '[4, 6, 8]'::jsonb
WHERE slug = 'veo3' AND allowed_durations IS NULL;

-- 3. Add missing seedance1 image_to_video pricing at 10s (mirrors text_to_video at 10s)
INSERT INTO model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
SELECT 'seedance1', 'image_to_video', 10, '1080p', 207, 1.24
WHERE NOT EXISTS (
  SELECT 1 FROM model_pricing
  WHERE model_slug = 'seedance1'
    AND operation = 'image_to_video'
    AND duration_seconds = 10
);

-- 4. Add missing veo3 image_to_video pricing at 6s/720p (mirrors text_to_video at 6s/720p)
INSERT INTO model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
SELECT 'veo3', 'image_to_video', 6, '720p', 200, 1.20
WHERE NOT EXISTS (
  SELECT 1 FROM model_pricing
  WHERE model_slug = 'veo3'
    AND operation = 'image_to_video'
    AND duration_seconds = 6
    AND resolution = '720p'
);

-- 5. Add missing sora2 image_to_video pricing at 1080p (matches 720p rows)
INSERT INTO model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
SELECT 'sora2', 'image_to_video', 4, '1080p', 334, 2.00
WHERE NOT EXISTS (
  SELECT 1 FROM model_pricing
  WHERE model_slug = 'sora2'
    AND operation = 'image_to_video'
    AND duration_seconds = 4
    AND resolution = '1080p'
);

INSERT INTO model_pricing (model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd)
SELECT 'sora2', 'image_to_video', 8, '1080p', 667, 4.00
WHERE NOT EXISTS (
  SELECT 1 FROM model_pricing
  WHERE model_slug = 'sora2'
    AND operation = 'image_to_video'
    AND duration_seconds = 8
    AND resolution = '1080p'
);
