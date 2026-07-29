-- Cache table for the laptop-ugc pipeline's actor pose stills.
--
-- Each (actor_id, kind) pair maps to a public image URL on EvoLink CDN.
-- Generated lazily on first job per actor (avoid burning $30 upfront for
-- actors that may never be used). Reused on every subsequent job.
--
-- kind ∈ {'show_and_tell', 'over_shoulder', 'selfie'}

CREATE TABLE IF NOT EXISTS public.actor_laptop_ugc_poses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES public.actors (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('show_and_tell', 'over_shoulder', 'selfie')),
  image_url   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, kind)
);

CREATE INDEX IF NOT EXISTS actor_laptop_ugc_poses_actor_idx
  ON public.actor_laptop_ugc_poses (actor_id);

-- service_role only — pipeline writes via worker, no direct user access
ALTER TABLE public.actor_laptop_ugc_poses ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated → service_role
-- bypasses RLS entirely, which is the only access path we need.
