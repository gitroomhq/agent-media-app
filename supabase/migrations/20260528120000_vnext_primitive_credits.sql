-- vNext credit-ledger integration.
-- Each primitive_run tracks how many credits it deducted from the user's
-- balance so the agent-media dashboard can render accurate totals and so
-- the worker can refund cleanly on terminal failure.
--
-- Forward-only, additive.

ALTER TABLE public.primitive_runs
  ADD COLUMN IF NOT EXISTS credits_deducted integer NOT NULL DEFAULT 0;
