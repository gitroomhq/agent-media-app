-- Migration 008: api_keys
-- User-created API keys for CLI and programmatic access

CREATE TABLE public.api_keys (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        text NOT NULL,
    key_prefix  text NOT NULL,
    key_hash    text NOT NULL UNIQUE,
    last_used_at timestamptz,
    expires_at  timestamptz,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.api_keys IS 'API keys for CLI and programmatic access. key_hash is bcrypt; raw key shown once at creation.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'First characters of the key (e.g. ma_abc1) for display identification';
COMMENT ON COLUMN public.api_keys.key_hash IS 'Bcrypt hash of the full API key';

CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON public.api_keys(user_id, is_active) WHERE is_active = true;
