-- Migration 20260217000001: Storage buckets, RLS policies, and provider seed data
-- Creates the storage buckets needed for generation workflows and seeds
-- the fal.ai provider configuration.

-- =============================================================================
-- Storage Buckets
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'generation-inputs',
    'generation-inputs',
    false,
    104857600, -- 100 MB
    ARRAY[
      'image/png','image/jpeg','image/jpg','image/webp','image/gif',
      'video/mp4','video/webm','video/quicktime','video/x-msvideo'
    ]
  ),
  (
    'generation-outputs',
    'generation-outputs',
    true,
    524288000, -- 500 MB
    ARRAY[
      'image/png','image/jpeg','image/webp','image/gif',
      'video/mp4','video/webm'
    ]
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Storage RLS Policies: generation-inputs (private bucket)
-- =============================================================================
-- Users can upload to their own folder (path starts with their user_id)

CREATE POLICY "generation_inputs_insert_own"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'generation-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own uploaded files
CREATE POLICY "generation_inputs_select_own"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'generation-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own uploaded files
CREATE POLICY "generation_inputs_delete_own"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'generation-inputs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- =============================================================================
-- Storage RLS Policies: generation-outputs (public bucket)
-- =============================================================================
-- Any authenticated user can read outputs (public bucket for sharing)
-- Inserts are done via service_role (bypasses RLS), so no INSERT policy needed.

CREATE POLICY "generation_outputs_select_authenticated"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'generation-outputs'
    );

-- =============================================================================
-- Provider Config Seed: fal.ai
-- =============================================================================
-- Kie.ai was already seeded in migration 023. Adding fal.ai here.

INSERT INTO public.provider_configs (provider_slug, display_name, base_url, api_version, enabled, rate_limits, metadata)
VALUES
    (
        'fal',
        'fal.ai',
        'https://fal.run',
        'v1',
        true,
        '{"requests_per_minute": 120, "concurrent_max": 20}'::jsonb,
        '{"docs_url": "https://fal.ai/docs", "supported_models": ["fal-ai/seedance-1.5-pro", "fal-ai/kling-video/v3/standard", "fal-ai/veo3", "fal-ai/flux-pro/v1.1", "fal-ai/flux/dev", "fal-ai/fast-sdxl"]}'::jsonb
    )
ON CONFLICT (provider_slug) DO NOTHING;
