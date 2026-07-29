-- Migration: SECURITY DEFINER RPC wrappers for the generation_dispatch queue.
--
-- pgmq's send/read/delete/archive functions live in the pgmq schema and can't
-- be called directly through PostgREST. These thin wrappers run with the
-- migration role's privileges so api-v2 (with service_role) and media-worker
-- (also service_role) can use supabase.rpc() to enqueue and pull messages.
--
-- All four functions are SECURITY DEFINER, owned by postgres, and granted
-- only to service_role. anon and authenticated have NO access — these are
-- backend-to-backend operations.

-- Send a message to the dispatch queue. Returns the message id.
create or replace function public.pgmq_dispatch_send(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  msg_id bigint;
begin
  msg_id := pgmq.send(
    queue_name => 'generation_dispatch',
    msg => payload,
    delay => 0
  );
  return msg_id;
end;
$$;

-- Read N messages from the queue with a visibility timeout.
-- Returns: msg_id, message body, read count, enqueued_at.
-- The vt parameter is how long the message is invisible to other consumers.
create or replace function public.pgmq_dispatch_read(vt_seconds int, qty int)
returns table (
  msg_id bigint,
  read_ct int,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return query
  select r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
  from pgmq.read('generation_dispatch', vt_seconds, qty) as r;
end;
$$;

-- Delete a successfully processed message from the queue.
create or replace function public.pgmq_dispatch_delete(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return pgmq.delete('generation_dispatch', p_msg_id);
end;
$$;

-- Archive a permanently failed message (moves to archive table for audit).
create or replace function public.pgmq_dispatch_archive(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return pgmq.archive('generation_dispatch', p_msg_id);
end;
$$;

-- Lock down access — backend roles only.
revoke all on function public.pgmq_dispatch_send(jsonb)        from public, anon, authenticated;
revoke all on function public.pgmq_dispatch_read(int, int)     from public, anon, authenticated;
revoke all on function public.pgmq_dispatch_delete(bigint)     from public, anon, authenticated;
revoke all on function public.pgmq_dispatch_archive(bigint)    from public, anon, authenticated;

grant execute on function public.pgmq_dispatch_send(jsonb)     to service_role;
grant execute on function public.pgmq_dispatch_read(int, int)  to service_role;
grant execute on function public.pgmq_dispatch_delete(bigint)  to service_role;
grant execute on function public.pgmq_dispatch_archive(bigint) to service_role;

comment on function public.pgmq_dispatch_send(jsonb) is
  'Phase A — enqueue a generation dispatch message. service_role only.';
