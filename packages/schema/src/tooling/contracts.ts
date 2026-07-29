// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type ToolContractVersion = 'v1';

export interface ToolContract<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  id: string;
  version: ToolContractVersion;
  summary: string;
  input: TInput;
  output: TOutput;
}

function isPublicHttpsUrl(value: string): boolean {
  const url = new URL(value);
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === 'localhost' ||
    host === '::1' ||
    host.includes(':') ||
    host.startsWith('[') ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('169.254.') ||
    /^::ffff:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(host) ||
    /^0:0:0:0:0:ffff:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(host) ||
    host.startsWith('fe80:')
  );
}

export const ActorRefToolInputSchema = z.object({
  mode: z.enum(['use_existing', 'create_new']),
  character_id: z.string().regex(/^char_[A-Za-z0-9]{10,}$/, 'character_id must be a char_ id').optional(),
  display_name: z.string().min(2).max(60).optional(),
  description: z.string().min(8).max(400).optional(),
  photo_url: z.string().url().optional(),
});

export const ActorRefToolOutputSchema = z
  .union([
    z.object({
      source: z.literal('existing'),
      character_id: z.string().regex(/^char_[A-Za-z0-9]{10,}$/),
      job_id: z.string().uuid().optional(),
    }),
    z.object({
      source: z.literal('created'),
      character_id: z.string().regex(/^char_[A-Za-z0-9]{10,}$/).nullable(),
      job_id: z.string().uuid().optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.source === 'created' && value.character_id === null && !value.job_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'created actor_refs output must include character_id or job_id',
      });
    }
  });

export const SceneContinuityInputSchema = z.object({
  previous_job_id: z.string().uuid().optional(),
  explicit_last_frame_url: z.string().url().optional(),
  scene_notes: z.string().min(1).max(600).optional(),
});

export const SceneContinuityOutputSchema = z.object({
  last_frame_reference_url: z.string().url().nullable(),
  continuity_prompt_suffix: z.string().min(1),
  source: z.enum(['job_wireframe', 'explicit', 'none']),
});

export const ElevenLabsAudioInputSchema = z.object({
  voice_id: z.string().min(1),
  script: z.string().min(1).max(600),
  model_id: z.string().default('eleven_multilingual_v2'),
});

export const ElevenLabsAudioOutputSchema = z.object({
  integration_enabled: z.boolean(),
  request_payload: z.record(z.unknown()).nullable(),
  preview_url: z.string().url().nullable(),
});

export const PortraitGpt2ToolInputSchema = z.object({
  description: z.string().min(8).max(400),
  reference_photo_url: z.string().url().regex(/^https:\/\//, 'reference_photo_url must use https').refine(isPublicHttpsUrl, {
    message: 'reference_photo_url must use https and must not target private/internal addresses',
  }).optional(),
  setting: z.string().min(1).max(200).optional(),
  aspect_ratio: z.enum(['1:1', '9:16']).default('1:1'),
  realism_target: z.enum(['natural', 'commercial', 'raw_iphone']).default('natural'),
});

export const PortraitGpt2ToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  portrait_url: z.string().url().nullable(),
  provider: z.literal('gpt-image-2'),
  credits_deducted: z.number().int().nonnegative(),
});

export const CharacterSheetGpt2ToolInputSchema = z.object({
  portrait_url: z.string().url().regex(/^https:\/\//, 'portrait_url must use https').refine(isPublicHttpsUrl, {
    message: 'portrait_url must use https and must not target private/internal addresses',
  }),
  description: z
    .string()
    .max(80)
    .refine((s) => s.trim().split(/\s+/).filter(Boolean).length <= 10, {
      message: 'description must be at most 10 words',
    })
    .optional(),
  aspect_ratio: z.enum(['1:1', '9:16']).default('1:1'),
});

export const CharacterSheetGpt2ToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  character_sheet_url: z.string().url().nullable(),
  provider: z.literal('gpt-image-2'),
  credits_deducted: z.number().int().nonnegative(),
});

