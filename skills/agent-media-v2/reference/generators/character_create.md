<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# `agent-media character create`

Create a reusable AI character from a single photo.

## When to use

Persists a character so subsequent video calls can reference it by id. Two gpt-image-2 calls (portrait + multi-pose character sheet) are made at create time and cached in R2. A pinned Seedance seed is stored on the row. Returns: { character_id }.

## CLI

```bash
agent-media character create --name "sofia" --description "25yo asian woman, long wavy dark hair, soft smile"
agent-media character create --name "sofia" --description "..." --photo me.png
```

## MCP tool

`create_character`

## REST

`POST /v2/characters`

## Input schema

```json
{
  "type": "object",
  "properties": {
    "photo_url": {
      "type": "string",
      "format": "uri"
    },
    "display_name": {
      "type": "string",
      "minLength": 2,
      "maxLength": 40,
      "pattern": "^[A-Za-z0-9 _-]+$"
    },
    "description": {
      "type": "string",
      "minLength": 8,
      "maxLength": 400
    },
    "voice_brief": {
      "type": "string",
      "minLength": 4,
      "maxLength": 240
    },
    "preset_default": {
      "type": "string",
      "enum": [
        "bedroom-morning-ritual",
        "getting-ready-mirror-edge",
        "bathroom-skincare-routine",
        "bedside-lamp-evening",
        "kitchen-glow-up",
        "backyard-morning-coffee",
        "picnic-blanket-outdoor",
        "car-quick-honest-review",
        "car-passenger-honest",
        "outdoor-walking-talking",
        "couch-haul-show-off",
        "closet-fit-check",
        "studio-apartment-tour",
        "balcony-evening-vibes",
        "desk-wfh-quick-pitch",
        "cafe-window-seat",
        "office-bathroom-discreet",
        "gym-post-workout",
        "salon-mirror-result",
        "travel-hotel-room-review"
      ]
    }
  },
  "required": [
    "display_name",
    "description"
  ],
  "additionalProperties": false
}
```

## Related references

- [`../conversation-flow.md`](../conversation-flow.md) — MUST-READ before calling this command
- [`./selfie.md`](./selfie.md) — once you have a `char_…`, use it here
