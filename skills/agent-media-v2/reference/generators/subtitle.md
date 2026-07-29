<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# `agent-media subs`

Burn styled subtitles onto an existing video.

## When to use

Downloads the source video, transcribes it with Whisper (or accepts a caller-supplied transcript), generates an ASS subtitle file in the chosen style (Hormozi by default; 17 styles available), and burns the subs into a new mp4 via ffmpeg. Output: a new mp4 URL on R2. Source video is fetched once and discarded.

## CLI

```bash
agent-media subs --video https://r2/clip.mp4 --style hormozi
agent-media subs --video https://r2/clip.mp4 --transcript "exact script text" --style neon
```

## MCP tool

`create_subtitle`

## REST

`POST /v2/subtitle`

## Input schema

```json
{
  "type": "object",
  "properties": {
    "video_url": {
      "type": "string",
      "format": "uri"
    },
    "style": {
      "type": "string",
      "enum": [
        "hormozi",
        "minimal",
        "bold",
        "karaoke",
        "clean",
        "tiktok",
        "neon",
        "fire",
        "glow",
        "pop",
        "aesthetic",
        "impact",
        "pastel",
        "electric",
        "boxed",
        "gradient",
        "spotlight"
      ],
      "default": "hormozi"
    },
    "transcript": {
      "type": "string",
      "minLength": 1,
      "maxLength": 5000
    },
    "language": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2,
      "pattern": "^[a-z]{2}$"
    }
  },
  "required": [
    "video_url"
  ],
  "additionalProperties": false
}
```

## Related references

- [`../subtitle-styles.md`](../subtitle-styles.md) — all 17 styles
