-- P3 · the quality loop.
--
-- One row per loose-surface job (generate_image / generate_video /
-- generate_audio) holding what the auto-judge saw and what the user said.
-- The judge runs in media-worker-v2 after every completed job, so the
-- signal never depends on a complaint: most customers get a good output
-- and never say so, and the loop still learns from them.
--
-- model_stats aggregates the last 30 days per catalog model for
-- GET /v1/models (the `recent` block), list_models, and model:"auto".

create table if not exists public.generation_quality (
  job_id         uuid primary key references public.generation_jobs(id) on delete cascade,
  user_id        uuid not null references public.profiles(id),
  operation      text not null,
  model_slug     text not null references public.models(slug),
  kind           text not null check (kind in ('video', 'image', 'audio')),
  provider_model text,
  render_ms      integer,
  -- auto-judge (0..1), the rubric breakdown, and which judge produced it
  auto_score     numeric(4,3) check (auto_score >= 0 and auto_score <= 1),
  auto_verdict   jsonb,
  judge          text,
  judged_at      timestamptz,
  -- explicit feedback from the agent/user via rate_run (1..5)
  user_score     smallint check (user_score between 1 and 5),
  user_note      text,
  rated_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists generation_quality_model_created_idx
  on public.generation_quality (model_slug, created_at desc);

alter table public.generation_quality enable row level security;

drop policy if exists "own quality rows" on public.generation_quality;
create policy "own quality rows" on public.generation_quality
  for select using (auth.uid() = user_id);

-- Aggregates only; reads go through the service role in api-v2.
create or replace view public.model_stats
with (security_invoker = true) as
select
  j.model_slug,
  count(*) filter (where j.status in ('completed', 'failed'))                       as runs,
  count(*) filter (where j.status = 'failed')                                       as failed,
  avg(q.auto_score)                                                                 as avg_auto_score,
  count(q.auto_score)                                                               as scored,
  avg(q.user_score)                                                                 as avg_user_score,
  count(q.user_score)                                                               as rated,
  percentile_cont(0.5) within group (
    order by extract(epoch from (j.completed_at - j.created_at))
  ) filter (where j.status = 'completed' and j.completed_at is not null)            as p50_seconds,
  avg(j.credit_cost) filter (where j.status = 'completed')                          as avg_credits,
  max(j.created_at)                                                                 as last_run_at
from public.generation_jobs j
left join public.generation_quality q on q.job_id = j.id
where j.operation like 'generate\_%'
  and j.created_at > now() - interval '30 days'
group by j.model_slug;

grant select on public.model_stats to service_role;
