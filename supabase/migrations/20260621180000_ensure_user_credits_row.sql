-- Migration: guarantee every user has a user_credits row
--
-- Bug (Sentry: deduct_credits → "USER_NOT_FOUND: no credit record for user …"):
-- user_credits rows were only created LAZILY — on a purchase or a credit grant
-- (see 20260424000001_reliable_payg_crediting.sql). The signup trigger only
-- creates a `profiles` row (20260216000001_profiles.sql), never a credits row.
-- So any user who hasn't purchased/been granted has NO user_credits row, and
-- every generation fails non-retryably with USER_NOT_FOUND.
--
-- Fix: (1) backfill a row for every existing profile, (2) auto-create one
-- whenever a profile is created. Rows use the table defaults (0 monthly /
-- 0 purchased), so this grants nothing — it just makes the row EXIST, which
-- converts the hard USER_NOT_FOUND crash into normal balance accounting and
-- lets resets/grants/purchases (which upsert) behave consistently.
--
-- NOTE: if free/new users are meant to start with a non-zero monthly allowance,
-- set `monthly_credits_remaining` to that value in BOTH the backfill and the
-- trigger below (left at the 0 default here to avoid granting credits silently).

-- 1) Backfill existing users.
INSERT INTO public.user_credits (user_id)
SELECT p.id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_credits uc WHERE uc.user_id = p.id
);

-- 2) Auto-create a credits row whenever a profile is created.
CREATE OR REPLACE FUNCTION public.ensure_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_user_credits ON public.profiles;
CREATE TRIGGER profiles_ensure_user_credits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_credits();

COMMENT ON FUNCTION public.ensure_user_credits()
  IS 'Guarantees a user_credits row exists per profile (prevents deduct_credits USER_NOT_FOUND).';
