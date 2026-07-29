// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Hand-coded per-skill form definitions for the Skill Center detail
 * pages. Hand-coded today; the json_schema in /v1/skills could drive
 * this dynamically once we have a JSON-schema → React-form helper.
 */

export type Field =
  | { kind: 'text'; name: string; label: string; placeholder?: string; required?: boolean; textarea?: boolean; help?: string }
  | { kind: 'select'; name: string; label: string; options: string[]; defaultValue?: string; help?: string }
  | { kind: 'number-select'; name: string; label: string; options: number[]; defaultValue?: number }
  | { kind: 'boolean'; name: string; label: string; defaultValue?: boolean }
  // File drop-zone / picker → base64 data URL. Submitted under `name`
  // (e.g. product_image_base64); the API re-hosts it to R2.
  | { kind: 'image'; name: string; label: string; help?: string };

export interface SkillForm {
  fields: Field[];
  composed: boolean;
}

export const FORMS: Record<string, SkillForm> = {
  make_ugc: {
    composed: true,
    fields: [
      { kind: 'text', name: 'script', label: 'Script — what they say', placeholder: 'Okay this completely changed how I work — I plan my whole week in ten minutes now.', textarea: true, help: 'Any length — a line makes one clip, a monologue makes a multi-take video. Never trimmed.' },
      { kind: 'text', name: 'person', label: 'Person (describe in words)', placeholder: 'a friendly young woman, soft daylight', help: 'OR upload a photo / reuse a saved character below — at most one.' },
      { kind: 'image', name: 'image', label: '…or upload a photo of the person', help: 'The face is locked to it.' },
      { kind: 'text', name: 'character', label: '…or reuse a saved character', placeholder: 'char_… or a character_sheet_url', help: 'Skips generating a new face.' },
      { kind: 'text', name: 'name', label: 'Name / vibe hint (optional)', placeholder: 'Sophia, 28' },
      { kind: 'text', name: 'broll_url', label: 'B-roll video URL (optional)', placeholder: 'https://…mp4 — narrated overlay / review', help: 'The person narrates over this footage.' },
      { kind: 'text', name: 'scene_action', label: 'Silent clip (instead of a script)', placeholder: 'dancing freestyle, smiling at camera', help: 'Use instead of a script for a non-speech clip. Needs a saved character.' },
      { kind: 'boolean', name: 'captions', label: 'Captions', defaultValue: false },
      { kind: 'select', name: 'caption_style', label: 'Caption style', options: ['hormozi', 'tiktok', 'minimal'], defaultValue: 'hormozi' },
      { kind: 'select', name: 'look', label: 'Look', options: ['natural', 'commercial', 'raw_iphone'], defaultValue: 'natural' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1'], defaultValue: '9:16' },
    ],
  },
  make_portrait: {
    composed: false,
    fields: [
      { kind: 'text', name: 'description', label: 'Description', placeholder: 'a friendly 28yo woman, soft window daylight, candid framing', required: true, textarea: true },
      { kind: 'text', name: 'setting', label: 'Setting (optional)', placeholder: 'bright kitchen, neutral background' },
      { kind: 'select', name: 'realism_target', label: 'Realism', options: ['natural', 'commercial', 'raw_iphone'], defaultValue: 'natural' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['1:1', '9:16'], defaultValue: '1:1' },
    ],
  },
  make_character_sheet: {
    composed: false,
    fields: [
      { kind: 'text', name: 'portrait_url', label: 'Portrait URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true },
      { kind: 'text', name: 'description', label: 'Description (≤10 words)', placeholder: 'Sara, 28 years old' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['1:1', '9:16'], defaultValue: '1:1' },
    ],
  },
  make_simple_selfie: {
    composed: false,
    fields: [
      { kind: 'text', name: 'character_sheet_url', label: 'Character sheet URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true },
      { kind: 'text', name: 'script', label: 'Script (speech mode)', placeholder: 'Honestly, this app changed my whole morning routine.', textarea: true, help: 'What they SAY (lip-synced). 2–4 words/sec. Leave empty for a non-speech clip and fill Scene action instead.' },
      { kind: 'text', name: 'scene_action', label: 'Scene action (non-speech mode)', placeholder: 'dancing freestyle to upbeat music, smiling at camera', help: 'What they DO, no dialogue. Use instead of script for dancing / b-roll / vibes.' },
      { kind: 'text', name: 'background_music', label: 'Background music (optional)', placeholder: 'lo-fi jazz — or leave empty' },
      { kind: 'number-select', name: 'duration', label: 'Duration (s)', options: [5, 10, 15], defaultValue: 10 },
      { kind: 'text', name: 'location', label: 'Location (optional)', placeholder: 'bright kitchen window light' },
      { kind: 'text', name: 'pose', label: 'Pose (optional)', placeholder: 'leaning slightly on counter' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1'], defaultValue: '9:16' },
    ],
  },
  make_product_in_hands: {
    composed: false,
    fields: [
      { kind: 'text', name: 'character_sheet_url', label: 'Character sheet URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true },
      { kind: 'text', name: 'product_image_url', label: 'Product image URL (any https URL)', placeholder: 'https://...jpg — or use the upload below', help: 'A photo of the product the actor will hold. Provide a URL OR upload a file below (not both). It is re-hosted to agent-media R2 automatically.' },
      { kind: 'image', name: 'product_image_base64', label: '…or upload a product image', help: 'PNG/JPEG, ≤10 MB. Use this OR the URL above.' },
      { kind: 'text', name: 'subject', label: 'Subject (locks gender/appearance)', placeholder: 'a young woman', help: 'Recommended. e.g. "a young woman", "a man in his 40s" — stops a gendered product (e.g. a football kit) from drifting the person.' },
      { kind: 'select', name: 'framing', label: 'Framing', options: ['close_up', 'full_body'], defaultValue: 'close_up', help: 'close_up = chest-up holding the product. full_body = head-to-toe, for turn-arounds / showing the whole outfit.' },
      { kind: 'text', name: 'script', label: 'Script (speech mode)', placeholder: 'Okay I am obsessed with this — my hair has never felt softer.', textarea: true, help: 'What they SAY while holding the product (lip-synced). 2–4 words/sec. Leave empty for a silent demo and fill Scene action instead.' },
      { kind: 'text', name: 'scene_action', label: 'Scene action (non-speech mode)', placeholder: 'turning around slowly to show the full outfit front and back', help: 'How they demo the product, no dialogue. Use instead of script. Great with full_body framing.' },
      { kind: 'text', name: 'background_music', label: 'Background music (optional)', placeholder: 'lo-fi jazz — or leave empty' },
      { kind: 'number-select', name: 'duration', label: 'Duration (s)', options: [5, 10, 15], defaultValue: 10 },
      { kind: 'text', name: 'location', label: 'Location (optional)', placeholder: 'bright kitchen window light' },
      { kind: 'text', name: 'pose', label: 'Pose (optional)', placeholder: 'holding the product up near face' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1'], defaultValue: '9:16' },
    ],
  },
  make_subtitles: {
    composed: false,
    fields: [
      { kind: 'text', name: 'video_url', label: 'Video URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true },
      { kind: 'text', name: 'transcript', label: 'Transcript (optional)', placeholder: 'leave empty to auto-transcribe via Whisper', textarea: true },
      { kind: 'select', name: 'style', label: 'Style', options: ['hormozi', 'tiktok', 'minimal'], defaultValue: 'hormozi' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1', '16:9'], defaultValue: '9:16' },
    ],
  },
  make_wireframe: {
    composed: false,
    fields: [
      { kind: 'text', name: 'character_sheet_url', label: 'Character sheet URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true },
      { kind: 'text', name: 'script', label: 'Action script', placeholder: 'walks into bedroom, picks up phone, smiles, hits record, talks to camera', required: true, textarea: true, help: 'Short description of the action progression. gpt-image-2 will draw N numbered panels showing it.' },
      { kind: 'number-select', name: 'n_panels', label: 'Panels', options: [4, 6, 8, 10], defaultValue: 6 },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1', '16:9'], defaultValue: '9:16' },
    ],
  },
  make_lip_sync: {
    composed: false,
    fields: [
      { kind: 'text', name: 'image_url', label: 'Face image URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true, help: 'A portrait or character-sheet image of the person who will speak.' },
      { kind: 'text', name: 'audio_url', label: 'Your audio URL (R2-hosted)', placeholder: 'https://pub-...r2.dev/vnext/...', required: true, help: 'An MP3/WAV recording of the voice. The character lip-syncs to THIS audio — no text-to-speech, bring your own voice.' },
      { kind: 'number-select', name: 'duration', label: 'Duration (s)', options: [5, 10, 15], defaultValue: 10 },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1'], defaultValue: '9:16' },
    ],
  },
  make_ugc_video: {
    composed: true,
    fields: [
      { kind: 'text', name: 'description', label: 'Person description (leave empty if you pass a portrait_url instead)', placeholder: 'a friendly young woman, soft daylight', textarea: true },
      { kind: 'text', name: 'portrait_url', label: 'Portrait URL (optional, R2-hosted)' },
      { kind: 'text', name: 'character_description', label: 'Character one-liner (≤10 words)', placeholder: 'Sara, 28 years old' },
      { kind: 'text', name: 'script', label: 'Script', placeholder: 'Okay this is wild — try this.', required: true, textarea: true, help: '2–4 words per second of duration.' },
      { kind: 'number-select', name: 'duration', label: 'Duration (s)', options: [5, 10, 15], defaultValue: 10 },
      { kind: 'text', name: 'location', label: 'Location (optional)' },
      { kind: 'text', name: 'pose', label: 'Pose (optional)' },
      { kind: 'select', name: 'realism_target', label: 'Realism', options: ['natural', 'commercial', 'raw_iphone'], defaultValue: 'natural' },
      { kind: 'select', name: 'aspect_ratio', label: 'Aspect ratio', options: ['9:16', '1:1'], defaultValue: '9:16' },
      { kind: 'boolean', name: 'subtitles', label: 'Burn subtitles', defaultValue: true },
      { kind: 'select', name: 'subtitles_style', label: 'Subtitles style', options: ['hormozi', 'tiktok', 'minimal'], defaultValue: 'hormozi' },
    ],
  },
};
