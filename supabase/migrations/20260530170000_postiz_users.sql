-- Maps an agent-media user to their Postiz Enterprise user id.
-- We create the Postiz user once (on first social connect) and reuse the id,
-- which also conserves the Enterprise key's ~30 req/hour budget.

CREATE TABLE IF NOT EXISTS public.postiz_users (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  postiz_user_id  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.postiz_users IS 'agent-media user_id -> Postiz Enterprise userId mapping for social publishing.';

ALTER TABLE public.postiz_users ENABLE ROW LEVEL SECURITY;
-- Service-role only (api-v2 manages it); RLS denies anon/authenticated.
