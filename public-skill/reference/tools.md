# Tools

The hosted connector's `tools/list` on the loose surface, with each input schema rendered from the same zod definitions the server validates with (`packages/schema/src/v2/generate.ts`). If this page and `tools/list` ever disagree, `tools/list` wins and CI is broken.

## generate_video

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "minLength": 3,
      "maxLength": 4000,
      "description": "The shot, as a director would say it: who (age, look), where (setting, light), what happens, camera (phone framing), and — if anyone speaks — the exact words in quotes. ~2.3 words per second."
    },
    "model": {
      "type": "string",
      "description": "A live video model id from list_models. Omit for the default (seedance-2.0). seedance-2.5 is ~3x the credits — hero clips only."
    },
    "refs": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 4,
      "description": "Reference images (https URLs, up to 4): a portrait, a character sheet, a product shot. The model keeps that identity/look across clips. Omit to let the model invent the person."
    },
    "seconds": {
      "type": "integer",
      "minimum": 4,
      "maximum": 15,
      "default": 5,
      "description": "Clip length in seconds, 4–15. Credits = seconds x the model rate."
    },
    "aspect": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1"
      ],
      "default": "9:16",
      "description": "9:16 vertical (default) or 1:1."
    },
    "audio": {
      "type": "boolean",
      "default": true,
      "description": "Render native audio (speech from the quoted words, ambience). false = silent clip."
    },
    "seed": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647,
      "description": "Same seed + same inputs = the same clip (best effort). Reuse across a series."
    }
  },
  "required": [
    "prompt"
  ],
  "additionalProperties": false
}
```

## generate_image

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "minLength": 3,
      "maxLength": 4000,
      "description": "What to paint. Be concrete: subject, age, framing, light, lens, mood, what the hands do."
    },
    "model": {
      "type": "string",
      "description": "A live image model id from list_models. Omit for the default (gpt-image-2)."
    },
    "refs": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 4,
      "description": "Reference images (https URLs, up to 4). With refs the model EDITS/composes from them (a product into a hand, a portrait re-lit); without, it paints from the prompt alone."
    },
    "size": {
      "type": "string",
      "enum": [
        "1024x1024",
        "1024x1536",
        "1536x1024"
      ],
      "default": "1024x1536",
      "description": "1024x1536 portrait (default, for 9:16 video), 1024x1024 square, 1536x1024 landscape."
    }
  },
  "required": [
    "prompt"
  ],
  "additionalProperties": false
}
```

## generate_audio

```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000,
      "description": "The words to speak. Emotion tags like [excited] or [whispers] are honoured. 1 credit per 100 characters."
    },
    "model": {
      "type": "string",
      "description": "A live audio model id from list_models. Omit for the default (elevenlabs-tts)."
    },
    "voice": {
      "type": "string",
      "minLength": 1,
      "default": "sarah",
      "description": "A voice name: jessica (young female), sarah (female), liam (young male), chris (male), lily (elder female), bill (elder male), matilda (warm) — or a raw ElevenLabs voice id."
    },
    "tone": {
      "type": "string",
      "enum": [
        "energetic",
        "calm",
        "confident",
        "dramatic"
      ],
      "description": "energetic | calm | confident | dramatic."
    }
  },
  "required": [
    "text"
  ],
  "additionalProperties": false
}
```

## quote

```json
{
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "image",
        "video",
        "audio"
      ]
    },
    "input": {
      "type": "object",
      "description": "The exact arguments you would pass to generate_<kind>."
    }
  },
  "required": [
    "kind",
    "input"
  ],
  "additionalProperties": false
}
```

## list_models

```json
{
  "type": "object",
  "properties": {
    "include_candidates": {
      "type": "boolean",
      "description": "Also return planned models (no price, not selectable). Default false."
    }
  },
  "additionalProperties": false
}
```

## list_characters

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "description": "Max characters to return (default 50)."
    }
  },
  "additionalProperties": false
}
```

## get_run_status

```json
{
  "type": "object",
  "properties": {
    "run_id": {
      "type": "string",
      "description": "The run_id / skill_run_id / job_id returned when you submitted."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the run finishes or ~2 minutes elapse (default false)."
    }
  },
  "required": [
    "run_id"
  ],
  "additionalProperties": false
}
```

## upload_image

```json
{
  "type": "object",
  "properties": {
    "image_base64": {
      "type": "string",
      "description": "The image bytes, base64-encoded. A `data:image/png;base64,...` prefix is accepted and stripped."
    },
    "image_url": {
      "type": "string",
      "description": "An https URL to fetch and re-host instead. Use this OR image_base64, not both."
    }
  },
  "additionalProperties": false
}
```
