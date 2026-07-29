-- Migration: actor_variants table
-- Stores generated actor variant images (different positions, outfits, backgrounds)
-- for use as input references in video generation (Kling i2v, etc.)

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS actor_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,

  -- ── Classification ─────────────────────────────────────────────────────────
  -- Body position in frame (determines PIP placement compatibility)
  position        text NOT NULL DEFAULT 'centered'
    CHECK (position IN ('centered', 'left', 'right', 'lower')),

  -- Camera framing distance
  framing         text NOT NULL DEFAULT 'medium'
    CHECK (framing IN ('close-up', 'medium', 'wide')),

  -- Outfit description (e.g. "blue dashiki with white headwrap")
  outfit          text NOT NULL,

  -- Background/setting description (e.g. "rustic herb kitchen with jars")
  background      text NOT NULL,

  -- Expression/mood
  expression      text NOT NULL DEFAULT 'neutral'
    CHECK (expression IN ('neutral', 'serious', 'smiling', 'concerned')),

  -- ── Media ──────────────────────────────────────────────────────────────────
  -- Public URL of the variant image on R2
  image_url       text NOT NULL,

  -- R2 storage key (for deletion/management)
  r2_key          text,

  -- Image dimensions
  width           integer,
  height          integer,

  -- ── Generation Metadata ────────────────────────────────────────────────────
  -- Source of the image (midjourney, flux, kolors, inpainting, etc.)
  source          text NOT NULL DEFAULT 'midjourney'
    CHECK (source IN ('midjourney', 'flux', 'kolors', 'inpainting', 'manual')),

  -- Original generation prompt (for reproducibility)
  generation_prompt text,

  -- Midjourney job ID or other source reference
  source_ref      text,

  -- ── Tags & Search ──────────────────────────────────────────────────────────
  -- Free-form tags for flexible filtering (e.g. ["headwrap", "outdoor", "golden-hour"])
  tags            text[] DEFAULT '{}',

  -- Human-readable label (e.g. "Emma - Blue Dashiki - Kitchen - Left")
  label           text,

  -- ── Status ─────────────────────────────────────────────────────────────────
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'inactive')),

  -- ── Timestamps ─────────────────────────────────────────────────────────────
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: all active variants for an actor
CREATE INDEX idx_actor_variants_actor_id ON actor_variants (actor_id) WHERE status = 'active';

-- Filter by position (for PIP layout selection)
CREATE INDEX idx_actor_variants_position ON actor_variants (position) WHERE status = 'active';

-- Filter by framing
CREATE INDEX idx_actor_variants_framing ON actor_variants (framing) WHERE status = 'active';

-- Composite: find specific variant type for an actor
CREATE INDEX idx_actor_variants_actor_position ON actor_variants (actor_id, position, framing) WHERE status = 'active';

-- Tags search (GIN for array containment)
CREATE INDEX idx_actor_variants_tags ON actor_variants USING GIN (tags) WHERE status = 'active';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE actor_variants ENABLE ROW LEVEL SECURITY;

-- Public can read active variants (needed for gallery/selection UI)
CREATE POLICY "actor_variants_public_read" ON actor_variants
  FOR SELECT USING (status = 'active');

-- Service role can do everything (upload, manage)
CREATE POLICY "actor_variants_service_role_all" ON actor_variants
  FOR ALL USING (auth.role() = 'service_role');

-- ── Updated-at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_actor_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actor_variants_updated_at
  BEFORE UPDATE ON actor_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_actor_variants_updated_at();
