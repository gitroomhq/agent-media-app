-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Sprint 14: Beta launch infrastructure
-- Creates invite_codes and feedback tables with RLS policies.

-- ── invite_codes table ──────────────────────────────────────────────────────

create table if not exists public.invite_codes (
  id          uuid        primary key default gen_random_uuid(),
  code        text        unique not null,
  plan_slug   text        not null default 'starter',
  max_uses    int         default 10,
  used_count  int         default 0,
  expires_at  timestamptz,
  created_by  uuid        references auth.users,
  is_active   boolean     default true,
  created_at  timestamptz default now()
);

comment on table public.invite_codes is 'Beta invite codes for gated access during launch.';

alter table public.invite_codes enable row level security;

-- Authenticated users can select active codes (for validation at redemption time)
create policy "invite_codes_select_active"
  on public.invite_codes
  for select
  to authenticated
  using (is_active = true);

-- Only service_role can insert invite codes (admin operations)
create policy "invite_codes_insert_service_role"
  on public.invite_codes
  for insert
  to service_role
  with check (true);

-- Only service_role can update invite codes (increment used_count, deactivate)
create policy "invite_codes_update_service_role"
  on public.invite_codes
  for update
  to service_role
  using (true)
  with check (true);

-- ── feedback table ──────────────────────────────────────────────────────────

create table if not exists public.feedback (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users,
  type        text        not null check (type in ('bug', 'feature', 'general')),
  message     text        not null,
  page_url    text,
  rating      int         check (rating between 1 and 5),
  metadata    jsonb       default '{}',
  created_at  timestamptz default now()
);

comment on table public.feedback is 'User feedback collected via the dashboard widget.';

alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "feedback_insert_own"
  on public.feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can read their own feedback
create policy "feedback_select_own"
  on public.feedback
  for select
  to authenticated
  using (user_id = auth.uid());

-- ── Seed beta invite codes ──────────────────────────────────────────────────

insert into public.invite_codes (code, plan_slug, max_uses)
values
  ('BETA-001', 'starter', 10),
  ('BETA-002', 'starter', 10),
  ('BETA-003', 'starter', 10),
  ('BETA-004', 'starter', 10),
  ('BETA-005', 'starter', 10)
on conflict (code) do nothing;
