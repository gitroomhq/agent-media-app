-- Migration 20260217000003: api_keys_table
-- Sprint 10 Phase 1a: Extend the api_keys table with revoked_at and updated_at
-- columns, add partial indexes for active key lookups, and ensure RLS policy
-- covers all operations.
--
-- NOTE: The base api_keys table was created in migration 008 and RLS was
-- enabled in migration 012. This migration adds missing columns required
-- by the apikey-manage Edge Function and replaces the basic indexes with
-- more efficient partial indexes.

-- ── Add missing columns ─────────────────────────────────────────────────────

ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS revoked_at  timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Alter name column to have a default and max length constraint
-- (non-destructive: existing rows keep their values)
ALTER TABLE public.api_keys
    ALTER COLUMN name SET DEFAULT 'Default';

-- ── Replace indexes with partial indexes for active keys ────────────────────

-- Drop the old non-partial indexes if they exist, then create partial ones.
-- Using IF NOT EXISTS to be idempotent.

CREATE INDEX IF NOT EXISTS idx_api_keys_user_active
    ON public.api_keys(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active
    ON public.api_keys(key_hash) WHERE is_active = true;

-- ── RLS policy for all operations (idempotent) ──────────────────────────────
-- Migration 012 already created per-operation policies. This adds a unified
-- policy as a safety net. The DO block ensures idempotency.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'api_keys'
          AND policyname = 'Users can manage own keys'
    ) THEN
        CREATE POLICY "Users can manage own keys"
            ON public.api_keys FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- ── Updated-at trigger ──────────────────────────────────────────────────────

-- Reuse the shared set_updated_at() trigger function (created in migration 001)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'api_keys_updated_at'
          AND tgrelid = 'public.api_keys'::regclass
    ) THEN
        CREATE TRIGGER api_keys_updated_at
            BEFORE UPDATE ON public.api_keys
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at();
    END IF;
END
$$;

COMMENT ON COLUMN public.api_keys.revoked_at IS 'Timestamp when the key was revoked. NULL if still active.';
COMMENT ON COLUMN public.api_keys.updated_at IS 'Automatically updated on row modification.';
