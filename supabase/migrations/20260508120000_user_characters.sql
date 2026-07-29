-- Content Machine: durable Character entity
--
-- Today the wizard's sheet → storyboard → video chain is held together
-- by a client-minted `session_id` jsonb path. There is no concept of a
-- *character* — the reusable face/identity the user actually thinks in
-- ("my Marco-as-fitness-coach"). Every reuse pastes an R2 URL forward
-- with no provenance and no count of "how many videos did I make from
-- this character".
--
-- This migration adds:
--   1) public.user_characters — one row per reusable identity, owned by
--      the user. Provenance kept (actor / upload / description) but
--      independent of the catalog (`actors` is a template, not a
--      parent). Same character can be picked twice from the same actor
--      and become two characters.
--   2) generation_jobs.character_id FK — the audit trail now points up
--      to the character. Sessions still group video renders; characters
--      group sessions.
--   3) UNIQUE (sheet_job_id) — at-least-once safety. The worker inserts
--      this row when a sheet completes, and pgmq retries can fire the
--      runner twice; the unique index makes the second insert no-op.
--   4) Backfill — ~7 already-completed sheets with session_id become
--      characters retroactively; their sibling storyboard/video rows
--      get character_id stamped.

CREATE TABLE IF NOT EXISTS public.user_characters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  name                text NOT NULL,
  source_kind         text NOT NULL CHECK (source_kind IN ('actor','upload','description')),
  actor_slug          text REFERENCES public.actors(slug) ON DELETE SET NULL,
  source_image_url    text,
  description         text,
  character_sheet_url text NOT NULL,
  sheet_job_id        uuid REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  thumbnail_url       text,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Library lookups: list a user's active characters newest-first.
CREATE INDEX IF NOT EXISTS idx_user_characters_user_active
  ON public.user_characters (user_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Idempotency: at-least-once worker delivery cannot create two
-- character rows for the same sheet job.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_characters_sheet_job
  ON public.user_characters (sheet_job_id)
  WHERE sheet_job_id IS NOT NULL;

-- Provenance lookup: "show me every character a user made from actor X".
CREATE INDEX IF NOT EXISTS idx_user_characters_actor
  ON public.user_characters (user_id, actor_slug)
  WHERE actor_slug IS NOT NULL AND archived_at IS NULL;

ALTER TABLE public.user_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_characters_owner_select ON public.user_characters
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_characters_owner_insert ON public.user_characters
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_characters_owner_update ON public.user_characters
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_characters_owner_delete ON public.user_characters
  FOR DELETE USING (auth.uid() = user_id);

-- Service-role policies for the worker / api-v2 (they don't run as
-- auth.uid() so RLS would block them otherwise).
CREATE POLICY user_characters_service_all ON public.user_characters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add the FK on generation_jobs.
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS character_id uuid
    REFERENCES public.user_characters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_character
  ON public.generation_jobs (character_id, created_at DESC)
  WHERE character_id IS NOT NULL;

-- ── Backfill ────────────────────────────────────────────────────
-- Each completed character_sheet job that has a session_id becomes a
-- character. The user's first sheet for that session "wins" — older
-- legacy rows without session_id stay un-characterised (they remain
-- in generation_jobs for credit/audit, but never appear in the
-- library).
INSERT INTO public.user_characters (
  user_id, name, source_kind, actor_slug,
  source_image_url, description, character_sheet_url, sheet_job_id, created_at
)
SELECT
  j.user_id,
  COALESCE(NULLIF(j.input_params->>'description', ''),
           j.input_params->>'actor_slug',
           'Untitled') AS name,
  CASE
    WHEN j.input_params ? 'actor_slug'           THEN 'actor'
    WHEN j.input_params ? 'reference_image_url'  THEN 'upload'
    ELSE 'description'
  END AS source_kind,
  j.input_params->>'actor_slug' AS actor_slug,
  COALESCE(j.input_params->>'reference_image_url', j.output_media_url) AS source_image_url,
  j.input_params->>'description' AS description,
  j.output_media_url AS character_sheet_url,
  j.id AS sheet_job_id,
  j.created_at
FROM public.generation_jobs j
WHERE j.operation = 'character_sheet'
  AND j.status = 'completed'
  AND j.output_media_url IS NOT NULL
  AND j.input_params ? 'session_id'
  AND j.deleted_at IS NULL
ON CONFLICT (sheet_job_id) WHERE sheet_job_id IS NOT NULL DO NOTHING;

-- Stamp character_id onto every job that shares a session_id with a
-- backfilled character — sheet, storyboard, video all get linked.
UPDATE public.generation_jobs j
SET character_id = uc.id
FROM public.user_characters uc
JOIN public.generation_jobs sheet_job ON sheet_job.id = uc.sheet_job_id
WHERE j.user_id = uc.user_id
  AND j.character_id IS NULL
  AND j.input_params ? 'session_id'
  AND j.input_params->>'session_id' = sheet_job.input_params->>'session_id'
  AND j.operation IN ('character_sheet','character_storyboard','character_video');

COMMENT ON TABLE public.user_characters IS
  'Reusable character identity owned by a user. Created when a sheet job completes; one parent for many wizard sessions.';
COMMENT ON COLUMN public.generation_jobs.character_id IS
  'FK to user_characters — links a sheet/storyboard/video job to the character it belongs to.';
