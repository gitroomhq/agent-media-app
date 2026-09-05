-- Loose surface (generate_image / generate_video / generate_audio).
--
-- generation_jobs.model_slug is a foreign key into public.models, so every
-- catalog model an agent can name needs a row here. The slugs are the
-- catalog ids from @agentmedia/schema/v2 V2_MODELS (live models only);
-- is_active=false keeps them out of the legacy dashboard model picker,
-- which is not how these are selected.

alter table public.models drop constraint if exists models_media_type_check;
alter table public.models
  add constraint models_media_type_check
  check (media_type = any (array['video'::text, 'image'::text, 'subtitle'::text, 'ugc'::text, 'audio'::text]));

insert into public.models (slug, display_name, description, media_type, provider_slug, provider_model_id,
                           supports_text_to_video, supports_image_to_video, supports_text_to_image,
                           max_duration_seconds, max_resolution, is_active, default_duration, allowed_durations)
values
  ('seedance-2.0', 'Seedance 2.0', 'Loose surface: generate_video default. Reference-to-video with refs, text-to-video without.',
   'video', 'evolink', 'seedance-2.0-reference-to-video', true, true, false, 15, '720p', false, 5, '[4,5,6,7,8,9,10,11,12,13,14,15]'::jsonb),
  ('seedance-2.5', 'Seedance 2.5', 'Loose surface: premium video, ~3x the credits of 2.0.',
   'video', 'evolink', 'seedance-2.5-reference-to-video', true, true, false, 15, '720p', false, 5, '[4,5,6,7,8,9,10,11,12,13,14,15]'::jsonb),
  ('gpt-image-2', 'GPT Image 2', 'Loose surface: generate_image default. Text-to-image, or edit/compose from reference images.',
   'image', 'openai', 'gpt-image-2', false, false, true, null, '1536', false, null, null),
  ('elevenlabs-tts', 'ElevenLabs TTS', 'Loose surface: generate_audio default. Text to speech, named voices.',
   'audio', 'elevenlabs', 'eleven_v3', false, false, false, null, null, false, null, null)
on conflict (slug) do nothing;
