-- v2 · Extend user_characters with the v2 product surface.
--
-- The new Selfie pipeline (services/media-worker-v2/src/v2/selfie-pipeline.js)
-- and the upcoming Product-in-hands pipeline both reference a saved
-- character by a public-safe `char_xxxxxxxxxx` id and need:
--   • a pinned Seedance seed (deterministic-ish identity across jobs)
--   • a portrait reference image (close-up; Stage A output)
--   • a multi-pose character sheet (Stage B output; THE consistency lever)
--   • a one-line voice direction blurb (the new "voice consistency" knob)
--   • an optional preferred shot-grammar preset
--
-- This migration is purely ADDITIVE. Every existing column on
-- user_characters keeps its meaning. The old wizard flow that populates
-- `character_sheet_url` via the legacy worker still works. The new
-- pipeline writes into the new columns; the legacy one ignores them.

-- ── 1. New columns ────────────────────────────────────────────────────
ALTER TABLE public.user_characters
  ADD COLUMN IF NOT EXISTS public_id      text,                         -- "char_xxxxxxxxxx" external handle
  ADD COLUMN IF NOT EXISTS portrait_url   text,                         -- gpt-image-2 portrait (Stage A)
  ADD COLUMN IF NOT EXISTS seedance_seed  bigint,                       -- pinned at create time
  ADD COLUMN IF NOT EXISTS voice_brief    text,                         -- one-line voice direction
  ADD COLUMN IF NOT EXISTS preset_default text;                         -- one of the 20 shot-grammar slugs

-- ── 2. Indexes ────────────────────────────────────────────────────────
-- Public-id lookup must be unique per user (so two users can both pick
-- a vanity slug if we ever expose that; for now nanoids never collide
-- so the constraint mostly serves as an invariant). NULL public_ids
-- (legacy rows) are excluded from uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_characters_public_id
  ON public.user_characters (public_id)
  WHERE public_id IS NOT NULL;

-- ── 3. Comments ───────────────────────────────────────────────────────
COMMENT ON COLUMN public.user_characters.public_id IS
  'Public-safe external handle ("char_xxxxxxxxxx") used by v2 routes / CLI / MCP. Internal PK stays uuid.';
COMMENT ON COLUMN public.user_characters.portrait_url IS
  'gpt-image-2 portrait (v2 Stage A). The hero face reference.';
COMMENT ON COLUMN public.user_characters.seedance_seed IS
  'Pinned random integer used as Seedance 2.0 seed for every job referencing this character.';
COMMENT ON COLUMN public.user_characters.voice_brief IS
  'One-line natural-language voice direction injected into every Seedance prompt for this character.';
COMMENT ON COLUMN public.user_characters.preset_default IS
  'Preferred shot-grammar preset slug (used as a default; callers can override per-job).';
