-- Per-account webhook endpoint + delivery log.
--
-- Adds:
--   profiles.webhook_url      — optional URL to POST to when any of the
--                               user's generation_jobs reaches a terminal
--                               status (completed | failed). Per-job
--                               override lives in input_params.webhook_url.
--   profiles.webhook_secret   — random 32-byte hex string used as the HMAC
--                               key for X-AgentMedia-Signature. Auto-set on
--                               first read by the API; rotation handled by
--                               a dedicated /v1/account/webhook-secret/rotate
--                               route (added separately).
--   webhook_deliveries        — one row per fire attempt. Used for the
--                               in-app delivery log and to deduplicate
--                               retries.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS webhook_url    text,
  ADD COLUMN IF NOT EXISTS webhook_secret text;

COMMENT ON COLUMN public.profiles.webhook_url IS
  'Optional per-account webhook endpoint. agent-media POSTs job.completed/job.failed events here. NULL disables.';
COMMENT ON COLUMN public.profiles.webhook_secret IS
  'HMAC-SHA256 key for X-AgentMedia-Signature on outbound webhook calls. 32-byte hex. Auto-generated; users can rotate via API.';

-- Backfill: every existing profile gets a webhook_secret on first read.
-- We do it in SQL so the edge function never has to write here.
UPDATE public.profiles
   SET webhook_secret = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 WHERE webhook_secret IS NULL;

-- After backfill: enforce non-null going forward.
ALTER TABLE public.profiles
  ALTER COLUMN webhook_secret SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  ALTER COLUMN webhook_secret SET NOT NULL;

-- ── webhook_deliveries ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  event           text NOT NULL CHECK (event IN ('job.completed', 'job.failed')),
  url             text NOT NULL,
  attempt_n       int  NOT NULL CHECK (attempt_n >= 1),
  status          text NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'permanently_failed')),
  http_status     int,            -- 2xx = delivered, anything else logged for debugging
  response_excerpt text,           -- first 500 chars of response body
  error_message   text,            -- transport-level error (DNS, timeout, TLS)
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,     -- when status flipped to 'delivered'
  next_retry_at   timestamptz      -- set when status='failed' AND attempt_n<3
);

COMMENT ON TABLE public.webhook_deliveries IS
  'Audit log of outbound webhook firings. One row per attempt — three rows max per (job_id, event) given the 3-attempt cap.';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user_id
  ON public.webhook_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_job_id
  ON public.webhook_deliveries (job_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_retry
  ON public.webhook_deliveries (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_deliveries_select_own ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_select_own
  ON public.webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Edge function (service role) handles all inserts/updates.
DROP POLICY IF EXISTS webhook_deliveries_no_user_write ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_no_user_write
  ON public.webhook_deliveries
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
