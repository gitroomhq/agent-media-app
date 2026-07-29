-- SAFE behavioral test for the idempotent deduct_credits fix.
-- Run this in the Supabase SQL editor AFTER applying
-- 20260528130000_deduct_credits_idempotent.sql.
--
-- It is wrapped in BEGIN ... ROLLBACK, so it changes NOTHING permanently:
-- your real balance is restored when the transaction rolls back. It deducts
-- a tiny 1 credit twice against the SAME job id and prints both results.
--
-- EXPECTED (proves the fix):
--   call #1 -> { "success": true, "monthly_deducted": 1 (or purchased), ... }
--   call #2 -> { "success": true, "idempotent_replay": true,
--                "monthly_deducted": 0, "purchased_deducted": 0, ... }
--   balance after BOTH calls == balance after ONE call (dropped by 1, not 2)
--
-- BEFORE the fix, call #2 would have deducted another 1 (total -2).

BEGIN;

DO $$
DECLARE
    v_user   uuid;
    v_job    uuid := gen_random_uuid();
    v_before integer;
    v_after1 jsonb;
    v_after2 jsonb;
    v_final  integer;
BEGIN
    -- Pick any real user that has a credit row (e.g. the admin account).
    -- Replace the WHERE with your own user_id to be explicit.
    SELECT user_id, (monthly_credits_remaining + purchased_balance)
      INTO v_user, v_before
      FROM public.user_credits
      WHERE (monthly_credits_remaining + purchased_balance) >= 2
      ORDER BY (monthly_credits_remaining + purchased_balance) DESC
      LIMIT 1;

    RAISE NOTICE 'user=%  balance_before=%', v_user, v_before;

    v_after1 := public.deduct_credits(v_user, 1, v_job, 'idempotency test call 1');
    RAISE NOTICE 'call #1 -> %', v_after1;

    v_after2 := public.deduct_credits(v_user, 1, v_job, 'idempotency test call 2 (same job)');
    RAISE NOTICE 'call #2 -> %', v_after2;

    SELECT (monthly_credits_remaining + purchased_balance) INTO v_final
      FROM public.user_credits WHERE user_id = v_user;

    RAISE NOTICE 'balance_after=%  (expected = before - 1 = %)', v_final, v_before - 1;

    IF v_final = v_before - 1 AND (v_after2->>'idempotent_replay') = 'true' THEN
        RAISE NOTICE 'PASS: second call was an idempotent no-op; charged once.';
    ELSE
        RAISE EXCEPTION 'FAIL: double-charge not prevented (before=% after=% call2=%)',
            v_before, v_final, v_after2;
    END IF;
END $$;

ROLLBACK;
