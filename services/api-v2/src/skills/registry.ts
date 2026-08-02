// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * vNext skill registry.
 *
 * A "micro-skill" is a named, versioned wrapper around exactly one
 * primitive — the smallest user-facing unit in the Skill Center. For V1
 * this is an in-code map; a future skill marketplace will persist this
 * shape to a `skills` table.
 *
 * Composed skills (multi-step graphs) will land in a separate file and
 * use the same workflow-type dispatch — micro-skills just happen to
 * point at the existing primitive workflows.
 */

import { z } from 'zod';
import {
  PortraitGpt2ToolInputSchema,
  CharacterSheetGpt2ToolInputSchema,
  SimpleSelfieToolInputSchema,
  SubtitlesV2ToolInputSchema,
  WireframeGpt2ToolInputSchema,
  LipSyncToolInputSchema,
  BrollTalkingHeadToolInputSchema,
} from '@agentmedia/schema';

/**
 * User-facing skill input for make_ugc_video. The user supplies EXACTLY
 * ONE source of identity (description, portrait_url, or portrait_image_base64).
 * The route normalizes base64 → R2 upload before workflow start.
 *
 * Word count for `script` is validated by duration (2-4 words/sec).
 */
export const MakeUgcVideoSkillInputSchema = z
  .object({
    description: z.string().min(8).max(400).optional(),
    portrait_url: z.string().url().optional(),
    portrait_image_base64: z.string().min(64).optional(),
    character_description: z
      .string()
      .max(80)
      .refine((s) => s.trim().split(/\s+/).filter(Boolean).length <= 10, {
        message: 'character_description must be at most 10 words',
      })
      .optional(),
    script: z.string().min(1).max(600).describe('Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing — about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user\'s line if it is longer.'),
    duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
    location: z.string().max(120).optional(),
    pose: z.string().max(120).optional(),
    realism_target: z.enum(['natural', 'commercial', 'raw_iphone']).default('natural'),
    aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
    subtitles: z.boolean().default(true),
    subtitles_style: z.enum(['hormozi', 'tiktok', 'minimal']).default('hormozi'),
  })
  .refine(
    (d) => {
      const sources = [d.description, d.portrait_url, d.portrait_image_base64].filter(Boolean);
      return sources.length === 1;
    },
    {
      message:
        'provide EXACTLY one of: description (text-to-video), portrait_url (R2-hosted), or portrait_image_base64 (uploaded image)',
    },
  )
  .refine(
    (d) => {
      const wc = d.script.trim().split(/\s+/).filter(Boolean).length;
      return wc >= d.duration && wc <= Math.round(d.duration * 2.2);
    },
    (d) => ({
      message: `script should be about ${d.duration}-${Math.round(d.duration * 2.2)} words for a ${d.duration}s clip — keep it short for natural, unhurried pacing (~1.5 words/sec)`,
      path: ['script'],
    }),
  );

/**
 * make_ugc — the single agent-facing UGC facade. Props-based and self-describing
 * (each `.describe()` is the agent's manual). It is a ROUTER: skills.ts resolves
 * identity + picks an existing skill (make_ugc_video / make_simple_selfie /
 * make_broll_talking_head) and delegates. No new generation, no new workflow.
 */
