<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# `agent-media selfie`

AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance.

## When to use

Generate a 9:16 vertical TikTok-style selfie clip. Pick a saved character (--character) OR pass a photo + description inline. The pipeline composes a portrait → multi-pose character sheet → photographic storyboard/wireframe board, then Seedance 2.0 animates the scene with native audio. Output: an mp4 hosted on R2. Intermediate portrait, sheet, and wireframe URLs are surfaced on the job status while the video runs.

## CLI

```bash
agent-media selfie --description "25yo asian woman, long wavy dark hair, soft smile" --script "I keep getting DMs about my hair oil routine" --scene-action "standing by a bright vanity, showing a small amber hair-oil bottle and scrunching one curl mid-line" --duration 10
agent-media selfie --character char_8x2vqp --script "..." --scene-action "sitting at a desk, gesturing toward an open laptop beside them" --duration 10
agent-media selfie --photo me.png --description "25yo creator, casual black tee" --script "..." --duration 10
```

## MCP tool

`create_selfie`

## REST

`POST /v2/selfie`

## Input schema

```json
{
  "type": "object",
  "properties": {
    "character_id": {
      "type": "string",
      "pattern": "^char_[A-Za-z0-9]{10,}$"
    },
    "photo_url": {
      "type": "string",
      "format": "uri"
    },
    "description": {
      "type": "string",
      "minLength": 8,
      "maxLength": 400
    },
    "script": {
      "type": "string",
      "maxLength": 600
    },
    "scene_action": {
      "type": "string",
      "minLength": 4,
      "maxLength": 400
    },
    "background_music": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "string",
          "minLength": 2,
          "maxLength": 200
        }
      ]
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10,
        15
      ],
      "default": 10
    },
    "subtitles": {
      "type": "boolean",
      "default": true
    },
    "shot_preset": {
      "type": "string"
    },
    "vibe": {
      "type": "string",
      "enum": [
        "excited",
        "calm",
        "sassy",
        "serious",
        "curious"
      ]
    },
    "camera_locked": {
      "type": "boolean",
      "default": true
    },
    "phone_in_frame": {
      "type": "string",
      "enum": [
        "forbidden",
        "optional",
        "required"
      ],
      "default": "forbidden"
    },
    "polish": {
      "type": "string",
      "enum": [
        "off",
        "default",
        "heavy"
      ]
    }
  },
  "additionalProperties": false
}
```

## Related references

- [`../conversation-flow.md`](../conversation-flow.md) — MUST-READ before calling this command
- [`../subtitle-styles.md`](../subtitle-styles.md) — all 17 subtitle styles
- [`../realism-rubric.md`](../realism-rubric.md) — visual-quality guard
