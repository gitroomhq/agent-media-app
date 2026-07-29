-- Migration: Atomic one-time API key read for device-token poll
-- Fixes race condition where concurrent polls could both retrieve
-- the raw API key before either clears it.
-- Uses UPDATE...RETURNING to atomically read and clear in one operation.

CREATE OR REPLACE FUNCTION public.consume_device_raw_key(
    p_device_code_id bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raw_key text;
BEGIN
    UPDATE public.device_codes
    SET raw_api_key = NULL
    WHERE id = p_device_code_id
      AND raw_api_key IS NOT NULL
    RETURNING raw_api_key INTO v_raw_key;

    RETURN v_raw_key;  -- NULL if already consumed or not found
END;
$$;

COMMENT ON FUNCTION public.consume_device_raw_key(bigint)
    IS 'Atomically read and clear the raw API key from a device code. Returns NULL if already consumed.';
