// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Subtitle input schema.
 *
 * Burns styled subtitles onto an existing video. Takes a public video
 * URL, transcribes via Whisper (or accepts a caller-supplied transcript
 * to skip transcription), generates an ASS subtitle file in the chosen
 * style, and burns it into a new mp4 via ffmpeg.
 *
 * Output: a new mp4 URL on R2.
 */

import { z } from 'zod';

// The 17 styles the ASS generator already supports (mirrors the legacy
// SUBTITLE_STYLES list in packages/schema/src/video.ts).
export const V2_SUBTITLE_STYLES = [
  'hormozi',
  'minimal',
  'bold',
  'karaoke',
  'clean',
  'tiktok',
  'neon',
  'fire',
  'glow',
  'pop',
  'aesthetic',
  'impact',
  'pastel',
  'electric',
  'boxed',
  'gradient',
  'spotlight',
] as const;
export type V2SubtitleStyle = (typeof V2_SUBTITLE_STYLES)[number];

export const SubtitleSchema = z.object({
  // The video to subtitle. Must be a publicly-fetchable URL — R2, S3,
  // any CDN. We download, transcribe, burn, re-host.
  video_url: z.string().url(),

  // Visual style. Defaults to hormozi because that's what most users
  // want for short-form vertical content.
  style: z.enum(V2_SUBTITLE_STYLES).default('hormozi'),

  // Optional override. When set, we skip Whisper and use this text as
  // the transcript. Useful when the caller already has the script
  // (e.g. they just generated the video from a known script).
  transcript: z.string().min(1).max(5000).optional(),

  // Spoken language hint for Whisper. ISO 639-1 (`en`, `es`, `pt`,
  // …) or null to let Whisper detect. Most callers pass null.
  language: z
    .string()
    .length(2)
    .regex(/^[a-z]{2}$/, 'language must be a lowercase ISO 639-1 code')
    .optional(),
});

export type SubtitleInput = z.infer<typeof SubtitleSchema>;
