// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Selfie input schema.
 *
 * Generates a 9:16 vertical TikTok-style clip via the Selfie pipeline
 * (orchestration agent -> gpt-image-2 portrait -> gpt-image-2 character
 * sheet -> gpt-image-2 wireframe -> Seedance 2.0 reference-to-video). See
 * services/media-worker-v2/src/v2/selfie-adapter.js.
 *
 * Character inputs (one of):
 *   - character_id (reuse saved character)
 *   - description  (text-only, agent-media paints the character)
 *   - description + photo_url (use the user's photo as a likeness ref)
 *
 * Action inputs (one or both):
 *   - script        (what the person says - drives lip-sync and staging)
 *   - scene_action  (what the person does - for non-speech clips)
 */

import { z } from 'zod';

// Re-exported for character.ts (sheet preset default) and the character
// CLI command. NOT used by the Selfie pipeline - the orchestrator
// drives composition from the script, not a fixed preset list.
export const V2_SHOT_PRESETS = [
  'bedroom-morning-ritual',
  'getting-ready-mirror-edge',
  'bathroom-skincare-routine',
  'bedside-lamp-evening',
  'kitchen-glow-up',
  'backyard-morning-coffee',
  'picnic-blanket-outdoor',
  'car-quick-honest-review',
  'car-passenger-honest',
  'outdoor-walking-talking',
  'couch-haul-show-off',
  'closet-fit-check',
  'studio-apartment-tour',
  'balcony-evening-vibes',
  'desk-wfh-quick-pitch',
  'cafe-window-seat',
  'office-bathroom-discreet',
  'gym-post-workout',
  'salon-mirror-result',
  'travel-hotel-room-review',
] as const;
export type V2ShotPreset = (typeof V2_SHOT_PRESETS)[number];

export const V2_VIBES = ['excited', 'calm', 'sassy', 'serious', 'curious'] as const;
export type V2Vibe = (typeof V2_VIBES)[number];

export const V2_DURATIONS = [5, 10, 15] as const;
export type V2Duration = (typeof V2_DURATIONS)[number];

export const V2_PHONE_IN_FRAME = ['forbidden', 'optional', 'required'] as const;
export type V2PhoneInFrame = (typeof V2_PHONE_IN_FRAME)[number];

export const V2_POLISH_INTENSITIES = ['off', 'default', 'heavy'] as const;
export type V2PolishIntensity = (typeof V2_POLISH_INTENSITIES)[number];

// shot_preset accepts a registered V2_SHOT_PRESETS key or an escape
// hatch `custom-scene:<text>` for one-off scenes that don't match the
// preset library. See realism.js resolveShotBrief() for the runtime.
const shotPresetSchema = z
  .string()
  .refine(
    (v) =>
      (V2_SHOT_PRESETS as readonly string[]).includes(v) ||
      v.startsWith('custom-scene:'),
    {
      message:
        'shot_preset must be one of the registered presets, or "custom-scene:<text>"',
    },
  );

export const SelfieSchema = z
  .object({
    // Character — one path or the other
    character_id: z
      .string()
      .regex(/^char_[A-Za-z0-9]{10,}$/, 'character_id must look like char_XXXXXXXXXX')
      .optional(),
    photo_url: z.string().url().optional(),
    description: z.string().min(8).max(400).optional(),

    // What is said. Optional - when omitted (or empty) the pipeline
    // produces a non-speech clip from scene_action. At
    // least ONE of script / scene_action must be present.
    script: z.string().max(600).optional(),

    // What the person is doing in the scene. Drives the action_prompt
    // when there is no script (dance, b-roll, ambient clips).
    scene_action: z.string().min(4).max(400).optional(),

    // Background-music direction. `true` for "soft upbeat music, no
    // dialogue", a string for explicit direction ("lo-fi jazz, soft
    // kick"). Appended to the Seedance action_prompt.
    background_music: z.union([z.boolean(), z.string().min(2).max(200)]).optional(),

    duration: z
      .union([z.literal(5), z.literal(10), z.literal(15)])
      .default(10),

    // Burn Hormozi-style subtitles on the final clip.
    subtitles: z.boolean().default(true),

    // ── Realism opt-in controls (all optional) ─────────────────────────
    // shot_preset / vibe pin the scene composition + energy. When
    // omitted, the orchestrator picks defaults based on the script.
    shot_preset: shotPresetSchema.optional(),
    vibe: z.enum(V2_VIBES).optional(),

    // Default: stable/locked framing to avoid jitter. Set false only
    // when the user explicitly requests handheld camera movement.
    camera_locked: z.boolean().default(true),

    // Default 'forbidden': no phone/camera/selfie-stick visible unless
    // the user explicitly requests it.
    // 'required' — actively compose with phone covering chin/lower face
    //              (the "iPhone-cover trick" — fewer face-render errors).
    // 'forbidden' — strip phone from frame entirely (legacy behavior).
    phone_in_frame: z.enum(V2_PHONE_IN_FRAME).default('forbidden'),

    // Post-Seedance polish pass (ffmpeg grain + warm grade + vignette).
    // Defaults to 'default'. Set to 'off' to bypass entirely.
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
        message:
          'Use character_id OR description (+ optional photo_url) — not both.',
      });
    }
    const hasScript = !!val.script && val.script.trim().length >= 4;
    const hasSceneAction = !!val.scene_action && val.scene_action.trim().length >= 4;
    if (!hasScript && !hasSceneAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either script (what they say) or scene_action (what they do). At least one is required.',
      });
    }
    if (val.script !== undefined && val.script.length > 0 && val.script.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['script'],
        message: 'script must be at least 4 characters if provided',
      });
    }
    if (val.photo_url && !val.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'photo_url requires a description so we know what to emphasize.',
      });
    }
  });

export type SelfieInput = z.infer<typeof SelfieSchema>;
