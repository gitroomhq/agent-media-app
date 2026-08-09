// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Crazy Look input schema.
 *
 * Silent 5–10s reaction clip: ONE character, extreme close-up (face
 * fills 70–90% of a vertical 9:16 frame), an exaggerated facial
 * expression held straight into the lens, and a STATIC caption burned
 * over the full clip. No speech, no lip-sync, no TTS — the caption is
 * the hook, the face is the reaction. Ambient room tone is kept so the
 * clip doesn't feel dead; creators layer trending sounds on top in
 * their editor of choice.
 *
 * Format study: high-volume TikTok creative-testing accounts that
 * re-shoot the SAME caption with a different look, dozens of times,
 * with one recurring character. That maps 1:1 onto saved characters
 * (pinned seed ⇒ same face every clip) + one cheap job per variation.
 *
 * Character inputs (one of) — same contract as SelfieSchema:
 *   - character_id (reuse saved character)
 *   - description  (text-only, agent-media paints the character)
 *   - description + photo_url (use the user's photo as a likeness ref)
 *
 * Look inputs:
 *   - look: a V2_LOOK_PRESETS key, or the escape hatch "custom:<text>"
 *           for a freetext expression. Omitted ⇒ the worker picks a
 *           preset at random (the volume use case: N calls, N looks,
 *           same caption).
 */

import { z } from 'zod';
import { V2_POLISH_INTENSITIES } from './selfie.js';

// Expression preset library. Keys only — the prompt briefs (wireframe
// pose + Seedance motion) live in the worker next to the pipeline, the
// same split as V2_SHOT_PRESETS (keys here) / SHOT_PRESETS (briefs in
// realism.js).
export const V2_LOOK_PRESETS = [
  'bug-eyed-shock',
  'jaw-drop',
  'unhinged-grin',
  'deadpan-stare',
  'eyes-rolled-up',
  'suspicious-squint',
  'crying-smile',
  'lean-in-conspiracy',
  'guilty-pout',
  'slow-realization',
] as const;
export type V2LookPreset = (typeof V2_LOOK_PRESETS)[number];

export const V2_CRAZY_LOOK_DURATIONS = [5, 10] as const;
export type V2CrazyLookDuration = (typeof V2_CRAZY_LOOK_DURATIONS)[number];

// look accepts a registered V2_LOOK_PRESETS key or an escape hatch
// `custom:<text>` for one-off expressions that don't match the preset
// library — mirroring shot_preset's `custom-scene:<text>` pattern.
const lookSchema = z
  .string()
  .refine(
    (v) =>
      (V2_LOOK_PRESETS as readonly string[]).includes(v) ||
      (v.startsWith('custom:') && v.length > 'custom:'.length + 3),
    {
      message:
        'look must be one of the registered look presets, or "custom:<text>"',
    },
  );

export const CrazyLookSchema = z
  .object({
    // Character — one path or the other (same rules as SelfieSchema)
    character_id: z
      .string()
      .regex(/^char_[A-Za-z0-9]{10,}$/, 'character_id must look like char_XXXXXXXXXX')
      .optional(),
    photo_url: z.string().url().optional(),
    description: z.string().min(8).max(400).optional(),

    // The hook text burned over the full clip. This IS the content —
    // required. Use "\n" for explicit line breaks; otherwise the
    // renderer wraps automatically. Deliberate typos welcome — they
    // read as authentic in the format.
    caption: z.string().min(2).max(220),

    // Expression. Preset key or "custom:<text>". Omitted ⇒ worker
    // picks a random preset so repeated calls with the same caption
    // produce varied reactions.
    look: lookSchema.optional(),

    duration: z
      .union([z.literal(5), z.literal(10)])
      .default(5),

    // Post-Seedance polish pass (grain + warm grade + vignette). The
    // lo-fi look is load-bearing for this format, so default stays on.
    polish: z.enum(V2_POLISH_INTENSITIES).optional(),
  })
  .superRefine((val, ctx) => {
    const hasSavedCharacter = !!val.character_id;
    const hasDescription = !!val.description;
    if (!hasSavedCharacter && !hasDescription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either character_id, OR description (with optional photo_url for a real reference person).',
      });
    }
    if (hasSavedCharacter && (val.photo_url || val.description)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use character_id OR description (+ optional photo_url), not both.',
      });
    }
    if (val.photo_url && !val.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'photo_url requires description.',
      });
    }
  });

export type CrazyLookInput = z.infer<typeof CrazyLookSchema>;
