-- v2 · Add persona_brief column to user_characters.
--
-- The Selfie pipeline's character-sheet stage previously only extracted
-- {age, gender, body_details} from the free-text description. That made
-- gpt-image-2 guess everything else (hair, skin, eyes, clothing, jewelry,
-- mannerisms) on every gen — leading to cross-video identity drift on
-- saved characters.
--
-- The orchestrator now produces a 9-field persona_brief (demographic +
-- aesthetic + performance) per character creation. Storing the brief on
-- user_characters means every future video that reuses the character
-- re-applies the SAME locked brief, eliminating the drift.
--
-- ADDITIVE migration — old rows have NULL persona_brief; the pipeline
-- falls back to the thin extraction for legacy rows. New character
-- creations after this migration get a full brief.
--
-- Shape (JSONB):
--   {
--     "age": "30-35",
--     "ethnicity": "...",
--     "build": "...",
--     "hair": "...",
--     "face_features": "...",
--     "skin_tone": "...",
--     "clothing": "...",
--     "energy": "...",
--     "signature_mannerism": "..."
--   }
-- All keys optional from the DB's POV; the pipeline validates per-use.

ALTER TABLE public.user_characters
  ADD COLUMN IF NOT EXISTS persona_brief JSONB;

COMMENT ON COLUMN public.user_characters.persona_brief IS
  'Locked persona brief (9 fields: demographic + aesthetic + performance) emitted by the v2 orchestrator at character creation. Reused on every Selfie call referencing this character to eliminate cross-video identity drift. NULL for legacy rows — pipeline falls back to thin description extraction.';
