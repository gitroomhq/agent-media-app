-- Migration: profiles onboarding columns
-- Adds three columns to track the post-login onboarding flow:
--   * onboarded_at    timestamp set when the user finishes onboarding.
--                     NULL means they have NOT yet been onboarded.
--                     The middleware uses this to force a user through
--                     /onboarding before they reach /subscribe or the
--                     rest of the app.
--   * onboarding_step text label of the most-recently-completed step
--                     (e.g. 'welcome', 'role', 'goal'). Useful so the
--                     user can resume mid-flow.
--   * onboarding_data jsonb keyed by step name. Every step posts its
--                     answers to /api/onboarding/answer which merges
--                     them into this object, so the full profile of
--                     what each user told us is queryable as one row.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS onboarded_at    timestamptz,
    ADD COLUMN IF NOT EXISTS onboarding_step text,
    ADD COLUMN IF NOT EXISTS onboarding_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.onboarded_at IS
    'Timestamp set when the user finished /onboarding. NULL means the user has not been onboarded yet.';
COMMENT ON COLUMN public.profiles.onboarding_step IS
    'Label of the most recently completed onboarding step. Lets the UI resume mid-flow.';
COMMENT ON COLUMN public.profiles.onboarding_data IS
    'JSONB blob with all onboarding answers, keyed by step (e.g. {role: "founder", goal: "TikTok ads"}). Each step PATCHes a partial object into this column.';

-- Backfill: assume any user that already has a subscription record was
-- onboarded under the previous flow, so they don''t get bounced back
-- into /onboarding on their next visit. New signups remain NULL.
UPDATE public.profiles p
SET onboarded_at = COALESCE(p.created_at, now())
WHERE p.onboarded_at IS NULL
  AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p.id
        AND s.plan_slug <> 'free'
  );
