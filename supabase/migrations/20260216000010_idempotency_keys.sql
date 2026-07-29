-- Migration 010: idempotency_keys
-- Prevents duplicate processing of financial operations

CREATE TABLE public.idempotency_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key             text UNIQUE NOT NULL,
    endpoint        text NOT NULL,
    response_status integer,
    response_body   jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

COMMENT ON TABLE public.idempotency_keys IS 'Idempotency tracking for financial endpoints. Service-role access only. 24hr TTL.';

CREATE INDEX idx_idempotency_keys_expires ON public.idempotency_keys(expires_at);
