-- Migration: Add progress_detail column for granular UGC job progress tracking.
-- Stores checkpoint data: { stage, progress_pct, current_step, total_steps, elapsed_ms, message }
-- Stages: scene_split, tts_generating, clips_generating, assembling, subtitling, uploading

-- ── 1. Add progress_detail jsonb column ─────────────────────────────────────

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS progress_detail jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN generation_jobs.progress_detail IS
  'Granular UGC pipeline progress. Keys: stage, progress_pct, current_step, total_steps, elapsed_ms, message';

-- ── 2. Index for querying active jobs by progress stage ─────────────────────

CREATE INDEX IF NOT EXISTS idx_generation_jobs_progress_stage
  ON generation_jobs ((progress_detail->>'stage'))
  WHERE status = 'processing';
