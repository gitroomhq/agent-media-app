-- Migration: Add preset column to actors table
-- Allows filtering actors/templates by use case (e.g., 'show_your_app', 'ugc', 'product_review')

-- Add preset column (nullable — existing actors have no preset, they're general UGC actors)
ALTER TABLE actors ADD COLUMN IF NOT EXISTS preset text;

-- Add presets array for actors that support multiple presets
-- e.g., an actor could be used for both 'ugc' and 'show_your_app'
ALTER TABLE actors ADD COLUMN IF NOT EXISTS presets text[] DEFAULT '{}';

-- Add green_screen_url for "Show Your App" templates
-- This is the MJ-generated image with green screen phone (before game composite)
ALTER TABLE actors ADD COLUMN IF NOT EXISTS green_screen_url text;

-- Index for fast preset filtering
CREATE INDEX IF NOT EXISTS idx_actors_preset ON actors (preset) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_actors_presets ON actors USING GIN (presets) WHERE status = 'active';

-- Comment
COMMENT ON COLUMN actors.preset IS 'Primary preset/template type: show_your_app, ugc, product_review, etc.';
COMMENT ON COLUMN actors.presets IS 'Array of supported presets for this actor';
COMMENT ON COLUMN actors.green_screen_url IS 'MJ-generated green screen phone image URL (for show_your_app preset)';
