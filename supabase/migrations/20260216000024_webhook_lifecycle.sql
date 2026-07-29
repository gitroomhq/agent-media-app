-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration 024: webhook_lifecycle
-- Sprint 5: Webhook processing infrastructure -- storage bucket, idempotent
-- checkpoint updates, stuck-job recovery, and dead-letter retry scheduling.
--
-- Reference: architecture doc Section 9.1 (pg_cron), Sprint 5 plan.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Storage bucket for generation outputs
-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: Supabase storage.buckets may not exist in all environments (e.g.,
-- local dev without the storage extension). If this INSERT fails, create
-- the bucket manually via the Supabase Dashboard > Storage > New Bucket.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('generation-outputs', 'generation-outputs', false)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        RAISE NOTICE 'storage.buckets table not found -- create the "generation-outputs" bucket manually via Supabase Dashboard.';
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Add updated_at to dead_letter_webhooks (missing from migration 011)
-- ═══════════════════════════════════════════════════════════════════════════
-- The retry cron job needs updated_at to track when entries were last touched.

ALTER TABLE public.dead_letter_webhooks
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER dead_letter_webhooks_updated_at
    BEFORE UPDATE ON public.dead_letter_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Stored procedure: update_job_checkpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotent checkpoint advancement for generation jobs.
-- Checkpoints can only move forward; 'failed' can override any state.
-- Returns TRUE if the update was applied, FALSE if it was a no-op.

