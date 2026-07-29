-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Add `character_sheet_url` to actors so per-run character_video
-- pipelines can cache the multi-angle character sheet (gpt-image-2,
-- generated from the actor's portrait) and reuse it across all
-- scheduled runs for the same actor. Without this we kept passing
-- the single portrait_url as Seedance's likeness reference, which
-- works but doesn't show the model multiple angles / expressions.
--
-- NULL = sheet not yet generated; worker generates + caches on first
-- scheduled run that needs it.

ALTER TABLE public.actors
  ADD COLUMN IF NOT EXISTS character_sheet_url text;

COMMENT ON COLUMN public.actors.character_sheet_url IS
  'Cached multi-angle character sheet (gpt-image-2) generated from portrait_url. Used as Seedance reference for scheduled character_video runs. NULL until first run paints it.';
