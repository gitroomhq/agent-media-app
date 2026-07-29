-- Migration: enable pgmq + create the generation dispatch queue.
--
-- Phase A of the scale plan: durable queue replacing the in-memory userQueues
-- map in media-worker-v2. This migration is schema-only — no code reads from
-- the queue yet. The dual-write feature flag (USE_DURABLE_QUEUE in api-v2)
-- defaults to false, so this is a no-op until that flips.
--
-- Why pgmq: stays inside Supabase (no new infra), durable (survives worker
-- restarts), supports SELECT … FOR UPDATE SKIP LOCKED so multiple worker
-- replicas can pull without stepping on each other.

create extension if not exists pgmq cascade;

-- Idempotent: pgmq.create() raises if the queue already exists, so guard.
do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'generation_dispatch') then
    perform pgmq.create('generation_dispatch');
  end if;
end$$;

-- View for the admin /metrics page to surface queue depth without pgmq
-- privileges leaking outside.
create or replace view public.generation_dispatch_depth as
  select count(*)::int as depth
  from pgmq.q_generation_dispatch;

grant select on public.generation_dispatch_depth to anon, authenticated, service_role;

comment on extension pgmq is 'Phase A — durable queue for generation dispatch. See migration 20260503000001.';
