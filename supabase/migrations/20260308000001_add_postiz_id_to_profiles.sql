-- Add postiz_id column to profiles for Postiz SSO user linking.
-- Nullable: only set for users who signed in via Postiz OAuth.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS postiz_id text UNIQUE;

-- Index for fast lookup by postiz_id
CREATE INDEX IF NOT EXISTS idx_profiles_postiz_id
  ON public.profiles (postiz_id) WHERE postiz_id IS NOT NULL;
