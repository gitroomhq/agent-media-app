-- Migration 013: Database views
-- Public-facing views that hide internal provider details

-- =============================================================================
-- public_models: Joins models with pricing, excludes provider internals
-- =============================================================================
CREATE VIEW public.public_models AS
SELECT
    m.slug,
    m.display_name,
    m.description,
    m.media_type,
    m.supports_text_to_video,
    m.supports_image_to_video,
    m.supports_text_to_image,
    m.max_duration_seconds,
    m.max_resolution,
    mp.operation,
    mp.duration_seconds,
    mp.resolution,
    mp.credit_cost
FROM public.models m
JOIN public.model_pricing mp ON m.slug = mp.model_slug
WHERE m.is_active = true;

COMMENT ON VIEW public.public_models IS 'Public model catalog with pricing. Excludes provider_slug and provider_model_id.';

-- =============================================================================
-- user_generation_summary: Aggregated generation stats per user
-- =============================================================================
CREATE VIEW public.user_generation_summary AS
SELECT
    user_id,
    COUNT(*) AS total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    COUNT(*) FILTER (WHERE status IN ('pending', 'submitted', 'processing')) AS active_jobs,
    COALESCE(SUM(credit_cost), 0) AS total_credits_used,
    MIN(created_at) AS first_job_at,
    MAX(created_at) AS last_job_at
FROM public.generation_jobs
WHERE deleted_at IS NULL
GROUP BY user_id;

COMMENT ON VIEW public.user_generation_summary IS 'Aggregated generation statistics per user, excluding soft-deleted jobs.';
