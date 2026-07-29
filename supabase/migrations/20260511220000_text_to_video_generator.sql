-- Allow text_to_video as a schedule generator_id.
--
-- The "Use prompts" mode in the wizard creates schedules with this
-- generator: each row in prompt_rows is fed verbatim to Seedance 2.0
-- text-to-video — no character sheet, no storyboard, no actor.
--
-- The original CHECK constraint enumerated supported generators; we
-- need to relax it. PostgreSQL doesn't let us ALTER a CHECK in place,
-- so we drop + recreate.

ALTER TABLE public.video_schedules
  DROP CONSTRAINT IF EXISTS video_schedules_generator_id_check;

ALTER TABLE public.video_schedules
  ADD CONSTRAINT video_schedules_generator_id_check
  CHECK (generator_id IN (
    'ugc_video', 'show_your_app', 'product_acting_ugc',
    'laptop_ugc', 'character_video', 'saas_review',
    'text_to_video'
  ));
