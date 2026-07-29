-- Migration: Add cancel_at_period_end flag and expired status
-- This separates "cancel requested" from "subscription ended"

-- 1. Add cancel_at_period_end boolean
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.cancel_at_period_end
    IS 'True when user has requested cancellation but subscription is still active until period end';

-- 2. Expand status CHECK to include expired
ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'expired'));

-- 3. Backfill: canceled + future period_end = active + cancel_at_period_end
UPDATE public.subscriptions
SET cancel_at_period_end = true,
    status = 'active'
WHERE status = 'canceled'
  AND current_period_end IS NOT NULL
  AND current_period_end > now();

-- 4. Backfill: canceled + past period_end = expired
UPDATE public.subscriptions
SET status = 'expired'
WHERE status = 'canceled'
  AND current_period_end IS NOT NULL
  AND current_period_end <= now();

-- 5. Backfill: canceled + no period_end = expired (unknown end date)
UPDATE public.subscriptions
SET status = 'expired'
WHERE status = 'canceled'
  AND current_period_end IS NULL;
