-- Migration 007: generation_jobs
-- Core table tracking all generation requests and their lifecycle

CREATE TABLE public.generation_jobs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id),
    model_slug              text NOT NULL REFERENCES public.models(slug),
    operation               text NOT NULL,
    status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                                'pending',
                                'submitted',
                                'processing',
                                'completed',
                                'failed',
                                'canceled'
                            )),
    prompt                  text NOT NULL,
    negative_prompt         text,
    input_media_url         text,
    duration_seconds        integer,
    resolution              text,
    credit_cost             integer NOT NULL,
    provider_cost_usd       numeric(10, 6),
    provider_job_id         text,
    provider_slug           text,
    output_media_url        text,
    output_thumbnail_url    text,
    error_message           text,
    error_code              text,
    idempotency_key         text UNIQUE,
    webhook_checkpoint      text NOT NULL DEFAULT 'none',
    started_at              timestamptz,
    completed_at            timestamptz,
    deleted_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.generation_jobs IS 'All generation requests with full lifecycle tracking';
COMMENT ON COLUMN public.generation_jobs.provider_job_id IS 'INTERNAL: provider-assigned job identifier';
COMMENT ON COLUMN public.generation_jobs.provider_slug IS 'INTERNAL: which provider handled this job';
COMMENT ON COLUMN public.generation_jobs.webhook_checkpoint IS 'Idempotent webhook state machine checkpoint';
COMMENT ON COLUMN public.generation_jobs.deleted_at IS 'Soft delete timestamp; NULL means active';

-- Primary query index: user's jobs by status, ordered by creation time
CREATE INDEX idx_jobs_user_status
    ON public.generation_jobs(user_id, status, created_at);

-- Provider job lookup for webhook processing
CREATE INDEX idx_jobs_provider
    ON public.generation_jobs(provider_job_id)
    WHERE provider_job_id IS NOT NULL;

-- Soft-delete filter for gallery queries
CREATE INDEX idx_jobs_not_deleted
    ON public.generation_jobs(user_id, created_at)
    WHERE deleted_at IS NULL;

CREATE TRIGGER generation_jobs_updated_at
    BEFORE UPDATE ON public.generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
