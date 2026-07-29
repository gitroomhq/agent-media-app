-- Migration 009: device_codes
-- OAuth device flow codes for CLI authentication

CREATE TABLE public.device_codes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code         text UNIQUE NOT NULL,
    user_code           text UNIQUE NOT NULL,
    confirmation_code   text NOT NULL,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
    user_id             uuid REFERENCES public.profiles(id),
    expires_at          timestamptz NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_codes IS 'Device flow codes for CLI login. Service-role access only.';
COMMENT ON COLUMN public.device_codes.device_code IS 'Long random code used by CLI for polling';
COMMENT ON COLUMN public.device_codes.user_code IS 'Short user-facing code displayed in browser';
COMMENT ON COLUMN public.device_codes.confirmation_code IS '6-char CSRF confirmation code for device approval';

CREATE INDEX idx_device_codes_status ON public.device_codes(status) WHERE status = 'pending';
CREATE INDEX idx_device_codes_expires ON public.device_codes(expires_at);
