-- Migration 006: model_pricing
-- Credit cost and provider cost per model/operation/duration/resolution combination

CREATE TABLE public.model_pricing (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_slug          text NOT NULL REFERENCES public.models(slug) ON DELETE CASCADE,
    operation           text NOT NULL
                        CHECK (operation IN ('text_to_video', 'image_to_video', 'text_to_image')),
    duration_seconds    integer,
    resolution          text,
    credit_cost         integer NOT NULL,
    provider_cost_usd   numeric(10, 6) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_model_pricing_combo
        UNIQUE (model_slug, operation, duration_seconds, resolution)
);

COMMENT ON TABLE public.model_pricing IS 'Credit pricing per model/operation/duration/resolution. provider_cost_usd is INTERNAL.';
COMMENT ON COLUMN public.model_pricing.provider_cost_usd IS 'INTERNAL: what we pay the provider in USD. Never exposed to users.';

CREATE INDEX idx_model_pricing_slug ON public.model_pricing(model_slug);
