-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration 025: security_hardening
-- Sprint 7: Rate limiting, content moderation, and security infrastructure.
--
-- Creates:
--   - rate_limit_config: per-tier rate-limit settings
--   - rate_limit_log: sliding-window request counters
--   - content_moderation_log: audit trail for moderation decisions
-- Seeds default rate-limit configurations for all plan tiers.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. rate_limit_config
-- ═══════════════════════════════════════════════════════════════════════════
-- Stores per-tier, per-endpoint rate-limit thresholds. The wildcard '*'
-- endpoint pattern is the default; more specific patterns take precedence
-- at the application layer.

CREATE TABLE public.rate_limit_config (
    tier_slug           text NOT NULL
                        CHECK (tier_slug IN ('free', 'starter', 'growth', 'pro')),
    endpoint_pattern    text NOT NULL,
    requests_per_minute integer NOT NULL DEFAULT 10,
    burst_limit         integer NOT NULL DEFAULT 15,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (tier_slug, endpoint_pattern)
);

COMMENT ON TABLE public.rate_limit_config
    IS 'Per-tier rate-limit configuration. Keyed by (tier_slug, endpoint_pattern).';
COMMENT ON COLUMN public.rate_limit_config.tier_slug
    IS 'Subscription tier slug (free, starter, growth, pro).';
COMMENT ON COLUMN public.rate_limit_config.endpoint_pattern
    IS 'Endpoint glob pattern. Use ''*'' for the default catch-all.';
COMMENT ON COLUMN public.rate_limit_config.requests_per_minute
    IS 'Maximum sustained requests per rolling 60-second window.';
COMMENT ON COLUMN public.rate_limit_config.burst_limit
    IS 'Maximum instantaneous burst above the sustained rate.';

-- Updated-at trigger
CREATE TRIGGER rate_limit_config_updated_at
    BEFORE UPDATE ON public.rate_limit_config
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. rate_limit_log
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks per-user, per-endpoint request counts within sliding windows.
-- The unique constraint on (user_id, endpoint, window_start) allows
-- atomic upserts via INSERT ... ON CONFLICT DO UPDATE.

CREATE TABLE public.rate_limit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint        text NOT NULL,
    window_start    timestamptz NOT NULL,
    request_count   integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (user_id, endpoint, window_start)
);

COMMENT ON TABLE public.rate_limit_log
    IS 'Sliding-window rate-limit counters per (user, endpoint, window).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. content_moderation_log
-- ═══════════════════════════════════════════════════════════════════════════
-- Immutable audit trail for every content moderation decision.
-- Retained for compliance and abuse investigation.

CREATE TABLE public.content_moderation_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id      uuid REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
    prompt      text NOT NULL,
    flagged     boolean NOT NULL,
    categories  jsonb NOT NULL DEFAULT '{}'::jsonb,
    scores      jsonb NOT NULL DEFAULT '{}'::jsonb,
    action      text NOT NULL
                CHECK (action IN ('allow', 'block', 'review')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_moderation_log
    IS 'Audit log for content moderation decisions on user prompts.';
COMMENT ON COLUMN public.content_moderation_log.categories
    IS 'Per-category boolean flags (e.g., {"violence": true, "sexual": false}).';
COMMENT ON COLUMN public.content_moderation_log.scores
    IS 'Per-category confidence scores (0.0 – 1.0).';
COMMENT ON COLUMN public.content_moderation_log.action
    IS 'Platform action taken: allow, block, or review.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Rate-limit lookups: find the current window for a (user, endpoint) pair
CREATE INDEX idx_rate_limit_log_user_endpoint_window
    ON public.rate_limit_log (user_id, endpoint, window_start);

-- Moderation log queries: per-user timeline
CREATE INDEX idx_content_moderation_log_user_created
    ON public.content_moderation_log (user_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

-- rate_limit_config: read-only reference table, no user-facing RLS needed.
-- Service role has full access by default.

-- rate_limit_log: users can see their own entries
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_limit_log_select_own
    ON public.rate_limit_log
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role bypasses RLS and has full CRUD access.

-- content_moderation_log: users can see their own entries
ALTER TABLE public.content_moderation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_moderation_log_select_own
    ON public.content_moderation_log
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role bypasses RLS and has full CRUD access.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Seed: default rate-limit configurations
-- ═══════════════════════════════════════════════════════════════════════════
-- All tiers get a wildcard ('*') endpoint pattern as the default.

INSERT INTO public.rate_limit_config (tier_slug, endpoint_pattern, requests_per_minute, burst_limit)
VALUES
    ('free',    '*', 10,  15),
    ('starter', '*', 30,  45),
    ('growth',  '*', 60,  90),
    ('pro',     '*', 120, 180);
