-- Fix: consume_device_raw_key had two bugs:
-- 1. Parameter was bigint but device_codes.id is uuid (type mismatch → always NULL).
-- 2. RETURNING returns the NEW value after SET raw_api_key = NULL, so it always returned NULL.
-- Fix: read the old value first, then clear it.

DROP FUNCTION IF EXISTS public.consume_device_raw_key(bigint);
DROP FUNCTION IF EXISTS public.consume_device_raw_key(uuid);

CREATE OR REPLACE FUNCTION public.consume_device_raw_key(
    p_device_code_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raw_key text;
BEGIN
    -- Read the current value
    SELECT raw_api_key INTO v_raw_key
    FROM public.device_codes
    WHERE id = p_device_code_id
      AND raw_api_key IS NOT NULL
    FOR UPDATE;  -- lock the row

    IF v_raw_key IS NOT NULL THEN
        -- Clear it
        UPDATE public.device_codes
        SET raw_api_key = NULL
        WHERE id = p_device_code_id;
    END IF;

    RETURN v_raw_key;  -- NULL if already consumed or not found
END;
$$;

COMMENT ON FUNCTION public.consume_device_raw_key(uuid)
    IS 'Atomically read and clear the raw API key from a device code. Returns NULL if already consumed.';
