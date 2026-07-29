-- Migration: onboarding_events
-- Per-step event log so we can answer "where do users churn during
-- onboarding?". Every time a user enters a step we insert a row; the
-- API also accepts arbitrary metadata so we can later capture button
-- clicks, skip events, etc.
--
-- Queries this enables:
--   * latest step seen, per user (resume point):
--       select distinct on (user_id) user_id, step, created_at
--       from public.onboarding_events
--       order by user_id, created_at desc;
--   * step-by-step funnel:
--       select step, count(distinct user_id)
--       from public.onboarding_events
--       group by step;
--   * users who started but didn't finish:
--       select e.user_id, max(e.created_at) as last_seen, max(e.step) as last_step
--       from public.onboarding_events e
--       join public.profiles p on p.id = e.user_id
--       where p.onboarded_at is null
--       group by e.user_id;

CREATE TABLE IF NOT EXISTS public.onboarding_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    step        text NOT NULL,
    event       text NOT NULL DEFAULT 'entered',
    data        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onboarding_events IS
    'Per-step event log for the post-login /onboarding flow. One row per (user, step, event).';
COMMENT ON COLUMN public.onboarding_events.step IS
    'Step name: welcome | showcase | product | source | goal | tool | preparing | completed';
COMMENT ON COLUMN public.onboarding_events.event IS
    'Event kind: entered (page mount), completed (user clicked continue), skipped (user clicked skip)';
COMMENT ON COLUMN public.onboarding_events.data IS
    'Optional metadata for the event (the answer payload, error message, etc.).';

CREATE INDEX IF NOT EXISTS onboarding_events_user_id_idx
    ON public.onboarding_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_events_step_idx
    ON public.onboarding_events (step);
