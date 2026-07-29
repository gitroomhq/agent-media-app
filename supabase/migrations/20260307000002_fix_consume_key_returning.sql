-- Fix: RETURNING raw_api_key returned NULL because it returns the NEW value after
-- SET raw_api_key = NULL. Use SELECT FOR UPDATE + separate UPDATE instead.

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
    SELECT raw_api_key INTO v_raw_key
    FROM public.device_codes
    WHERE id = p_device_code_id
      AND raw_api_key IS NOT NULL
    FOR UPDATE;

    IF v_raw_key IS NOT NULL THEN
        UPDATE public.device_codes
        SET raw_api_key = NULL
        WHERE id = p_device_code_id;
    END IF;

    RETURN v_raw_key;
END;
$$;
