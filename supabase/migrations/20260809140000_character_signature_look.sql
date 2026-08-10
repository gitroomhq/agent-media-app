-- v2 · Persist a character's SIGNATURE LOOK.
--
-- The crazy-look format lives on one recurring face making the SAME
-- expression every clip — that repetition is what makes a feed
-- recognisable while scrolling. The worker derives a stable signature
-- from character_id when this column is null, so behaviour is
-- unchanged for existing rows; setting it pins an operator's choice
-- ("this person is the big-eyes guy") for every future clip.
--
-- Purely ADDITIVE. Nullable, no default, no backfill.

ALTER TABLE public.user_characters
  ADD COLUMN IF NOT EXISTS signature_look text;

COMMENT ON COLUMN public.user_characters.signature_look IS
  'Look preset slug (or "custom:<text>") this character opens on in EVERY crazy-look clip. NULL = derive deterministically from public_id. Explicit per-job `look` always wins.';
