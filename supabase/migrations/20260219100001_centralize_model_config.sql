-- Centralize model configuration in the models table.
-- Moves hardcoded defaults from edge function code into the database.

-- default_duration: the duration to use when the user doesn't specify one
ALTER TABLE models ADD COLUMN IF NOT EXISTS default_duration integer;

-- allowed_durations: JSON array of valid durations for this model (null = any)
ALTER TABLE models ADD COLUMN IF NOT EXISTS allowed_durations jsonb;

-- min_plan_tier: minimum plan tier required to use this model
-- Tiers ordered: free < newby < payg < starter < creator < pro_plus
ALTER TABLE models ADD COLUMN IF NOT EXISTS min_plan_tier text NOT NULL DEFAULT 'free';

-- Populate for active video models
UPDATE models SET default_duration = 4,  allowed_durations = '[4, 8, 12]'::jsonb, min_plan_tier = 'payg'    WHERE slug = 'sora2';
UPDATE models SET default_duration = 5,  allowed_durations = '[5, 10]'::jsonb,    min_plan_tier = 'payg'    WHERE slug = 'kling3';
UPDATE models SET default_duration = 4,  allowed_durations = NULL,                min_plan_tier = 'creator' WHERE slug = 'veo3';
UPDATE models SET default_duration = 5,  allowed_durations = NULL,                min_plan_tier = 'payg'    WHERE slug = 'seedance1';

-- Image models: no duration, available from free tier or payg
UPDATE models SET min_plan_tier = 'free' WHERE slug = 'flux2-flex';
UPDATE models SET min_plan_tier = 'payg' WHERE slug = 'flux2-pro';
UPDATE models SET min_plan_tier = 'free' WHERE slug = 'grok-image';

COMMENT ON COLUMN models.default_duration IS 'Default duration in seconds when user does not specify --duration';
COMMENT ON COLUMN models.allowed_durations IS 'JSON array of valid duration values, or null for any value up to max_duration_seconds';
COMMENT ON COLUMN models.min_plan_tier IS 'Minimum plan tier required: free, newby, payg, starter, creator, pro_plus';
