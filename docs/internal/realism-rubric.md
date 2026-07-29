<!-- INTERNAL — DO NOT MIRROR. Moved out of public-skill/ (B4, 2026-07-24) because it
     published internal prompt-engineering + provider-behavior discoveries (publication
     rule / invariant 7). The public pack now ships only an outcome-level description
     (see refRealism() in services/api-v2/scripts/generate-public-skill.ts). This file is
     the team reference for the actual rubric applied inside the primitive Activities. -->

# Realism rubric (internal)

Every skill that generates an image or video automatically wraps the user's description with a single-sentence realism prompt built by Claude Haiku. The rubric is not optional — it fights AI-perfection defaults that ruin UGC believability.

## Mandatory clauses (for portrait + character-sheet primitives)

- **Skin realism:** natural skin texture, visible pores, subtle freckles or tiny facial hairs, no plastic shine, no airbrushing, no AI artifacts.
- **Asymmetry & humanity:** subtle facial asymmetries, micro-expressions, genuine eye catchlights, not perfectly symmetrical.
- **UGC aesthetic:** candid iPhone-style framing, slight handheld tilt, imperfect framing, subtle digital noise / film grain, shallow depth of field, warm iPhone color grade, not studio-perfect.
- **Lighting** (driven by `realism_target`):
    - `natural` → soft window daylight, gentle wrap shadows, ambient room reflection in the eyes.
    - `commercial` → clean commercial soft key light, neutral seamless backdrop, subtle catchlights, skin texture still preserved.
    - `raw_iphone` → unedited iPhone front camera selfie, raw HDR, slight handheld breathing, mild low-light grain, exposure imperfection.

## Video-specific clauses

- Framed waist-up, hands free, NOT holding a phone, looking directly into the camera.
- The word "selfie" is deliberately avoided — Seedance treats it as a "subject holds phone with both hands" prior. Synonyms (talking-head close-up, vertical front-camera video) get the same composition without the phone.
- If the user's `pose` hint explicitly mentions phone / selfie / holding phone, the phone is allowed in. Otherwise it stays out.

## Why this is baked in, not optional

A prior production session shipped a bare prompt without these clauses. The output looked AI-generated and unusable for real UGC. The rubric is now part of the Claude Haiku system prompt inside every primitive Activity. Do not try to bypass it via the user-facing `description` field.