export const MakeUgcSkillInputSchema = z
  .object({
    script: z
      .string()
      .min(1)
      .max(1200)
      .describe(
        'What the person SAYS (lip-synced) — any length. A one-liner makes one clip; a full monologue makes the full multi-take video automatically, never trimmed. Usually the only field you set.',
      )
      .optional(),
    scene_action: z
      .string()
      .min(3)
      .max(400)
      .describe('A silent action clip (dancing, b-roll, vibes), no dialogue. Use instead of script; needs a `character`.')
      .optional(),
    person: z
      .string()
      .min(8)
      .max(400)
      .describe('Describe the person in words. Omit if you pass image or character.')
      .optional(),
    image: z
      .string()
      .describe('A photo of the person — public https URL OR base64 data URL / raw base64. The face is locked to it.')
      .optional(),
    character: z
      .string()
      .describe('Reuse a saved character: its character_id (char_…) OR its character_sheet_url from list_characters.')
      .optional(),
    product_image: z
      .string()
      .describe(
        'A photo of a PRODUCT to show/hold/wear — public https URL OR base64 data URL / raw base64. Turns the video into a product ad; needs a `character` to hold it.',
      )
      .optional(),
    name: z.string().max(80).describe("Name/age/vibe hint, e.g. 'Sophia, 28'.").optional(),
    broll_url: z
      .string()
      .url()
      .regex(/^https:\/\//, 'broll_url must use https')
      .describe('A b-roll / gameplay / product video overlaid on the lower half while the person narrates.')
      .optional(),
    // Honest description. It used to read "Set only to force a short clip",
    // which was not true of any path that has a `script`: decideMakeUgcRoute
    // overwrites duration with fitDuration(script) on all three of them, so an
    // agent that asked for 5s on a 12-word line silently got — and was billed
    // for — 10s. It is not a bug in the router: a take's script must land in
    // [duration, round(duration * 2.2)] or the renderer rejects it, so a
    // caller-supplied duration that disagrees with the word count cannot be
    // honoured. Length follows the script, and the way to get a short clip is
    // to write a short line.
    duration: z
      .union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(25), z.literal(30)])
      .describe(
        'IGNORED when `script` is set — length is derived from the word count (≤11 words → 5s, ≤22 → 10s, else 15s) because the renderer requires the script to fit the take. To get a shorter clip, write a shorter script. Only used for a silent `scene_action` clip, which has no words to measure.',
      )
      .optional(),
    captions: z
      .boolean()
      .describe('Burn in TikTok/Hormozi captions. OFF unless set true — ASK the user whether they want captions (and which caption_style) before generating; never add captions unprompted.')
      .optional(),
    caption_style: z.enum(['hormozi', 'tiktok', 'minimal']).default('hormozi'),
    look: z.enum(['natural', 'commercial', 'raw_iphone']).default('natural'),
    aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
    music: z.union([z.boolean(), z.string().max(120)]).optional(),
  })
  .refine((d) => Boolean(d.script) || Boolean(d.scene_action), {
    message: 'provide either script (what they say) or scene_action (a silent clip)',
    path: ['script'],
  })
  .refine((d) => [d.person, d.image, d.character].filter(Boolean).length <= 1, {
    message: 'pass at most one of person, image, or character',
    path: ['person'],
  });

/**
 * User-facing skill input for make_character_sheet. Accepts EITHER an
 * R2-hosted portrait_url OR a base64-encoded portrait image
 * (portrait_image_base64). The route normalizes the base64 case into
 * an R2 upload before validating against CharacterSheetGpt2ToolInputSchema.
 */
export const MakeCharacterSheetSkillInputSchema = z
  .object({
    portrait_url: z.string().url().optional(),
    portrait_image_base64: z.string().min(64).optional(),
    description: z
      .string()
      .max(80)
      .refine((s) => s.trim().split(/\s+/).filter(Boolean).length <= 10, {
        message: 'description must be at most 10 words',
      })
      .optional(),
    aspect_ratio: z.enum(['1:1', '9:16']).default('1:1'),
  })
  .refine(
    (d) => Boolean(d.portrait_url) !== Boolean(d.portrait_image_base64),
    {
      message:
        'provide exactly one of portrait_url (R2-hosted) or portrait_image_base64 (data URL or raw base64)',
    },
  );

/**
 * User-facing skill input for make_product_in_hands. The character sheet must
 * already be R2-hosted (it comes from make_character_sheet). The PRODUCT image
 * may be ANY https URL OR a base64 image — the route re-hosts it onto
 * agent-media R2 before the primitive runs. Exactly one product source.
 * Speech path = script; non-speech path = scene_action (silent demo).
 */