CREATE OR REPLACE FUNCTION public.update_job_checkpoint(
    p_job_id            uuid,
    p_checkpoint        text,
    p_status            text,
    p_output_media_url  text DEFAULT NULL,
    p_output_thumbnail_url text DEFAULT NULL,
    p_error_message     text DEFAULT NULL,
    p_error_code        text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_checkpoint    text;
    v_current_order         integer;
    v_target_order          integer;
    -- Checkpoint ordering: higher number = later in the lifecycle
    -- none=0, received=1, processing=2, media_received=3, completed=4, failed=5
BEGIN
    -- Validate inputs
    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_JOB: job_id cannot be null';
    END IF;

    IF p_checkpoint IS NULL THEN
        RAISE EXCEPTION 'INVALID_CHECKPOINT: checkpoint cannot be null';
    END IF;

    -- Map checkpoint names to ordinal values
    v_target_order := CASE p_checkpoint
        WHEN 'none'           THEN 0
        WHEN 'received'       THEN 1
        WHEN 'processing'     THEN 2
        WHEN 'media_received' THEN 3
        WHEN 'completed'      THEN 4
        WHEN 'failed'         THEN 5
        ELSE -1
    END;

    IF v_target_order = -1 THEN
        RAISE EXCEPTION 'INVALID_CHECKPOINT: unknown checkpoint "%"', p_checkpoint;
    END IF;

    -- =====================================================================
    -- Step 1: Read the current checkpoint (with row lock)
    -- =====================================================================
    SELECT webhook_checkpoint INTO v_current_checkpoint
    FROM public.generation_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOB_NOT_FOUND: no generation job with id %', p_job_id;
    END IF;

    v_current_order := CASE v_current_checkpoint
        WHEN 'none'           THEN 0
        WHEN 'received'       THEN 1
        WHEN 'processing'     THEN 2
        WHEN 'media_received' THEN 3
        WHEN 'completed'      THEN 4
        WHEN 'failed'         THEN 5
        ELSE 0
    END;

    -- =====================================================================
    -- Step 2: Idempotency check
    -- Checkpoints can only advance forward. Exception: 'failed' (5) can
    -- override any state to allow error handling at any point.
    -- =====================================================================
    IF p_checkpoint <> 'failed' AND v_current_order >= v_target_order THEN
        -- Already at or past this checkpoint -- no-op
        RETURN false;
    END IF;

    -- =====================================================================
    -- Step 3: Apply the update
    -- =====================================================================
    UPDATE public.generation_jobs
    SET webhook_checkpoint   = p_checkpoint,
        status               = p_status,
        output_media_url     = COALESCE(p_output_media_url, output_media_url),
        output_thumbnail_url = COALESCE(p_output_thumbnail_url, output_thumbnail_url),
        error_message        = COALESCE(p_error_message, error_message),
        error_code           = COALESCE(p_error_code, error_code),
        -- Set completed_at when job reaches a terminal state
        completed_at         = CASE
                                   WHEN p_status IN ('completed', 'failed') THEN now()
                                   ELSE completed_at
                               END,
        -- Set started_at on first processing signal (only if not already set)
        started_at           = CASE
                                   WHEN p_status = 'processing' AND started_at IS NULL THEN now()
                                   ELSE started_at
                               END
    WHERE id = p_job_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.update_job_checkpoint(uuid, text, text, text, text, text, text)
    IS 'Idempotent webhook checkpoint advancement. Returns true if update was applied, false if no-op.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Stored procedure: find_stuck_jobs
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns generation jobs that appear stuck (no update within the timeout).

CREATE OR REPLACE FUNCTION public.find_stuck_jobs(
    p_timeout_minutes integer DEFAULT 15
)
RETURNS SETOF public.generation_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT *
    FROM public.generation_jobs
    WHERE status IN ('submitted', 'processing')
      AND updated_at < now() - (p_timeout_minutes || ' minutes')::interval;
$$;

COMMENT ON FUNCTION public.find_stuck_jobs(integer)
    IS 'Find generation jobs stuck in submitted/processing state beyond the timeout threshold.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Stored procedure: recover_stuck_jobs
-- ═══════════════════════════════════════════════════════════════════════════
-- Marks stuck jobs as failed with a TIMEOUT error code and refunds credits.

CREATE OR REPLACE FUNCTION public.recover_stuck_jobs(
    p_timeout_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stuck_job     record;
    v_recovered     integer := 0;
BEGIN
    -- Iterate over each stuck job to handle refunds individually.
    -- We cannot batch refund_credits because each call needs a separate job_id
    -- and the function performs its own validation and locking.
    FOR v_stuck_job IN
        SELECT id FROM find_stuck_jobs(p_timeout_minutes)
    LOOP
        -- Mark the job as failed
        UPDATE public.generation_jobs
        SET status        = 'failed',
            error_message = 'Job timed out after ' || p_timeout_minutes || ' minutes',
            error_code    = 'TIMEOUT',
            completed_at  = now(),
            updated_at    = now()
        WHERE id = v_stuck_job.id;

        -- Refund credits for the timed-out job.
        -- Wrapped in a sub-block so that a refund failure (e.g., already
        -- refunded, or no deduction found) does not abort the entire batch.
        BEGIN
            PERFORM refund_credits(v_stuck_job.id);
        EXCEPTION WHEN OTHERS THEN
            -- Log the refund error but continue recovering other jobs.
            -- The error will be visible in pg_stat_activity / Supabase logs.
            RAISE WARNING 'recover_stuck_jobs: refund_credits failed for job %: %',
                v_stuck_job.id, SQLERRM;
        END;

        v_recovered := v_recovered + 1;
    END LOOP;

    RETURN v_recovered;
END;
$$;

COMMENT ON FUNCTION public.recover_stuck_jobs(integer)
    IS 'Fail stuck jobs, refund credits, and return count of recovered jobs.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. pg_cron jobs
-- ═══════════════════════════════════════════════════════════════════════════
-- The pg_cron extension was already enabled in migration 019.

-- ── Job: Recover stuck generation jobs ─────────────────────────────────────
-- Runs every 5 minutes. Fails jobs stuck in submitted/processing for >15 min
-- and refunds their credits.

SELECT cron.schedule(
    'recover-stuck-generation-jobs',    -- job name (unique identifier)
    '*/5 * * * *',                      -- every 5 minutes
    $$SELECT recover_stuck_jobs(15)$$
);

-- ── Job: Retry dead-letter webhooks ────────────────────────────────────────
-- Runs every 30 minutes. Increments retry_count and schedules the next retry
-- with exponential back-off ((retry_count + 1) * 30 minutes).
-- Only processes entries that have not exhausted their retries and whose
-- next_retry_at has arrived (or was never set).

SELECT cron.schedule(
    'retry-dead-letter-webhooks',       -- job name (unique identifier)
    '*/30 * * * *',                     -- every 30 minutes
    $$UPDATE public.dead_letter_webhooks
      SET retry_count  = retry_count + 1,
          next_retry_at = now() + ((retry_count + 1) * interval '30 minutes'),
          updated_at    = now()
      WHERE retry_count < max_retries
        AND (next_retry_at IS NULL OR next_retry_at <= now())$$
);
