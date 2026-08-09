<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# `agent-media crazy-look` · _beta_

Silent extreme close-up reaction clip with a static caption overlay ("the crazy look").

## When to use

Generate a 5–10s vertical 9:16 reaction clip: one character, extreme close-up (face fills most of the frame), an exaggerated silent expression held straight into the lens, and a static caption burned over the full clip. No speech, no lip-sync, no TTS — the caption is the hook, the face is the reaction. Ambient room tone is kept (no music); creators add trending sounds in their editor. Pick a look preset (bug-eyed-shock, jaw-drop, unhinged-grin, …) or pass "custom:<text>"; omit `look` and the worker picks one at random. The expression is DYNAMIC — the face morphs through randomized silent beats (brow pops, mouth drops, eye darts, head tilts); `chaos` (0–1, default 0.6) sets how wild the evolution gets so repeated calls with the same caption produce varied reactions — the format is a volume play: same hook, many looks, one recurring character. Use a saved character (--character) for a consistent face across the series. Output: an mp4 hosted on R2.

## CLI

```bash
agent-media crazy-look --character char_8x2vqp --caption "WAIT there's an app that LOCKS your phone until you PRAY???"
agent-media crazy-look --character char_8x2vqp --caption "how do you pray so consistently???" --look bug-eyed-shock --duration 10
agent-media crazy-look --description "21yo woman, long brown wavy hair, argyle cardigan" --caption "it took me 21 years to realize this" --look "custom:slowly raises one eyebrow, then breaks into a huge grin"
```

## MCP tool

`create_crazy_look`

## REST

`POST /v2/crazy-look`

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
    "caption": {
      "type": "string",
      "minLength": 2,
      "maxLength": 220
    },
    "look": {
      "type": "string"
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10
      ],
      "default": 5
    },
    "chaos": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "framing": {
      "type": "string",
      "enum": [
        "full-face",
        "eyes-only",
        "mouth-only",
        "nose-up",
        "medium"
      ]
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
  "required": [
    "caption"
  ],
  "additionalProperties": false
}
```

## Related references

- [`../subtitle-styles.md`](../subtitle-styles.md) — all 17 styles
