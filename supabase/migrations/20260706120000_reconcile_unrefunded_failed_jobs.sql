-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Safety net for credit refunds on terminal failure.
--
-- recover_stuck_jobs() refunds a timed-out job, but only inside a BEGIN/EXCEPTION
-- block that swallows any refund error (RAISE WARNING) — and once a row is flipped
-- to 'failed' it is never re-scanned by find_stuck_jobs (which selects only
-- processing/submitted). The worker's own failure path, and a crashed worker whose
-- in-workflow refund catch never runs, can likewise leave a debited job unrefunded.
-- Nothing reconciled those, so a single dropped refund stranded the user's credits
-- forever.
--
-- This adds an idempotent sweeper that finds ANY terminally-failed job which was
-- debited (generation_debit) but never refunded (generation_refund) and refunds it.
-- refund_credits() is itself idempotent (guards NO_DEDUCTION_FOUND / ALREADY_REFUNDED),
-- so this can only ever return a user's credits once, no matter which path failed
-- the job or how many times the sweep runs.

CREATE OR REPLACE FUNCTION public.reconcile_unrefunded_failed_jobs(
    p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job      record;
    v_refunded integer := 0;
BEGIN
    FOR v_job IN
        SELECT j.id
        FROM public.generation_jobs j
        WHERE j.status IN ('failed', 'canceled')
          AND EXISTS (
              SELECT 1 FROM public.credit_transactions d
              WHERE d.reference_id = j.id AND d.type = 'generation_debit'
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.credit_transactions r
              WHERE r.reference_id = j.id AND r.type = 'generation_refund'
          )
        ORDER BY j.completed_at NULLS LAST
        LIMIT p_limit
    LOOP
        BEGIN
            PERFORM refund_credits(v_job.id);
            v_refunded := v_refunded + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Benign races (ALREADY_REFUNDED / NO_DEDUCTION_FOUND) or a transient
            -- lock: log and leave for the next sweep. Never lost silently.
            RAISE WARNING 'reconcile_unrefunded_failed_jobs: refund_credits failed for job %: %',
                v_job.id, SQLERRM;
        END;
    END LOOP;

    RETURN v_refunded;
END;
$$;

COMMENT ON FUNCTION public.reconcile_unrefunded_failed_jobs(integer) IS
    'Safety net: refund any terminally-failed job that was debited but never refunded (idempotent via refund_credits). Closes the permanent credit-loss gap when a refund is dropped by any failure path.';

-- Sweep every 10 minutes, offset from recover_stuck_jobs (every 5 min). Guarded so
-- the function still installs where pg_cron is absent (e.g. a bare test database).
DO $cron$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-unrefunded-failed-jobs') THEN
            PERFORM cron.unschedule('reconcile-unrefunded-failed-jobs');
        END IF;
        PERFORM cron.schedule(
            'reconcile-unrefunded-failed-jobs',
            '*/10 * * * *',
            $$SELECT reconcile_unrefunded_failed_jobs(500)$$
        );
    END IF;
END
$cron$;