export const WireframeGpt2ToolInputSchema = z.object({
  character_sheet_url: z
    .string()
    .url()
    .regex(/^https:\/\//, 'character_sheet_url must use https')
    .refine(isPublicHttpsUrl, {
      message: 'character_sheet_url must use https and must not target private/internal addresses',
    }),
  script: z.string().min(8).max(600),
  n_panels: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).default(6),
  aspect_ratio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
});

export const WireframeGpt2ToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  wireframe_url: z.string().url().nullable(),
  provider: z.literal('gpt-image-2'),
  credits_deducted: z.number().int().nonnegative(),
});

export const SimpleSelfieToolInputSchema = z
  .object({
    character_sheet_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'character_sheet_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'character_sheet_url must use https and must not target private/internal addresses',
      }),
    duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
    // Speech path: what the subject SAYS (lip-synced). Optional — omit for a
    // non-speech clip and provide scene_action instead.
    script: z.string().min(1).max(600).describe('Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing — about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user\'s line if it is longer.').optional(),
    // Non-speech path: what the subject DOES (e.g. "dancing freestyle to upbeat
    // music, smiling at camera"). Provide this instead of script for b-roll /
    // vibes / dancing clips with no dialogue.
    scene_action: z.string().min(3).max(400).optional(),
    // Add background music. true for a default upbeat bed, or a string for
    // direction ("lo-fi jazz"). No spoken dialogue when only music is wanted.
    background_music: z.union([z.boolean(), z.string().max(120)]).optional(),
    location: z.string().max(120).optional(),
    pose: z.string().max(120).optional(),
    aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
  })
  .refine((d) => Boolean(d.script) || Boolean(d.scene_action), {
    message: 'provide either script (what they say) or scene_action (what they do)',
    path: ['script'],
  })
  .refine(
    (d) => {
      // Word-count pacing only applies to the spoken script.
      if (!d.script) return true;
      const wc = d.script.trim().split(/\s+/).filter(Boolean).length;
      return wc >= d.duration && wc <= Math.round(d.duration * 2.2);
    },
    (d) => ({
      message: `script should be about ${d.duration}-${Math.round(d.duration * 2.2)} words for a ${d.duration}s clip — keep it short for natural, unhurried pacing (~1.5 words/sec)`,
      path: ['script'],
    }),
  );

export const SimpleSelfieToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  video_url: z.string().url().nullable(),
  provider: z.literal('seedance-2-0'),
  credits_deducted: z.number().int().nonnegative(),
});

export const SelfieToolInputSchema = z.object({
  character_id: z.string().regex(/^char_[A-Za-z0-9]{10,}$/).optional(),
  photo_url: z.string().url().optional(),
  description: z.string().min(8).max(400).optional(),
  script: z.string().max(600).optional(),
  scene_action: z.string().min(4).max(400).optional(),
  duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
  subtitles: z.boolean().default(true),
});

export const SelfieToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  credits_deducted: z.number().int().nonnegative(),
});

export const SubtitleToolInputSchema = z.object({
  video_url: z.string().url(),
  style: z.string().default('hormozi'),
  transcript: z.string().min(1).max(5000).optional(),
  language: z.string().length(2).optional(),
});

export const SubtitleToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  credits_deducted: z.number().int().nonnegative(),
});

export const SubtitlesV2ToolInputSchema = z.object({
  video_url: z
    .string()
    .url()
    .regex(/^https:\/\//, 'video_url must use https')
    .refine(isPublicHttpsUrl, {
      message: 'video_url must use https and must not target private/internal addresses',
    }),
  transcript: z.string().min(1).max(5000).optional(),
  style: z.enum(['hormozi', 'tiktok', 'minimal']).default('hormozi'),
  language: z.string().length(2).optional(),
  aspect_ratio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
});

export const SubtitlesV2ToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  video_url: z.string().url().nullable(),
  provider: z.literal('whisper-ffmpeg'),
  credits_deducted: z.number().int().nonnegative(),
});

