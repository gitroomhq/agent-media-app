-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration 026: device_flow_csrf
-- Sprint 7: Harden the device-code OAuth flow with auto-generated CSRF
-- confirmation codes.
--
-- The confirmation_code column was added as plain text in migration 009.
-- This migration:
--   1. Changes the column type to char(6) for consistent length.
--   2. Creates a function to generate random 6-char alphanumeric codes.
--   3. Adds a trigger so new device_codes rows get an auto-generated
--      confirmation_code on INSERT.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tighten the confirmation_code column type
-- ═══════════════════════════════════════════════════════════════════════════
-- Change from text to char(6) to enforce consistent 6-character length.
-- Existing rows are preserved (values shorter than 6 chars will be
-- right-padded by PostgreSQL; values longer will be truncated).

ALTER TABLE public.device_codes
    ALTER COLUMN confirmation_code TYPE char(6);

COMMENT ON COLUMN public.device_codes.confirmation_code
    IS 'Auto-generated 6-char alphanumeric CSRF confirmation code for device approval.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Function: generate_confirmation_code
-- ═══════════════════════════════════════════════════════════════════════════
-- Generates a random 6-character alphanumeric string (A-Z, 0-9).
-- Used by the trigger below and can also be called directly.

CREATE OR REPLACE FUNCTION public.generate_confirmation_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chars   text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    v_code    text := '';
    v_i       integer;
BEGIN
    -- Build a 6-character random code from the allowed character set.
    FOR v_i IN 1..6 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;

    NEW.confirmation_code := v_code;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_confirmation_code()
    IS 'Trigger function: generates a random 6-char alphanumeric CSRF code for device_codes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Trigger: auto-generate on INSERT
-- ═══════════════════════════════════════════════════════════════════════════
-- Fires before INSERT so the generated code is written with the row.
-- Overwrites any caller-supplied value to ensure cryptographic randomness.

CREATE TRIGGER device_codes_generate_confirmation_code
    BEFORE INSERT ON public.device_codes
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_confirmation_code();
