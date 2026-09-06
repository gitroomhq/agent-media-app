-- Loose surface rebuild (spec-driven video modes): record which mode a job
-- ran (text | image | reference) and what the provider reported billing,
-- so prices are checked against real bills and model stats can be read
-- per mode. provider_usage is INTERNAL: never returned by the public API.

alter table public.generation_quality
  add column if not exists mode text,
  add column if not exists provider_usage jsonb;

comment on column public.generation_quality.mode is 'Video mode the job ran: text | image | reference (null for image/audio kinds).';
comment on column public.generation_quality.provider_usage is 'INTERNAL: the provider task usage block (cost, credits, billed duration). Never exposed.';