export const LipSyncToolInputSchema = z.object({
  image_url: z
    .string()
    .url()
    .regex(/^https:\/\//, 'image_url must use https')
    .refine(isPublicHttpsUrl, {
      message: 'image_url must use https and must not target private/internal addresses',
    }),
  audio_url: z
    .string()
    .url()
    .regex(/^https:\/\//, 'audio_url must use https')
    .refine(isPublicHttpsUrl, {
      message: 'audio_url must use https and must not target private/internal addresses',
    }),
  duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
  aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
});

export const LipSyncToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  video_url: z.string().url().nullable(),
  provider: z.literal('seedance-2-0'),
  credits_deducted: z.number().int().nonnegative(),
});

/**
 * product_in_hands — like simple_selfie, but the subject HOLDS and SHOWS a
 * product (from a second reference image) in their hands. Both reference
 * images (character_sheet_url + product_image_url) must already be R2-hosted;
 * the skill route re-hosts arbitrary URLs / base64 before this contract runs.
 * Speech path = script (talks about the product); non-speech path =
 * scene_action (silent demo / b-roll).
 */
export const ProductInHandsToolInputSchema = z
  .object({
    character_sheet_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'character_sheet_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'character_sheet_url must use https and must not target private/internal addresses',
      }),
    product_image_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'product_image_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'product_image_url must use https and must not target private/internal addresses',
      }),
    duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
    // Speech path: what the subject SAYS about the product (lip-synced).
    script: z.string().min(1).max(600).describe('Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing — about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user\'s line if it is longer.').optional(),
    // Non-speech path: how the subject demos the product (e.g. "turning the
    // bottle to show the label, smiling"). Silent b-roll, no dialogue.
    scene_action: z.string().min(3).max(400).optional(),
    // Locks the person's gender/appearance to the first reference so a
    // gendered product (e.g. a football kit) can't drift the subject. E.g.
    // "a young woman", "a man in his 40s". Recommended.
    subject: z.string().max(80).optional(),
    // Shot framing: close_up = chest-up holding the product (default);
    // full_body = head-to-toe so the person + outfit are fully visible (good
    // for turn-arounds / wearing the product).
    framing: z.enum(['close_up', 'full_body']).default('close_up'),
    background_music: z.union([z.boolean(), z.string().max(120)]).optional(),
    location: z.string().max(120).optional(),
    pose: z.string().max(120).optional(),
    aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
  })
  .refine((d) => Boolean(d.script) || Boolean(d.scene_action), {
    message: 'provide either script (what they say) or scene_action (how they demo it)',
    path: ['script'],
  })
  .refine(
    (d) => {
      if (!d.script) return true;
      const wc = d.script.trim().split(/\s+/).filter(Boolean).length;
      return wc >= d.duration && wc <= Math.round(d.duration * 2.2);
    },
    (d) => ({
      message: `script should be about ${d.duration}-${Math.round(d.duration * 2.2)} words for a ${d.duration}s clip — keep it short for natural, unhurried pacing (~1.5 words/sec)`,
      path: ['script'],
    }),
  );

export const ProductInHandsToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  video_url: z.string().url().nullable(),
  provider: z.literal('seedance-2-0'),
  credits_deducted: z.number().int().nonnegative(),
});

/**
 * broll_talking_head — an actor talks to camera for up to 30s while a
 * user-supplied SQUARE b-roll video plays as an overlay on the bottom half of
 * the frame. Because providers cap a single lip-sync clip at ~10s, the talking
 * head is generated as a sequence of <=10s clips chained by last-frame
 * continuity (each clip starts on the previous clip's final frame), then
 * concatenated for a seamless-continuous take and composited with the looping
 * square overlay. Speech is either Seedance-native (script) or the caller's own
 * audio track (audio_url). actor_image_url and broll_video_url accept ANY
 * public https URL — the skill route re-hosts external links onto R2 before
 * this contract runs, so the worker only ever fetches R2.
 *
 * broll_video_url is OPTIONAL: omit it to produce a plain multi-take talking
 * head (the script is chunked into as many seamless <=15s takes as the words
 * need, cross-dissolved together) with NO overlay — this is the long-form
 * monologue path that needs no b-roll asset.
 */
