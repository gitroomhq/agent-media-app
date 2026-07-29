-- Migration: extend the dispatch queue view with oldest-message age.
--
-- Admin metrics page needs to know not just how many messages are queued
-- (depth) but also how long the oldest one has been waiting (so we can
-- alert on backlog without depth necessarily looking high).
--
-- Replaces public.generation_dispatch_depth (which only had `depth`) with
-- a richer view. Reads from pgmq.q_generation_dispatch directly; needs no
-- pgmq privileges leaked to anon since this view runs as the migration
-- role.

drop view if exists public.generation_dispatch_depth cascade;

create or replace view public.generation_dispatch_status as
  select
    count(*)::int                                                       as depth,
    coalesce(extract(epoch from (now() - min(enqueued_at)))::int, 0)    as oldest_age_seconds,
    coalesce(extract(epoch from (now() - max(enqueued_at)))::int, 0)    as newest_age_seconds
  from pgmq.q_generation_dispatch;

grant select on public.generation_dispatch_status to anon, authenticated, service_role;

comment on view public.generation_dispatch_status is
  'Queue health snapshot: depth + oldest/newest message age in seconds. Used by /admin/metrics.';
