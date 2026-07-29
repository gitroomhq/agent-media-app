-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Submitted jobs can wait behind a user's in-worker FIFO queue. The previous
-- watchdog used the same 15 minute timeout for queued jobs and actively
-- processing jobs, so a burst of valid jobs could be failed/refunded before the
-- worker ever started them.

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
    WHERE (
        status = 'processing'
        AND updated_at < now() - (p_timeout_minutes || ' minutes')::interval
    )
    OR (
        status = 'submitted'
        AND updated_at < now() - (GREATEST(p_timeout_minutes * 4, 60) || ' minutes')::interval
    );
$$;

COMMENT ON FUNCTION public.find_stuck_jobs(integer)
    IS 'Find active processing jobs stuck beyond timeout, while allowing submitted queue jobs a longer queue timeout.';

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
    v_queue_timeout integer := GREATEST(p_timeout_minutes * 4, 60);
BEGIN
    FOR v_stuck_job IN
        SELECT id, status FROM find_stuck_jobs(p_timeout_minutes)
    LOOP
        UPDATE public.generation_jobs
        SET status        = 'failed',
            error_message = CASE
                WHEN v_stuck_job.status = 'submitted'
                    THEN 'Job timed out while waiting in queue after ' || v_queue_timeout || ' minutes'
                ELSE 'Job timed out after ' || p_timeout_minutes || ' minutes'
            END,
            error_code    = 'TIMEOUT',
            completed_at  = now(),
            updated_at    = now()
        WHERE id = v_stuck_job.id;

        BEGIN
            PERFORM refund_credits(v_stuck_job.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'recover_stuck_jobs: refund_credits failed for job %: %',
                v_stuck_job.id, SQLERRM;
        END;

        v_recovered := v_recovered + 1;
    END LOOP;

    RETURN v_recovered;
END;
$$;

COMMENT ON FUNCTION public.recover_stuck_jobs(integer)
    IS 'Fail stuck processing jobs and long-queued submitted jobs, refund credits, and return count of recovered jobs.';
