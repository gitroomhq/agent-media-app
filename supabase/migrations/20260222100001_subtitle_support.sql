-- Migration: Add subtitle-hormozi model and pricing
-- Adds support for Hormozi-style animated subtitles as a post-processing feature.

-- ── 1. Update media_type constraint to allow 'subtitle' ─────────────────────
-- The models table has a CHECK constraint on media_type. We need to allow
-- the new 'subtitle' value alongside 'video' and 'image'.

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_media_type_check;
ALTER TABLE models ADD CONSTRAINT models_media_type_check
  CHECK (media_type IN ('video', 'image', 'subtitle'));

-- ── 1b. Update model_pricing operation constraint to allow 'subtitle' ───────

ALTER TABLE model_pricing DROP CONSTRAINT IF EXISTS model_pricing_operation_check;
ALTER TABLE model_pricing ADD CONSTRAINT model_pricing_operation_check
  CHECK (operation IN ('text_to_video', 'image_to_video', 'text_to_image', 'subtitle'));

-- ── 2. Insert subtitle-hormozi model ────────────────────────────────────────

INSERT INTO models (
  slug,
  display_name,
  description,
  media_type,
  provider_slug,
  provider_model_id,
  supports_text_to_video,
  supports_image_to_video,
  supports_text_to_image,
  max_duration_seconds,
  max_resolution,
  is_active,
  default_duration,
  allowed_durations,
  min_plan_tier
) VALUES (
  'subtitle-hormozi',
  'Hormozi Subtitles',
  'Add bold, word-by-word animated subtitles in the style popularized by Alex Hormozi. Uses OpenAI Whisper for transcription and FFmpeg for rendering.',
  'subtitle',
  'railway',
  'subtitle-worker/subtitle',
  false,
  false,
  false,
  300,          -- 5 min max video length
  NULL,
  true,
  NULL,         -- No default duration (determined by input video)
  NULL,
  'free'        -- Available on all tiers
) ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- ── 3. Insert flat-rate pricing (50 credits, all tiers) ─────────────────────

INSERT INTO model_pricing (
  model_slug,
  operation,
  duration_seconds,
  resolution,
  credit_cost,
  provider_cost_usd
) VALUES (
  'subtitle-hormozi',
  'subtitle',
  NULL,           -- Flat rate regardless of duration
  NULL,           -- Flat rate regardless of resolution
  50,             -- 50 credits per subtitle job
  0.03            -- ~$0.01 Whisper + ~$0.02 Railway compute
) ON CONFLICT DO NOTHING;
