// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Generator registry.
 *
 * Greenfield registry for the v2 product line. Lives alongside the
 * legacy `GENERATORS` export in ../generators.ts but in its own file
 * with a richer record shape — CLI / MCP / REST / pricing metadata
 * baked in so the SDK, CLI, MCP server, docs and SKILL.md can all
 * derive themselves from this one source.
 *
 * Old code keeps reading `GENERATORS` from ../generators.ts. New code
 * imports `V2_GENERATORS` from here. Two surfaces, zero shared state.
 *
 * The new website + docs + SKILL.md only see v2.
 */

import type { z } from 'zod';
import { SelfieSchema } from './selfie.js';
import { CharacterCreateSchema } from './character.js';
import { SubtitleSchema } from './subtitle.js';
import { CrazyLookSchema } from './crazy-look.js';

// ── Record shape ──────────────────────────────────────────────────────────

/**
 * Lifecycle. Two states only — by design.
 *   `stable`: fully exposed, no warnings.
 *   `beta`:   exposed, SDK/CLI print a one-time warning, MCP tool
 *             description starts with "[beta]".
 *
 * Retired ops are deleted from the registry, not deprecated. There's
 * no `deprecated` tier because old code stays in its own place.
 */
export type V2Status = 'stable' | 'beta';

export interface V2GeneratorRecord {
  id: string;
  status: V2Status;

  summary: string;       // single line, used in CLI help and tool listings
  description: string;   // multi-line, used in docs and MCP tool registration

  /** Zod schema. The contract. */
  inputSchema: z.ZodTypeAny;

  /** What the generator returns. Affects how the SDK types the response. */
  output: 'video_url' | 'character_id' | 'subtitled_video_url';

  /** CLI surface. Omit to hide from the CLI. */
  cli?: {
    command: string;         // e.g. "selfie", "character create"
    fileFields?: string[];   // input fields that take --foo file.png and need upload coercion
    examples?: string[];
  };

  /** MCP surface. Omit to hide from the MCP server. */
  mcp?: {
    toolName: string;        // e.g. "create_selfie"
  };

  /** REST surface. Omit to hide from the public API. */
  rest?: {
    method: 'POST' | 'GET';
    path: string;            // e.g. "/v2/selfie"
  };

  /** Pricing. Single source so dashboard + CLI quoting + webhook agree. */
  pricing?:
    | { basis: 'per_clip'; baseCredits: number; perSecondCredits: number }
    | { basis: 'one_shot'; baseCredits: number };
}

// ── The registry ──────────────────────────────────────────────────────────

