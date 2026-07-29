-- Migration 014: Add raw_api_key column to device_codes
-- Temporarily stores the raw API key after device approval so the CLI
-- can retrieve it via polling. Cleared after first read (one-time access).

ALTER TABLE public.device_codes
    ADD COLUMN raw_api_key text;

COMMENT ON COLUMN public.device_codes.raw_api_key IS 'Temporary raw API key, set on approval, cleared after first poll retrieval';
