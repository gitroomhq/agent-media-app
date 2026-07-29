-- Migration: Soft-delete helper stored procedures for generation_jobs.
-- The deleted_at column and idx_jobs_not_deleted index already exist
-- from migration 007_generation_jobs.

-- Soft delete a job (returns jsonb result)
CREATE OR REPLACE FUNCTION soft_delete_job(p_job_id uuid, p_user_id uuid)
RETURNS jsonb AS $$
DECLARE v_job record;
BEGIN
  UPDATE generation_jobs
  SET deleted_at = now(), updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id AND deleted_at IS NULL
  RETURNING id, model_slug, status INTO v_job;
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found_or_deleted');
  END IF;
  RETURN jsonb_build_object('success', true, 'jobId', v_job.id, 'modelSlug', v_job.model_slug);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restore a soft-deleted job
CREATE OR REPLACE FUNCTION restore_deleted_job(p_job_id uuid, p_user_id uuid)
RETURNS jsonb AS $$
DECLARE v_job record;
BEGIN
  UPDATE generation_jobs
  SET deleted_at = NULL, updated_at = now()
  WHERE id = p_job_id AND user_id = p_user_id AND deleted_at IS NOT NULL
  RETURNING id, model_slug, status INTO v_job;
  IF v_job IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found_or_not_deleted');
  END IF;
  RETURN jsonb_build_object('success', true, 'jobId', v_job.id, 'restored', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
