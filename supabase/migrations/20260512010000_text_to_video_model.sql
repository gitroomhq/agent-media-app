-- Register the text-to-video model so generation_jobs.model_slug FK
-- to public.models(slug) resolves.
--
-- Without this the schedule-runner insert fails with:
--   insert or update on table "generation_jobs" violates foreign key
--   constraint "generation_jobs_model_slug_fkey"
--
-- Routing/labelling only — pricing comes from credit_cost on the job
-- row itself. is_active=false so check_pricing_coverage() doesn't
-- require model_pricing rows. FK doesn't care about is_active.

INSERT INTO public.models (
  slug,
  display_name,
  description,
  media_type,
  provider_slug,
  provider_model_id,
  supports_text_to_video,
  supports_image_to_video,
  supports_text_to_image,
  max_duration_seconds,
  max_resolution,
  is_active,
  default_duration,
  allowed_durations,
  min_plan_tier
) VALUES
  (
    'text-to-video',
    'Text-to-Video (Seedance 2.0)',
    'Pure text-to-video generation via Seedance 2.0 — no character sheet, no storyboard. Used by Use-prompts batch schedules where each row IS the full prompt.',
    'video',
    'evolink',
    'seedance-2.0-text-to-video',
    true, false, false,
    15, '720p', false,
    10, '[5, 10, 15]'::jsonb, 'free'
  )
ON CONFLICT (slug) DO NOTHING;
