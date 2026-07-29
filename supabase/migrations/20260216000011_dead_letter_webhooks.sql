-- Migration 011: dead_letter_webhooks
-- Captures failed webhook payloads for retry processing

CREATE TABLE public.dead_letter_webhooks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_slug   text NOT NULL,
    payload         jsonb NOT NULL,
    error_message   text,
    retry_count     integer NOT NULL DEFAULT 0,
    max_retries     integer NOT NULL DEFAULT 3,
    next_retry_at   timestamptz,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'retrying', 'exhausted', 'resolved')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dead_letter_webhooks IS 'Failed webhook payloads for retry. Service-role access only.';

CREATE INDEX idx_dead_letter_status ON public.dead_letter_webhooks(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_dead_letter_retry ON public.dead_letter_webhooks(next_retry_at) WHERE status IN ('pending', 'retrying');
