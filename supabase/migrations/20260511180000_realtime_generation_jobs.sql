-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Add generation_jobs to the supabase_realtime publication so the
-- /jobs page receives UPDATE events when scheduled runs progress
-- (submitted → processing → completed / failed). Without this,
-- supabase.channel('jobs-page') subscribes but never receives
-- payloads, so the dashboard appears stuck until manual refresh.

ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
