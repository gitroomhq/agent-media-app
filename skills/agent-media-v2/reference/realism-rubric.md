<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# Realism rubric (internal guard)

The pipeline scaffolds prompts against this 9-point rubric. You usually don't need to think about it — but if a user complains about "fake-looking" output, this is what the pipeline is enforcing:

1. Real-camera optics — focal length, depth-of-field, microcatchlights
2. Skin texture — pores, sebum, asymmetry, no Photoshop smoothing
3. Hair physics — flyaways, shine, natural fall
4. Eye direction — meets camera, no dead-stare
5. Lighting — natural sources, motivated highlights, no ring-light halo
6. Wardrobe wear — wrinkles, layering, lived-in fabric
7. Background — believable depth, props that match the scene
8. Pose — neutral spine, natural hand position, no AI-mannequin stiffness
9. Color cast — daylight white-balance, no orange tint

If the output violates any of these, raise an issue with the job_id — the rubric is enforced at Stage A (portrait gen) and Stage B (character sheet).
