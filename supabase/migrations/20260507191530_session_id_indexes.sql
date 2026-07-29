-- Indexes supporting the Content Machine wizard's session-resume flow.
--
-- Each wizard run mints a uuid (session_id) on first submit and stamps it
-- into input_params.session_id for all three jobs (sheet, storyboard,
-- final video). The dashboard reads ?session=<uuid> from the URL on
-- mount and queries generation_jobs for all three to rehydrate state —
-- so a refresh, tab close, or device switch never orphans an in-flight
-- (already-charged) generation.
--
-- 1) Partial btree on the extracted text — fast lookup of all jobs
--    belonging to a session.
-- 2) Partial unique on (user_id, session_id, operation) — server-side
--    idempotency: two tabs auto-advancing the same wizard cannot
--    double-submit and double-charge for the same step.

CREATE INDEX IF NOT EXISTS idx_generation_jobs_session_id
  ON public.generation_jobs ((input_params->>'session_id'))
  WHERE input_params ? 'session_id';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_generation_jobs_session_operation
  ON public.generation_jobs (user_id, (input_params->>'session_id'), operation)
  WHERE input_params ? 'session_id';

COMMENT ON INDEX public.idx_generation_jobs_session_id IS
  'Lookup all jobs in a Content Machine wizard session by its session_id (jsonb path).';
COMMENT ON INDEX public.uniq_generation_jobs_session_operation IS
  'Idempotency: prevent two tabs from inserting the same (user, session_id, operation) twice.';