export const BrollTalkingHeadToolInputSchema = z
  .object({
    actor_image_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'actor_image_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'actor_image_url must use https and must not target private/internal addresses',
      }),
    portrait_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'portrait_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'portrait_url must use https and must not target private/internal addresses',
      })
      .describe('Optional clean close-up portrait of the same person as actor_image_url — a second identity reference for higher-fidelity faces. Auto-resolved from the saved character when omitted.')
      .optional(),
    broll_video_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'broll_video_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'broll_video_url must use https and must not target private/internal addresses',
      })
      .describe('Optional. A square-ish b-roll video overlaid on the lower half while the actor narrates. Omit for a plain multi-take talking head (no overlay) — the long-form monologue path.')
      .optional(),
    // Speech path A: Seedance generates the voice from this script.
    script: z
      .string()
      .min(1)
      .max(1200)
      .describe(
        'What the actor says (lip-synced). Up to ~30s of speech — keep it ~1.5 words/sec for natural pacing (~45 words for 30s).',
      )
      .optional(),
    // Speech path B: bring-your-own audio (one consistent voice across the whole
    // take). On the `script` path the voice, face and setting carry across cuts
    // automatically — take 1's voice + last frame seed the following take.
    audio_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'audio_url must use https')
      .refine(isPublicHttpsUrl, {
        message: 'audio_url must use https and must not target private/internal addresses',
      })
      .optional(),
    // Total target length. <=15s is a single take (zero cuts); 16-30s uses two
    // takes (15 + remainder) that carry voice + face + setting across the cut.
    duration: z
      .union([z.literal(10), z.literal(15), z.literal(20), z.literal(25), z.literal(30)])
      .default(20),
    aspect_ratio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
    // Burn TikTok-style captions on the final video.
    subtitles: z.boolean().default(false),
    // Width of the bottom b-roll as a fraction of the frame width, centered
    // with black side margins (e.g. 0.9 = 90% wide). Omit for full width.
    broll_width_rate: z.number().min(0.1).max(1).optional(),
    // Seconds into the talking head when the b-roll first appears (default 0).
    broll_start_time: z.number().min(0).max(25).optional(),
    // Fade the b-roll out (dissolve into the actor) at its end. Default false.
    broll_fade_out: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.script) || Boolean(d.audio_url), {
    message: 'provide either script (Seedance voice) or audio_url (your own speech track)',
    path: ['script'],
  });

export const BrollTalkingHeadToolOutputSchema = z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  video_url: z.string().url().nullable(),
  provider: z.literal('seedance-2-0'),
  duration_seconds: z.number().int().positive(),
  credits_deducted: z.number().int().nonnegative(),
});

