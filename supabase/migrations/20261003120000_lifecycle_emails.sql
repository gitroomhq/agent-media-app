-- Lifecycle email ledger (one row per user per email kind) and the
-- candidate query used by /api/cron/lifecycle. Service-role only.

CREATE TABLE IF NOT EXISTS public.lifecycle_emails (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind     text NOT NULL,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.lifecycle_emails ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) reads or writes.

CREATE OR REPLACE FUNCTION public.lifecycle_candidates(p_start timestamptz)
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  status text,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  sent text[],
  unsubscribed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH c AS (
    SELECT u.id, u.email, u.created_at, s.status, s.trial_ends_at,
           CASE WHEN s.status IN ('canceled', 'expired') THEN s.updated_at END AS canceled_at
    FROM auth.users u
    LEFT JOIN public.subscriptions s ON s.user_id = u.id
    WHERE u.email IS NOT NULL
      AND u.deleted_at IS NULL
      AND u.email NOT ILIKE '%agent-media.ai'
      AND (
        (s.id IS NULL AND u.created_at >= p_start AND u.created_at > now() - interval '8 days')
        OR (s.status = 'trialing' AND s.trial_ends_at BETWEEN now() AND now() + interval '25 hours')
        OR (s.status = 'past_due')
        OR (s.status IN ('canceled', 'expired') AND s.stripe_subscription_id IS NOT NULL
            AND s.updated_at BETWEEN now() - interval '6 days' AND now() - interval '2 days')
      )
  )
  SELECT c.id, c.email, c.created_at, c.status, c.trial_ends_at, c.canceled_at,
         COALESCE(array_agg(l.kind) FILTER (WHERE l.kind IS NOT NULL), '{}'),
         bool_or(l.kind = 'unsubscribed') IS TRUE
  FROM c
  LEFT JOIN public.lifecycle_emails l ON l.user_id = c.id
  GROUP BY c.id, c.email, c.created_at, c.status, c.trial_ends_at, c.canceled_at
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_candidates(timestamptz) FROM PUBLIC, anon, authenticated;
