-- Migration 005: models
-- Server-side model registry. Provider details are INTERNAL ONLY.

CREATE TABLE public.models (
    slug                    text PRIMARY KEY,
    display_name            text NOT NULL,
    description             text,
    media_type              text NOT NULL CHECK (media_type IN ('video', 'image')),
    provider_slug           text NOT NULL,
    provider_model_id       text NOT NULL,
    supports_text_to_video  boolean NOT NULL DEFAULT false,
    supports_image_to_video boolean NOT NULL DEFAULT false,
    supports_text_to_image  boolean NOT NULL DEFAULT false,
    max_duration_seconds    integer,
    max_resolution          text,
    is_active               boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.models IS 'Model registry. Users see slug/display_name; provider details are internal only.';
COMMENT ON COLUMN public.models.provider_slug IS 'INTERNAL: provider identifier (kie, fal, replicate). Never exposed to users.';
COMMENT ON COLUMN public.models.provider_model_id IS 'INTERNAL: provider-specific model identifier. Never exposed to users.';

CREATE INDEX idx_models_active ON public.models(is_active) WHERE is_active = true;

CREATE TRIGGER models_updated_at
    BEFORE UPDATE ON public.models
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