export const V1_MANDATORY_TOOL_CONTRACTS = {
  actor_refs: {
    id: 'actor_refs',
    version: 'v1',
    summary: 'Resolve existing actor reference or create a new reusable character.',
    input: ActorRefToolInputSchema,
    output: ActorRefToolOutputSchema,
  },
  scene_continuity: {
    id: 'scene_continuity',
    version: 'v1',
    summary: 'Resolve last-frame references and continuity guidance.',
    input: SceneContinuityInputSchema,
    output: SceneContinuityOutputSchema,
  },
  elevenlabs_audio: {
    id: 'elevenlabs_audio',
    version: 'v1',
    summary: 'Prepare ElevenLabs synthesis path for voice continuity.',
    input: ElevenLabsAudioInputSchema,
    output: ElevenLabsAudioOutputSchema,
  },
  portrait_gpt2: {
    id: 'portrait_gpt2',
    version: 'v1',
    summary: 'Create one realistic portrait with gpt-image-2.',
    input: PortraitGpt2ToolInputSchema,
    output: PortraitGpt2ToolOutputSchema,
  },
  character_sheet_gpt2: {
    id: 'character_sheet_gpt2',
    version: 'v1',
    summary: 'Create a multi-angle character sheet from a portrait using gpt-image-2.',
    input: CharacterSheetGpt2ToolInputSchema,
    output: CharacterSheetGpt2ToolOutputSchema,
  },
  wireframe_gpt2: {
    id: 'wireframe_gpt2',
    version: 'v1',
    summary:
      'Create a photographic storyboard / wireframe board from a character sheet + script, with numbered panels showing the action progression.',
    input: WireframeGpt2ToolInputSchema,
    output: WireframeGpt2ToolOutputSchema,
  },
  simple_selfie: {
    id: 'simple_selfie',
    version: 'v1',
    summary:
      'Generate a 5/10/15s vertical UGC selfie video from a character sheet, with native lip-synced audio. Waist-up, no object held.',
    input: SimpleSelfieToolInputSchema,
    output: SimpleSelfieToolOutputSchema,
  },
  product_in_hands: {
    id: 'product_in_hands',
    version: 'v1',
    summary:
      'Generate a 5/10/15s vertical UGC video where the character holds and shows a product (from a second reference image) in their hands, with native lip-synced audio (script) or a silent demo (scene_action).',
    input: ProductInHandsToolInputSchema,
    output: ProductInHandsToolOutputSchema,
  },
  broll_talking_head: {
    id: 'broll_talking_head',
    version: 'v1',
    summary:
      'Generate an up-to-30s vertical talking-head video (seamless via last-frame-chained <=10s clips) with a user-supplied square b-roll video looping as a bottom-half overlay. Speech from script (Seedance voice) or a provided audio_url.',
    input: BrollTalkingHeadToolInputSchema,
    output: BrollTalkingHeadToolOutputSchema,
  },
  subtitles_v2: {
    id: 'subtitles_v2',
    version: 'v1',
    summary:
      'Burn TikTok/Hormozi-style captions onto a vNext video. Auto-transcribes via Whisper when transcript is omitted.',
    input: SubtitlesV2ToolInputSchema,
    output: SubtitlesV2ToolOutputSchema,
  },
  lip_sync: {
    id: 'lip_sync',
    version: 'v1',
    summary:
      'Lip-sync a face (image or existing clip) to a provided audio track (your own recording). No TTS/voice-clone needed — bring your own audio.',
    input: LipSyncToolInputSchema,
    output: LipSyncToolOutputSchema,
  },
  selfie: {
    id: 'selfie',
    version: 'v1',
    summary: 'Submit a selfie generation job.',
    input: SelfieToolInputSchema,
    output: SelfieToolOutputSchema,
  },
  subtitles: {
    id: 'subtitles',
    version: 'v1',
    summary: 'Submit a subtitle burn job.',
    input: SubtitleToolInputSchema,
    output: SubtitleToolOutputSchema,
  },
} as const satisfies Record<string, ToolContract<z.ZodTypeAny, z.ZodTypeAny>>;

export type V1MandatoryToolId = keyof typeof V1_MANDATORY_TOOL_CONTRACTS;

export function generateV1ToolContractSchemas(): Record<string, { input: unknown; output: unknown }> {
  const out: Record<string, { input: unknown; output: unknown }> = {};
  for (const [id, def] of Object.entries(V1_MANDATORY_TOOL_CONTRACTS)) {
    const inSchema = zodToJsonSchema(def.input, { name: `${id}_input`, $refStrategy: 'none' }) as any;
    const outSchema = zodToJsonSchema(def.output, { name: `${id}_output`, $refStrategy: 'none' }) as any;
    out[id] = {
      input: inSchema.definitions?.[`${id}_input`] ?? inSchema,
      output: outSchema.definitions?.[`${id}_output`] ?? outSchema,
    };
  }
  return out;
}
