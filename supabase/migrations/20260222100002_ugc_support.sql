-- Migration: Add ugc-basic model and pricing for UGC video production pipeline
-- Adds support for script-to-video UGC generation (TTS + B-roll + subtitles).

-- ── 1. Update media_type constraint to allow 'ugc' ──────────────────────────

ALTER TABLE models DROP CONSTRAINT IF EXISTS models_media_type_check;
ALTER TABLE models ADD CONSTRAINT models_media_type_check
  CHECK (media_type IN ('video', 'image', 'subtitle', 'ugc'));

-- ── 1b. Update model_pricing operation constraint to allow 'ugc_video' ──────

ALTER TABLE model_pricing DROP CONSTRAINT IF EXISTS model_pricing_operation_check;
ALTER TABLE model_pricing ADD CONSTRAINT model_pricing_operation_check
  CHECK (operation IN ('text_to_video', 'image_to_video', 'text_to_image', 'subtitle', 'ugc_video'));

-- ── 2. Insert ugc-basic model ───────────────────────────────────────────────

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
  'ugc-basic',
  'UGC Video',
  'Script-to-video UGC production pipeline. Splits script into scenes, generates TTS voiceover, creates B-roll clips via AI, and assembles a final 9:16 MP4 with burned subtitles.',
  'ugc',
  'railway',
  'media-worker/ugc',
  false,
  false,
  false,
  120,          -- 2 min max
  NULL,
  true,
  NULL,         -- Duration is estimated from script length
  NULL,
  'starter'     -- Requires at least Starter plan
) ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- ── 3. Insert tiered pricing (credits by estimated duration) ────────────────

INSERT INTO model_pricing (
  model_slug,
  operation,
  duration_seconds,
  resolution,
  credit_cost,
  provider_cost_usd
) VALUES
  ('ugc-basic', 'ugc_video', 15,  NULL, 150, 0.15),
  ('ugc-basic', 'ugc_video', 30,  NULL, 250, 0.25),
  ('ugc-basic', 'ugc_video', 60,  NULL, 400, 0.40),
  ('ugc-basic', 'ugc_video', 120, NULL, 700, 0.70)
ON CONFLICT DO NOTHING;
