# Tools

The hosted connector's `tools/list` on the loose surface, with each input schema rendered from the same zod definitions the server validates with (`packages/schema/src/v2/generate.ts`). If this page and `tools/list` ever disagree, `tools/list` wins and CI is broken.

Optional tools open_upload_panel and get_uploads appear only when temporary uploads are enabled. Discover them before use.

When the user wants to provide a product photo, portrait, screenshot, or image reference, check tools/list. If open_upload_panel is available, offer it first: call open_upload_panel with {}, show its inline panel or returned browser link, and wait for the user to finish. Then call get_uploads with the returned session_id and use the exact ready image_url in refs, first_frame, last_frame, or the matching skill image field. Do not start a reference-dependent generation until the required images are ready. The panel accepts still PNG, JPEG, and WebP, up to 10 images and 25 MB each. Images expire 24 hours after the panel is created; show the returned expiry, request a new upload if expired, and never make a permanent copy. Uploading uses no generation credits. Do not ask the user for base64, shell commands, or a public hosting service; do not continuously poll while waiting for them. Only call these tool names when discovered. If they are missing from the connected tool catalog, call upload_image with {} to open the same panel; use the returned panel: upload_key with upload_image to retrieve images after the user finishes. If that reports the panel is unavailable, use upload_image only for an already accessible file or URL. Do not build an upload page or request a local folder as a substitute for the existing panel. Never invent access to a chat attachment: if you cannot read it, explain that and offer the panel when available. Browser fallback works without inline UI support; do not promise an inline panel in every client.
Uploading stores an image; it does not attach it to a generation automatically. If the user already requested a generation with these images, continue that request using the returned URLs; do not stop at "upload complete" or ask again whether to use them. For generate_image, put the relevant image_url values in refs. For generate_video, use refs for product/person/appearance references, or first_frame for animating a still (last_frame only for an explicitly requested ending frame); never combine refs with frame fields. Preserve the user's intended image roles and model limits; ask only if the role or selection is unclear. For a fixed skill, use its declared image field. Include the URL in the tool arguments, not only in the prompt. Do not substitute a newly generated image for the uploaded reference. If the request was upload-only, report readiness and wait for a generation request; uploading alone does not authorize spending credits. After submitting, poll get_run_status and return the result.

The JSON schema is the envelope; the per-model, per-mode limits (seconds, aspects, qualities, how many refs of each kind) are checked at submit against the catalog cell, see [models.md](models.md).

