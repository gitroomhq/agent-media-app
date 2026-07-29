-- Backfill a char_… public_id for user_characters rows that predate the v1
-- auto-save minting one. v1 make_character_sheet / make_ugc previously inserted
-- the row with public_id = NULL, so those characters were not addressable by
-- their char_… handle (only by their character_sheet_url). New rows now mint a
-- public_id in the worker (character-sheet-gpt2.ts); this fills in the old ones.
--
-- The partial unique index uniq_user_characters_public_id (WHERE public_id IS
-- NOT NULL) enforces uniqueness; gen_random_uuid() per row makes a collision in
-- the 16^10 space effectively impossible. Idempotent: only touches NULL rows.

UPDATE public.user_characters
SET public_id = 'char_' || substr(md5(gen_random_uuid()::text), 1, 10)
WHERE public_id IS NULL;