export const MakeProductInHandsSkillInputSchema = z
  .object({
    character_sheet_url: z.string().url().regex(/^https:\/\//, 'character_sheet_url must use https'),
    product_image_url: z.string().url().regex(/^https:\/\//, 'product_image_url must use https').optional(),
    product_image_base64: z.string().min(64).optional(),
    duration: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
    script: z.string().min(1).max(600).describe('Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing — about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user\'s line if it is longer.').optional(),
    scene_action: z.string().min(3).max(400).optional(),
    subject: z.string().max(80).optional(),
    framing: z.enum(['close_up', 'full_body']).default('close_up'),
    background_music: z.union([z.boolean(), z.string().max(120)]).optional(),
    location: z.string().max(120).optional(),
    pose: z.string().max(120).optional(),
    aspect_ratio: z.enum(['9:16', '1:1']).default('9:16'),
  })
  .refine((d) => Boolean(d.product_image_url) !== Boolean(d.product_image_base64), {
    message: 'provide exactly one of product_image_url (any https URL) or product_image_base64 (data URL or raw base64)',
    path: ['product_image_url'],
  })
  .refine((d) => Boolean(d.script) || Boolean(d.scene_action), {
    message: 'provide either script (what they say about the product) or scene_action (how they demo it)',
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

/**
 * User-facing skill input for make_podcast. Two SAVED characters (or image URLs)
 * hold a scripted A/B conversation in one shared room; the camera cuts to whoever
 * is speaking and each actor stays in their identical seat/desk/mic across cuts.
 */
export const PODCAST_MAX_TURNS = 24;

const PodcastTurnSchema = z.object({
  speaker: z.enum(['A', 'B']).describe('Which of the two actors speaks this turn.'),
  // A take must fill at least a 5s clip (~1 word/sec), so each turn needs >=5
  // words; a bare interjection ("Exactly.") can't be its own clip — fold it into
  // an adjacent line. Long lines auto-split into <=15s takes.
  line: z
    .string()
    .min(1)
    .max(600)
    .refine((s) => s.trim().split(/\s+/).filter(Boolean).length >= 5, {
      message: 'each turn needs at least 5 words so it fills a clip — merge a very short interjection (e.g. "Exactly.") into an adjacent line',
    })
    .describe('What they say (native lip-synced voice), at least 5 words. Long lines auto-split into ≤15s takes.'),
});

export const MakePodcastSkillInputSchema = z
  .object({
    character_a: z
      .string()
      .min(3)
      .max(400)
      .describe('First speaker: a saved character_id (char_… from list_characters), OR an https image URL (portrait / character sheet).'),
    character_b: z
      .string()
      .min(3)
      .max(400)
      .describe('Second speaker: a DIFFERENT saved character_id (char_…) OR an https image URL.'),
    script: z
      .array(PodcastTurnSchema)
      .min(1)
      .max(PODCAST_MAX_TURNS)
      .describe('Ordered dialogue turns, each { speaker: "A" | "B", line: "…" }. The camera cuts to whoever is speaking.'),
    room: z
      .string()
      .min(4)
      .max(240)
      .optional()
      .describe('The shared studio look (desk, mics, lighting). Defaults to a warm modern podcast studio.'),
    aspect_ratio: z.literal('9:16').default('9:16'),
    subtitles: z
      .boolean()
      .default(false)
      .describe('Burn TikTok/Hormozi captions. OPT-IN — ask the user whether they want captions before generating; leave off unless they say yes.'),
    subtitles_style: z.enum(['hormozi', 'tiktok', 'minimal']).default('hormozi'),
  })
  .refine((d) => d.character_a.trim() !== d.character_b.trim(), {
    message: 'character_a and character_b must be two different characters',
    path: ['character_b'],
  });

export interface SkillEntry {
  slug: string;
  name: string;
  version: string;
  description: string;
  /** Primitive id this skill is a wrapper around. */
  primitive: string;
  /** Temporal workflow type name registered by primitive-worker-vnext. */
  workflowType: string;
  /** User-facing input schema. */
  inputSchema: z.ZodTypeAny;
  /** When true, this is the curated agent surface (make_ugc). The MCP tools/list
   *  and public-skill pack filter to these once MAKE_UGC_ENABLED is on. */
  agentFacing?: boolean;
}

export const SKILLS: Record<string, SkillEntry> = {
  make_portrait: {
    slug: 'make_portrait',
    name: 'Make Portrait',
    version: '1.0.0',
    description:
      'Generate one photoreal portrait. Optionally takes a reference photo (R2-hosted) and a realism preset. Identity is locked from the reference image when provided.',
    primitive: 'portrait_gpt2',
    workflowType: 'portraitGpt2Workflow',
    inputSchema: PortraitGpt2ToolInputSchema,
  },
  make_character_sheet: {
    slug: 'make_character_sheet',
    name: 'Make Character Sheet',
    version: '1.0.0',
    description:
      'Generate a magazine-style character sheet from a portrait. Provide EITHER portrait_url (must be R2-hosted) OR portrait_image_base64 (PNG/JPEG, ≤10 MB; the API will upload it to R2 first). Optional ≤10-word description for name/age/vibe hints.',
    primitive: 'character_sheet_gpt2',
    workflowType: 'characterSheetGpt2Workflow',
    inputSchema: MakeCharacterSheetSkillInputSchema,
  },
  make_simple_selfie: {
    slug: 'make_simple_selfie',
    name: 'Make Simple Selfie',
    version: '1.0.0',
    description:
      'Generate a 5/10/15-second vertical UGC selfie video from a character sheet. Two modes: provide a script for a lip-synced talking-head (2-4 words/sec), OR provide scene_action for a non-speech clip (dancing, b-roll, vibes) with optional background_music and no dialogue. Subject is framed waist-up, hands free, TikTok aesthetic.',
    primitive: 'simple_selfie',
    workflowType: 'simpleSelfieWorkflow',
    inputSchema: SimpleSelfieToolInputSchema,
  },
  make_product_in_hands: {
    slug: 'make_product_in_hands',
    name: 'Make Product In Hands',
    version: '1.0.0',
    description:
      'Generate a 5/10/15s vertical UGC video where your character holds, wears, and shows a product. Provide a character_sheet_url (R2-hosted) and the product image (product_image_url — any https URL — OR product_image_base64; re-hosted to R2 automatically). Two modes: script for a lip-synced talking-head product review (2-4 words/sec), OR scene_action for a silent demo / b-roll. Set subject (e.g. "a young woman") to lock the person\'s gender/appearance so a gendered product can\'t drift it. framing: "close_up" (chest-up, default) or "full_body" (head-to-toe, for turn-arounds / showing the whole outfit). Both the person and the exact product are locked from the reference images.',
    primitive: 'product_in_hands',
    workflowType: 'productInHandsWorkflow',
    inputSchema: MakeProductInHandsSkillInputSchema,
  },
  make_subtitles: {
    slug: 'make_subtitles',
    name: 'Make Subtitles',
    version: '1.0.0',
    description:
      'Burn TikTok / Hormozi-style captions onto any vNext video (R2-hosted). Auto-transcribes via Whisper when transcript is omitted. Styles: hormozi (default), tiktok, minimal.',
    primitive: 'subtitles_v2',
    workflowType: 'subtitlesWorkflow',
    inputSchema: SubtitlesV2ToolInputSchema,
    // A7: captioning an existing video is a distinct intent (no routing authority
    // leaked — MakeUgcProps has no video field), so make_subtitles is agent-facing.
    agentFacing: true,
  },
  make_wireframe: {
    slug: 'make_wireframe',
    name: 'Make Wireframe',
    version: '1.0.0',
    description:
      'Generate a photographic storyboard / wireframe board from a character sheet (R2-hosted) + script. Multi-panel grid showing the same person performing the action progression, 4 / 6 / 8 / 10 numbered panels.',
    primitive: 'wireframe_gpt2',
    workflowType: 'wireframeGpt2Workflow',
    inputSchema: WireframeGpt2ToolInputSchema,
  },
  make_lip_sync: {
    slug: 'make_lip_sync',
    name: 'Make Lip Sync',
    version: '1.0.0',
    description:
      'Bring your own audio: lip-sync a face (an R2-hosted image / character sheet, OR an existing clip) to a provided audio track. No text-to-speech or voice cloning — the character speaks your uploaded recording. Output is a 9:16 talking-head video.',
    primitive: 'lip_sync',
    workflowType: 'lipSyncWorkflow',
    inputSchema: LipSyncToolInputSchema,
  },
  make_ugc_video: {
    slug: 'make_ugc_video',
    name: 'Make UGC Video',
    version: '1.0.0',
    description:
      'End-to-end UGC video in one call. Provide EITHER a text description of the person, OR a portrait URL (R2-hosted), OR an uploaded image. The pipeline auto-generates the missing portrait, builds a character sheet, and produces a 5/10/15s vertical selfie video with native lip-synced audio of your script.',
    primitive: 'composed:make_ugc_video',
    workflowType: 'makeUgcVideoWorkflow',
    inputSchema: MakeUgcVideoSkillInputSchema,
  },
  make_broll_talking_head: {
    slug: 'make_broll_talking_head',
    name: 'Make B-roll Talking Head',
    version: '1.3.0',
    description:
      'Vertical talking-head video sized to your script — chunked into as many seamless, cross-dissolved <=15s takes as the words need (a ~110-word monologue becomes ~4 takes / ~40-50s): the actor speaks full-frame. An OPTIONAL b-roll video is overlaid on the lower half while they narrate (face stays clear up top) — OMIT broll_video_url for a plain monologue with no overlay. REVIEW STYLE — put a line containing only `---` in the script to split an INTRO (actor speaks to camera, no b-roll yet — e.g. "Today we are going to review the game of X vs Y") from the MOVES narration after it; the b-roll appears when the moves begin and loop-fills through to the end while the actor narrates, and the moves take continues seamlessly from the intro\'s last frame and the same voice (guaranteed continuity, not a jump-cut). Without `---` it is a plain talking head (<=15s single take; 16-30s two takes) with the b-roll placed via broll_start_time. Provide actor_image_url (any https image) and EITHER script (Seedance voice) OR audio_url (your own audio, single clip <=15s); broll_video_url (any https video) is OPTIONAL — include it to overlay b-roll, omit it for a plain talking head. External actor_image_url/broll_video_url are re-hosted to R2 automatically. Optional: subtitles; broll_width_rate (0.1-1.0, e.g. 0.8 = b-roll 80% width centered with black margins; omit for full width); broll_start_time (override when the b-roll appears); broll_fade_out (dissolve the b-roll at its end).',
    primitive: 'composed:broll_talking_head',
    workflowType: 'brollTalkingHeadWorkflow',
    inputSchema: BrollTalkingHeadToolInputSchema,
  },
  make_podcast: {
    slug: 'make_podcast',
    name: 'Make Podcast',
    version: '1.0.0',
    description:
      'Two saved characters recording a podcast in ONE room — the camera cuts to whoever is speaking, and each actor stays in their IDENTICAL seat, desk and mic position across every cut. Provide character_a and character_b (saved char_… ids from list_characters, or https image URLs) and an ordered `script` of A/B dialogue turns (each { speaker: "A" | "B", line: "…" }). The pipeline renders ONE shared two-shot, locks a close-up per actor, animates every turn with native lip-synced Seedance voice (each actor keeps a consistent look AND voice across the whole episode), and hard-cuts the turns together as a 9:16 vertical video. Long turns auto-split into ≤15s takes. Captions are OPT-IN — ask the user first, then set subtitles:true.',
    primitive: 'composed:make_podcast',
    workflowType: 'makePodcastWorkflow',
    inputSchema: MakePodcastSkillInputSchema,
    agentFacing: true,
  },
  make_ugc: {
    slug: 'make_ugc',
    name: 'Agent-Media UGC Video',
    version: '1.0.0',
    description:
      'The ONE tool for UGC video. Give a `script` (any length) and optionally a `person` description, an `image` (photo), or a `character` (saved char_… or sheet URL); it returns the finished vertical video. Short script → one clip; long monologue → full multi-take (never trimmed); pass `broll_url` → narrated b-roll overlay. Captions are OPT-IN — ASK the user if they want them (and which style) before generating; set `captions:true` only if they say yes. You never pick a sub-tool.',
    // Router-only: dispatchMakeUgc resolves identity, picks an existing skill, and
    // delegates. These two fields are not used for make_ugc itself (it owns no
    // workflow) but keep the SkillEntry shape uniform.
    primitive: 'composed:make_ugc',
    workflowType: 'makeUgcVideoWorkflow',
    inputSchema: MakeUgcSkillInputSchema,
    agentFacing: true,
  },
};

export function listSkills(): Array<Omit<SkillEntry, 'inputSchema'>> {
  return Object.values(SKILLS).map(({ inputSchema: _omit, ...rest }) => rest);
}

export function getSkill(slug: string): SkillEntry | undefined {
  return SKILLS[slug];
}
