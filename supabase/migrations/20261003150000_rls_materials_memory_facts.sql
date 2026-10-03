-- Supabase advisor (critical): both tables were readable and writable with the
-- public anon key. Neither is used by the app (0 rows, no code references).
-- RLS on with no policies = service role only.
alter table public.materials enable row level security;
alter table public.memory_facts enable row level security;
