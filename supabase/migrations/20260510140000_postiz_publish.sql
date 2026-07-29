-- Postiz auto-publish — store the user's API key + which connected
-- accounts to publish to by default + an audit log of every fanout.
--
-- The webhook-provider edge function fires on every job.completed,
-- and (if a user has postiz_api_key + postiz_default_integrations
-- configured) hands the video URL off to a postiz-publisher edge
-- function that does the Postiz upload-from-url + create-post calls.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS postiz_api_key text,
  ADD COLUMN IF NOT EXISTS postiz_default_integrations text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.postiz_api_key IS
  'User''s Postiz API key (Authorization: <key>). Stored as plain text for now; rotate-on-leak via /settings. NULL disables auto-publish.';
COMMENT ON COLUMN public.profiles.postiz_default_integrations IS
  'Array of Postiz integration UUIDs (from GET /public/v1/integrations) to publish completed videos to. Empty array disables auto-publish even when api_key is set.';

-- ── postiz_publications — audit row per (job, integration) fanout ───────────

CREATE TABLE IF NOT EXISTS public.postiz_publications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  integration_id  text NOT NULL,           -- Postiz integration UUID
  postiz_post_id  text,                    -- returned from POST /posts on success
  postiz_upload_id text,                   -- returned from POST /upload-from-url
  postiz_upload_path text,                 -- the path returned by Postiz to use as image[].path
  status          text NOT NULL CHECK (status IN ('pending', 'uploaded', 'published', 'failed')),
  error_message   text,
  http_status     int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  uploaded_at     timestamptz,
  published_at    timestamptz
);

COMMENT ON TABLE public.postiz_publications IS
  'Audit log of every Postiz fanout. One row per (job_id, integration_id) — multiple integrations per job means multiple rows.';

CREATE INDEX IF NOT EXISTS idx_postiz_publications_user_id
  ON public.postiz_publications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_postiz_publications_job_id
  ON public.postiz_publications (job_id);

ALTER TABLE public.postiz_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS postiz_publications_select_own ON public.postiz_publications;
CREATE POLICY postiz_publications_select_own
  ON public.postiz_publications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Edge function (service role) handles all writes.
DROP POLICY IF EXISTS postiz_publications_no_user_write ON public.postiz_publications;
CREATE POLICY postiz_publications_no_user_write
  ON public.postiz_publications
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
