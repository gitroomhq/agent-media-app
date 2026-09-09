-- GPT Image 2.5 (OpenAI, 2026-09-08): the new default image model.
--
-- generation_jobs.model_slug is a foreign key into public.models, so every
-- catalog id an agent can name needs a row here or the job cannot be
-- created. is_active=false for the same reason as the other loose-surface
-- rows (20260905120000): these are chosen from the catalog, not from the
-- legacy dashboard picker, and an active row would demand model_pricing
-- rows that the loose surface does not use (it prices from V2_MODELS).

insert into public.models (slug, display_name, description, media_type, provider_slug, provider_model_id,
                           supports_text_to_video, supports_image_to_video, supports_text_to_image,
                           max_duration_seconds, max_resolution, is_active, default_duration, allowed_durations)
values
  ('gpt-image-2.5', 'GPT Image 2.5', 'Loose surface: generate_image default, and the model every identity stage (portrait, character sheet, wireframe) paints with.',
   'image', 'openai', 'gpt-image-2.5-sunburst', false, false, true, null, '1536', false, null, null),
  ('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'Loose surface: same family as gpt-image-2.5, faster; variants and batches.',
   'image', 'openai', 'gpt-image-2.5-flare', false, false, true, null, '1536', false, null, null)
on conflict (slug) do nothing;
