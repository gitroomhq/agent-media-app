-- Migration: Add persona tables for UGC voice + face consistency
-- Creates user_personas and persona_assets tables, storage bucket, and RLS policies.

-- ── 1. Create user_personas table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_personas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  voice_provider text NOT NULL DEFAULT 'elevenlabs'
    CHECK (voice_provider IN ('elevenlabs', 'openai')),
  voice_id      text,                -- ElevenLabs persistent voice_id or OpenAI preset name
  voice_clone_status text NOT NULL DEFAULT 'pending'
    CHECK (voice_clone_status IN ('pending', 'processing', 'ready', 'failed')),
  face_photo_url text,               -- Supabase Storage path to face photo
  subtitle_style text NOT NULL DEFAULT 'hormozi',
  pacing        text NOT NULL DEFAULT 'normal',
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Each user's persona slugs must be unique
  CONSTRAINT user_personas_user_slug_unique UNIQUE (user_id, slug)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_personas_user_id ON user_personas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_personas_user_default ON user_personas(user_id, is_default)
  WHERE is_default = true;

-- ── 2. Create persona_assets table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS persona_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id    uuid NOT NULL REFERENCES user_personas(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type    text NOT NULL
    CHECK (asset_type IN ('voice_sample', 'face_photo')),
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  file_size_bytes integer,
  duration_ms   integer,             -- For voice samples only
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_assets_persona_id ON persona_assets(persona_id);

-- ── 3. RLS policies ────────────────────────────────────────────────────────

ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_assets ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own personas
CREATE POLICY "Users manage own personas"
  ON user_personas FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only see/manage their own persona assets
CREATE POLICY "Users manage own persona assets"
  ON persona_assets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can access everything (for edge functions)
CREATE POLICY "Service role full access personas"
  ON user_personas FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access persona assets"
  ON persona_assets FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. Create persona-assets storage bucket ────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('persona-assets', 'persona-assets', false, 52428800)  -- 50 MB
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can upload to their own folder
CREATE POLICY "Users upload own persona assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'persona-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: users can read their own assets
CREATE POLICY "Users read own persona assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'persona-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage RLS: users can delete their own assets
CREATE POLICY "Users delete own persona assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'persona-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 5. Trigger to ensure only one default persona per user ─────────────────

CREATE OR REPLACE FUNCTION ensure_single_default_persona()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_personas
    SET is_default = false, updated_at = now()
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_persona
  BEFORE INSERT OR UPDATE ON user_personas
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_persona();

-- ── 6. Auto-update updated_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_persona_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_persona_updated_at
  BEFORE UPDATE ON user_personas
  FOR EACH ROW
  EXECUTE FUNCTION update_persona_updated_at();
