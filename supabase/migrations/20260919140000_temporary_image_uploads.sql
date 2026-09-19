-- Temporary, account-scoped image handoffs. Only api-v2's service role accesses
-- these rows: panel capabilities never grant general account access.
create table public.temporary_upload_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index temporary_upload_sessions_owner on public.temporary_upload_sessions(user_id, expires_at);
create table public.temporary_upload_assets (
  id uuid primary key,
  session_id uuid not null references public.temporary_upload_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  source_hash text not null,
  source_bytes integer not null check (source_bytes between 1 and 26214400),
  object_key text not null unique,
  read_token text not null,
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'failed')),
  lease_token uuid not null,
  lease_until timestamptz not null,
  mime text,
  bytes integer,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index temporary_upload_assets_expiry on public.temporary_upload_assets(expires_at);
create index temporary_upload_assets_session on public.temporary_upload_assets(session_id);
create index temporary_upload_assets_owner on public.temporary_upload_assets(user_id, expires_at);
alter table public.temporary_upload_sessions enable row level security;
alter table public.temporary_upload_assets enable row level security;
revoke all on public.temporary_upload_sessions, public.temporary_upload_assets from anon, authenticated;
grant all on public.temporary_upload_sessions, public.temporary_upload_assets to service_role;

create function public.create_temporary_upload_session(p_id uuid, p_user_id uuid, p_token_hash text)
returns public.temporary_upload_sessions language plpgsql security invoker set search_path = public as $$
declare result public.temporary_upload_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 719));
  if (select count(*) from temporary_upload_sessions where user_id = p_user_id and expires_at > now()) >= 10 then
    raise exception 'UPLOAD_SESSION_LIMIT';
  end if;
  insert into temporary_upload_sessions(id, user_id, token_hash, expires_at)
    values(p_id, p_user_id, p_token_hash, now() + interval '24 hours') returning * into result;
  return result;
end $$;

-- Serializes account quota admission and same-file retries across API replicas.
create function public.reserve_temporary_upload_asset(
  p_id uuid, p_session_id uuid, p_user_id uuid, p_filename text,
  p_source_hash text, p_source_bytes integer, p_read_token text, p_lease_token uuid
) returns public.temporary_upload_assets language plpgsql security invoker set search_path = public as $$
declare result public.temporary_upload_assets; session public.temporary_upload_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 719));
  select * into session from temporary_upload_sessions where id = p_session_id and user_id = p_user_id;
  if not found or session.expires_at <= now() then raise exception 'UPLOAD_EXPIRED'; end if;
  select * into result from temporary_upload_assets where id = p_id;
  if found then
    if result.session_id <> p_session_id or result.user_id <> p_user_id or result.source_hash <> p_source_hash then
      raise exception 'UPLOAD_CONFLICT';
    end if;
    if result.status = 'ready' then return result; end if;
    if result.status = 'uploading' and result.lease_until > now() then raise exception 'UPLOAD_IN_PROGRESS'; end if;
    update temporary_upload_assets set status = 'uploading', lease_token = p_lease_token,
      lease_until = now() + interval '2 minutes' where id = p_id returning * into result;
    return result;
  end if;
  if (select count(*) from temporary_upload_assets where session_id = p_session_id) >= 10
    or (select count(*) from temporary_upload_assets where user_id = p_user_id and expires_at > now()) >= 40 then
    raise exception 'UPLOAD_FILE_LIMIT';
  end if;
  insert into temporary_upload_assets(id, session_id, user_id, filename, source_hash, source_bytes,
    object_key, read_token, lease_token, lease_until, expires_at)
    values(p_id, p_session_id, p_user_id, p_filename, p_source_hash, p_source_bytes,
      'temporary-images/' || p_user_id || '/' || p_id, p_read_token, p_lease_token,
      now() + interval '2 minutes', session.expires_at) returning * into result;
  return result;
end $$;
revoke all on function public.create_temporary_upload_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_temporary_upload_asset(uuid, uuid, uuid, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_temporary_upload_session(uuid, uuid, text) to service_role;
grant execute on function public.reserve_temporary_upload_asset(uuid, uuid, uuid, text, text, integer, text, uuid) to service_role;