export const V2_GENERATORS: Record<string, V2GeneratorRecord> = {
  selfie: {
    id: 'selfie',
    status: 'stable',
    summary: 'AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance.',
    description:
      'Generate a 9:16 vertical TikTok-style selfie clip. Pick a saved character (--character) ' +
      'OR pass a photo + description inline. The pipeline composes a portrait → multi-pose ' +
      'character sheet → photographic storyboard/wireframe board, then Seedance 2.0 animates ' +
      'the scene with native audio. Output: an mp4 hosted on R2. Intermediate portrait, sheet, ' +
      'and wireframe URLs are surfaced on the job status while the video runs.',
    inputSchema: SelfieSchema,
    output: 'video_url',

    cli: {
      command: 'selfie',
      fileFields: ['photo_url'],
      examples: [
        // Lead with the description-only case (the default, no photo needed).
        'agent-media selfie --description "25yo asian woman, long wavy dark hair, soft smile" --script "I keep getting DMs about my hair oil routine" --scene-action "standing by a bright vanity, showing a small amber hair-oil bottle and scrunching one curl mid-line" --duration 10',
        // Reuse a saved character across multiple videos.
        'agent-media selfie --character char_8x2vqp --script "..." --scene-action "sitting at a desk, gesturing toward an open laptop beside them" --duration 10',
        // Pin an exact real-person likeness (optional — only when the user provides a photo).
        'agent-media selfie --photo me.png --description "25yo creator, casual black tee" --script "..." --duration 10',
      ],
    },
    mcp: { toolName: 'create_selfie' },
    rest: { method: 'POST', path: '/v2/selfie' },

    // Cost math (list price, 70% margin floor):
    //   5s   = $0.63 cost → 210 credits ($2.10)
    //   8s   = $0.93 cost → 310 credits ($3.10)
    //   12s  = $1.33 cost → 445 credits ($4.45)
    //   15s  = $1.63 cost → 545 credits ($5.45)
    // Linear in duration after a fixed prelude (~$0.13 of gpt-image-2 + R2)
    // so we express as base + per-second.
    pricing: { basis: 'per_clip', baseCredits: 75, perSecondCredits: 30 },
  },

  character_create: {
    id: 'character_create',
    status: 'stable',
    summary: 'Create a reusable AI character from a single photo.',
    description:
      'Persists a character so subsequent video calls can reference it by id. Two gpt-image-2 ' +
      'calls (portrait + multi-pose character sheet) are made at create time and cached in R2. ' +
      'A pinned Seedance seed is stored on the row. Returns: { character_id }.',
    inputSchema: CharacterCreateSchema,
    output: 'character_id',

    cli: {
      command: 'character create',
      fileFields: ['photo_url'],
      examples: [
        // Default: description-only — agent-media generates the portrait, no photo upload.
        'agent-media character create --name "sofia" --description "25yo asian woman, long wavy dark hair, soft smile"',
        // Optional: pass a real-person photo when the user wants an exact likeness.
        'agent-media character create --name "sofia" --description "..." --photo me.png',
      ],
    },
    mcp: { toolName: 'create_character' },
    rest: { method: 'POST', path: '/v2/characters' },

    // ~$0.08 our cost → 27 credits at 70% margin.
    pricing: { basis: 'one_shot', baseCredits: 27 },
  },

  subtitle: {
    id: 'subtitle',
    status: 'stable',
    summary: 'Burn styled subtitles onto an existing video.',
    description:
      'Downloads the source video, transcribes it with Whisper (or accepts a caller-supplied ' +
      'transcript), generates an ASS subtitle file in the chosen style (Hormozi by default; ' +
      '17 styles available), and burns the subs into a new mp4 via ffmpeg. Output: a new ' +
      'mp4 URL on R2. Source video is fetched once and discarded.',
    inputSchema: SubtitleSchema,
    output: 'video_url',

    cli: {
      // Command is `subs` (not `subtitle`) because `agent-media subtitle`
      // is already registered by the legacy CLI surface. Both routes
      // live in parallel: the legacy `subtitle` command calls the v1
      // worker via /v1/generate/subtitle, the new `subs` command calls
      // the v2 worker via /v2/subtitle.
      command: 'subs',
      examples: [
        'agent-media subs --video https://r2/clip.mp4 --style hormozi',
        'agent-media subs --video https://r2/clip.mp4 --transcript "exact script text" --style neon',
      ],
    },
    mcp: { toolName: 'create_subtitle' },
    rest: { method: 'POST', path: '/v2/subtitle' },

    // Cost basis:
    //   Whisper: $0.006 / minute of audio → trivial at < 60s
    //   ffmpeg compute: a few cents at most for a short clip
    //   R2 download + re-upload: rounding error
    // Realistic our-cost for an 8s clip: < $0.01. For a 60s clip: ~$0.02.
    //
    // FLAT, not per-second. Per-second pricing was the original intent, but the
    // caller does not know the video's length at submit time (it would need a
    // HEAD + ffprobe first), so /v2/subtitle billed a hardcoded 30s placeholder
    // — 90 credits for every clip regardless of length — and the webhook
    // "reconciliation" that was supposed to correct it afterwards was never
    // built. The result was the SAME operation costing 90 credits through
    // /v2/subtitle and 15 through the make_subtitles skill: a 6x split for
    // identical work.
    //
    // Since our cost is ~$0.01-0.02 either way, per-second precision buys
    // nothing here. One flat price of 15 credits matches SUBTITLES_CREDITS in
    // api-v2's credit-quotes.ts, so every surface (REST route, skill, CLI,
    // webhook, dashboard) now quotes the same number — and there is no phantom
    // reconciliation step to implement.
    pricing: { basis: 'one_shot', baseCredits: 15 },
  },

  crazy_look: {
    id: 'crazy_look',
    status: 'beta',
    summary: 'Silent extreme close-up reaction clip with a static caption overlay ("the crazy look").',
    description:
      'Generate a 5–10s vertical 9:16 reaction clip: one character, extreme close-up (face fills ' +
      'most of the frame), an exaggerated silent expression held straight into the lens, and a ' +
      'static caption burned over the full clip. No speech, no lip-sync, no TTS — the caption is ' +
      'the hook, the face is the reaction. Ambient room tone is kept (no music); creators add ' +
      'trending sounds in their editor. Pick a look preset (bug-eyed-shock, jaw-drop, ' +
      'unhinged-grin, …) or pass "custom:<text>"; omit `look` and the worker picks one at random. The expression is DYNAMIC \u2014 the face morphs through randomized silent beats (brow pops, mouth drops, eye darts, head tilts); `chaos` (0\u20131, default 0.6) sets how wild the evolution gets ' +
      'so repeated calls with the same caption produce varied reactions — the format is a volume ' +
      'play: same hook, many looks, one recurring character. Use a saved character (--character) ' +
      'for a consistent face across the series. Output: an mp4 hosted on R2.',
    inputSchema: CrazyLookSchema,
    output: 'video_url',

    cli: {
      command: 'crazy-look',
      fileFields: ['photo_url'],
      examples: [
        // The volume workflow — saved character, random look each call.
        'agent-media crazy-look --character char_8x2vqp --caption "WAIT there\'s an app that LOCKS your phone until you PRAY???"',
        // Pin a specific look + longer hold.
        'agent-media crazy-look --character char_8x2vqp --caption "how do you pray so consistently???" --look bug-eyed-shock --duration 10',
        // Inline character (no saved character yet) + freetext look.
        'agent-media crazy-look --description "21yo woman, long brown wavy hair, argyle cardigan" --caption "it took me 21 years to realize this" --look "custom:slowly raises one eyebrow, then breaks into a huge grin"',
      ],
    },
    mcp: { toolName: 'create_crazy_look' },
    rest: { method: 'POST', path: '/v2/crazy-look' },

    // Cost math, following selfie's basis (list price, 70% margin floor):
    // same Seedance per-second burn, but NO orchestrator LLM call and NO
    // TTS/Whisper — the preset + caption fully determine every stage. In
    // saved-character mode only 1 gpt-image-2 call (wireframe) runs, in
    // inline mode 3. The caption burn is ffmpeg, rounding error.
    //   5s  = ~$0.55 cost → 200 credits ($2.00)
    //   10s = ~$1.00 cost → 350 credits ($3.50)
    pricing: { basis: 'per_clip', baseCredits: 50, perSecondCredits: 30 },
  },
} as const;

export type V2GeneratorId = keyof typeof V2_GENERATORS;

export const V2_GENERATOR_IDS = Object.keys(V2_GENERATORS) as V2GeneratorId[];

/**
 * Pricing helper. Single source for CLI quoting, webhook, dashboard.
 */
export function quoteV2Credits(id: V2GeneratorId, opts: { durationSeconds?: number } = {}): number {
  const def = V2_GENERATORS[id];
  if (!def?.pricing) return 0;
  if (def.pricing.basis === 'one_shot') return def.pricing.baseCredits;
  const seconds = opts.durationSeconds ?? 8;
  return def.pricing.baseCredits + def.pricing.perSecondCredits * seconds;
}
