-- Copyright 2026 agent-media contributors. Apache-2.0 license.
--
-- Migration: Drop the device_codes confirmation_code trigger.
--
-- The BEFORE INSERT trigger from migration 026 overwrites the
-- confirmation_code set by the device-token edge function, causing a
-- mismatch between the code returned to the CLI and the code stored
-- in the database. The edge function already generates its own secure
-- 6-digit numeric code, so the trigger is redundant and harmful.

-- 1. Drop the trigger
DROP TRIGGER IF EXISTS device_codes_generate_confirmation_code ON public.device_codes;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS public.generate_confirmation_code();

-- 3. Change column back to text to avoid char(6) padding issues
ALTER TABLE public.device_codes
    ALTER COLUMN confirmation_code TYPE text;
