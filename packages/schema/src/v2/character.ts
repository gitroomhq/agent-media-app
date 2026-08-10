// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Character create input schema.
 *
 * Persists a reusable AI character. The user uploads a single photo;
 * we generate a portrait + multi-pose character sheet (gpt-image-2),
 * pin a Seedance seed, store everything in `user_characters`.
 *
 * Returns: { character_id: "char_xxxxxxxxxx" } that the user can pass
 * to any v2 video generator (Selfie, then Product-in-hands, etc).
 */

import { z } from 'zod';
import { V2_SHOT_PRESETS } from './selfie.js';
import { V2_LOOK_PRESETS } from './crazy-look.js';

export const CharacterCreateSchema = z.object({
  // Optional source photo — if absent, agent-media generates the
  // portrait from `description` alone. Pass a real person's photo
  // ONLY when you want that exact person's likeness.
  photo_url: z.string().url().optional(),

  // Required identity
  display_name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[A-Za-z0-9 _-]+$/,
      'display_name may only contain letters, digits, spaces, underscores, or hyphens',
    ),

  description: z.string().min(8).max(400),

  // Optional — defaults applied per-character if missing
  voice_brief: z.string().min(4).max(240).optional(),
  preset_default: z.enum(V2_SHOT_PRESETS).optional(),

  // The expression this character opens EVERY crazy-look clip on.
  // Omitted ⇒ the worker derives a stable one from the character id.
  // Preset slug or "custom:<text>".
  signature_look: z
    .string()
    .refine(
      (v) =>
        (V2_LOOK_PRESETS as readonly string[]).includes(v) ||
        (v.startsWith('custom:') && v.length > 'custom:'.length + 3),
      { message: 'signature_look must be a look preset, or "custom:<text>"' },
    )
    .optional(),
});

export type CharacterCreateInput = z.infer<typeof CharacterCreateSchema>;