## generate_video

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "minLength": 3,
      "maxLength": 4000,
      "description": "The shot, as a director would say it: who (age, look), where (setting, light), what happens, camera (phone framing), and, if anyone speaks, the exact words in quotes. About 2.3 words per second. With references, address them as @image1, @video1, @audio1."
    },
    "model": {
      "type": "string",
      "description": "A live video model id from list_models, or \"auto\" to let agent-media pick from recent results. Omit for the default. Call list_models for what each model is good for, its modes, limits and price."
    },
    "first_frame": {
      "type": "string",
      "format": "uri",
      "description": "IMAGE-TO-VIDEO: an https image that becomes frame one of the clip (a still you want animated, a product shot, a portrait). Cannot be combined with refs, video_refs or audio_refs on Seedance."
    },
    "last_frame": {
      "type": "string",
      "format": "uri",
      "description": "Optional with first_frame: the image the clip ends on; the model animates from first to last."
    },
    "refs": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 30,
      "description": "REFERENCE-TO-VIDEO: image references (https URLs): a portrait, a character sheet from list_characters, a product photo. The model keeps that identity/look. Address them in the prompt as @image1, @image2..."
    },
    "video_refs": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 10,
      "description": "Reference clips (https mp4/mov) whose motion, framing or look the model should follow; @video1... in the prompt. Their seconds are billed like output seconds."
    },
    "audio_refs": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "maxItems": 10,
      "description": "Reference audio (https wav/mp3): a voice or a sound the clip should carry; @audio1... in the prompt."
    },
    "seconds": {
      "type": "integer",
      "minimum": 1,
      "maximum": 60,
      "default": 5,
      "description": "Clip length in seconds (the model sets the range; seedance: 4 to 15). Credits = seconds x the per-second rate at the chosen quality."
    },
    "aspect": {
      "type": "string",
      "enum": [
        "9:16",
        "16:9",
        "1:1",
        "4:3",
        "3:4",
        "21:9",
        "adaptive"
      ],
      "description": "9:16 (default for text and reference), 16:9, 1:1, 4:3, 3:4, 21:9, or adaptive (follows the first frame or reference; the default and the only option in image mode on seedance-2.5)."
    },
    "quality": {
      "type": "string",
      "enum": [
        "480p",
        "720p",
        "1080p"
      ],
      "default": "720p",
      "description": "480p (cheapest), 720p (default), 1080p (dearest). Price per second differs; see list_models."
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
      "description": "Only for models whose mode lists seed support (none of the live Seedance modes). Refused elsewhere."
    },
    "request_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._:-]{1,128}$",
      "description": "Unique request identity (prefer a UUID). Reuse with identical inputs to recover the same job after a lost response; choose a new identity only for an intentionally new generation."
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
      "description": "A live image model id from list_models, or \"auto\" to let agent-media pick from recent results. Omit for the default (gpt-image-2)."
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
    },
    "request_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._:-]{1,128}$",
      "description": "Unique request identity (prefer a UUID). Reuse with identical inputs to recover the same job after a lost response; choose a new identity only for an intentionally new generation."
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
      "description": "The words to speak. Emotion tags like [excited] or [whispers] are honoured. Priced per character; see list_models."
    },
    "model": {
      "type": "string",
      "description": "A live audio model id from list_models, or \"auto\". Omit for the default (elevenlabs-tts)."
    },
    "voice": {
      "type": "string",
      "minLength": 1,
      "default": "sarah",
      "description": "A voice name: jessica (young female), sarah (female), liam (young male), chris (male), lily (elder female), bill (elder male), matilda (warm), or a raw ElevenLabs voice id."
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
    },
    "request_id": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._:-]{1,128}$",
      "description": "Unique request identity (prefer a UUID). Reuse with identical inputs to recover the same job after a lost response; choose a new identity only for an intentionally new generation."
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
      "description": "Block until the run finishes or ~45 seconds elapse (default false). A video needs several such calls; just call again."
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
    "file_bytes": {
      "type": "integer",
      "description": "Step 1 of the file path: the exact size of the file in bytes (`wc -c < photo.png`). Returns a put_url and an upload_key. Full resolution, up to 25 MB."
    },
    "file_name": {
      "type": "string",
      "description": "Optional with file_bytes: the file name, so the content type is right (.png or .jpg)."
    },
    "upload_key": {
      "type": "string",
      "description": "Reuse the exact upload_key returned earlier: a panel: key retrieves all ready temporary images; a file upload key confirms the completed PUT and returns its image_url."
    },
    "image_base64": {
      "type": "string",
      "description": "The image bytes, base64-encoded. A `data:image/png;base64,...` prefix is accepted and stripped. Last resort: use file_bytes when you can run a shell."
    },
    "image_url": {
      "type": "string",
      "description": "An https URL to fetch and re-host instead."
    }
  },
  "additionalProperties": false
}
```

## rate_run

```json
{
  "type": "object",
  "properties": {
    "run_id": {
      "type": "string",
      "description": "The job id the generate tool returned."
    },
    "score": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "1 = unusable, 3 = usable with edits, 5 = shipped as-is."
    },
    "note": {
      "type": "string",
      "maxLength": 1000,
      "description": "One line on why (optional)."
    }
  },
  "required": [
    "run_id",
    "score"
  ],
  "additionalProperties": false
}
```

## open_upload_panel

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

## get_uploads

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "session_id"
  ],
  "additionalProperties": false
}
```
