<!--
  AUTO-GENERATED — do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# agent-media v2 — API reference

_Public REST surface for v2 generators (Selfie, Character). Auth is a Bearer API key (`ma_xxx`)._

**Base URL:** `https://api.agent-media.ai`

## Endpoints

- [`POST /v2/selfie` — AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance.](#selfie)
- [`POST /v2/characters` — Create a reusable AI character from a single photo.](#character_create)
- [`POST /v2/subtitle` — Burn styled subtitles onto an existing video.](#subtitle)
- [`POST /v2/crazy-look` — Silent extreme close-up reaction clip with a static caption overlay ("the crazy look").](#crazy_look)

---

## selfie

`POST /v2/selfie`

Generate a 9:16 vertical TikTok-style selfie clip. Pick a saved character (--character) OR pass a photo + description inline. The pipeline composes a portrait → multi-pose character sheet → photographic storyboard/wireframe board, then Seedance 2.0 animates the scene with native audio. Output: an mp4 hosted on R2. Intermediate portrait, sheet, and wireframe URLs are surfaced on the job status while the video runs.

### Request body

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
    },
    "engine": {
      "type": "string",
      "enum": [
        "seedance-2.0",
        "seedance-2.5"
      ],
      "default": "seedance-2.0"
    }
  },
  "additionalProperties": false
}
```

### Response

Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries `video_url`.

#### Submission (201)

```json
{
  "job_id": "<uuid>",
  "status": "submitted",
  "generator": "selfie"
}
```

### CLI examples

```bash
agent-media selfie --description "25yo asian woman, long wavy dark hair, soft smile" --script "I keep getting DMs about my hair oil routine" --scene-action "standing by a bright vanity, showing a small amber hair-oil bottle and scrunching one curl mid-line" --duration 10
agent-media selfie --character char_8x2vqp --script "..." --scene-action "sitting at a desk, gesturing toward an open laptop beside them" --duration 10
agent-media selfie --photo me.png --description "25yo creator, casual black tee" --script "..." --duration 10
```

---

## character_create

`POST /v2/characters`

Persists a character so subsequent video calls can reference it by id. Two gpt-image-2 calls (portrait + multi-pose character sheet) are made at create time and cached in R2. A pinned Seedance seed is stored on the row. Returns: { character_id }.

### Request body

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
    },
    "signature_look": {
      "type": "string"
    }
  },
  "required": [
    "display_name",
    "description"
  ],
  "additionalProperties": false
}
```

### Response

Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries the new `character_id` (`char_xxxxxxxxxx`).

#### Submission (201)

```json
{
  "job_id": "<uuid>",
  "status": "submitted",
  "generator": "character_create"
}
```

### CLI examples

```bash
agent-media character create --name "sofia" --description "25yo asian woman, long wavy dark hair, soft smile"
agent-media character create --name "sofia" --description "..." --photo me.png
```

---

## subtitle

`POST /v2/subtitle`

Downloads the source video, transcribes it with Whisper (or accepts a caller-supplied transcript), generates an ASS subtitle file in the chosen style (Hormozi by default; 17 styles available), and burns the subs into a new mp4 via ffmpeg. Output: a new mp4 URL on R2. Source video is fetched once and discarded.

### Request body

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

### Response

Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries `video_url`.

#### Submission (201)

```json
{
  "job_id": "<uuid>",
  "status": "submitted",
  "generator": "subtitle"
}
```

### CLI examples

```bash
agent-media subs --video https://r2/clip.mp4 --style hormozi
agent-media subs --video https://r2/clip.mp4 --transcript "exact script text" --style neon
```

---

## crazy_look · _beta_

`POST /v2/crazy-look`

Generate a 5–10s vertical 9:16 reaction clip: one character, extreme close-up (face fills most of the frame), an exaggerated silent expression held straight into the lens, and a static caption burned over the full clip. No speech, no lip-sync, no TTS — the caption is the hook, the face is the reaction. Ambient room tone is kept (no music); creators add trending sounds in their editor. Pick a look preset (bug-eyed-shock, jaw-drop, unhinged-grin, …) or pass "custom:<text>"; omit `look` and the worker picks one at random. The expression is DYNAMIC — the face morphs through randomized silent beats (brow pops, mouth drops, eye darts, head tilts); `chaos` (0–1, default 0.6) sets how wild the evolution gets so repeated calls with the same caption produce varied reactions — the format is a volume play: same hook, many looks, one recurring character. `framing` rotates crop levels (full-face, eyes-only, mouth-only, nose-up, medium) and is sampled per job when omitted; warm looks (sweet-smile, giggle-fit) give contrast beats between the shocked faces. THE FIRST FRAME IS THE LOOK: at 0.0s the face is already at peak expression (no build-up), and a saved character keeps the SAME signature look on every clip unless `look` is passed explicitly — that recurring face is what makes a feed recognisable. A SERIES MUST START WITH A CHARACTER SHEET: run character_create first — the saved sheet + pinned seed keeps the SAME face on every clip. Inline description invents a NEW person per clip; use it only for a one-off test. Output: an mp4 hosted on R2.

### Request body

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
    },
    "engine": {
      "type": "string",
      "enum": [
        "seedance-2.0",
        "seedance-2.5"
      ],
      "default": "seedance-2.0"
    }
  },
  "required": [
    "caption"
  ],
  "additionalProperties": false
}
```

### Response

Returns a job submission. Poll `GET /v1/videos/{job_id}` until `status: "completed"`; the final row carries `video_url`.

#### Submission (201)

```json
{
  "job_id": "<uuid>",
  "status": "submitted",
  "generator": "crazy_look"
}
```

### CLI examples

```bash
agent-media crazy-look --character char_8x2vqp --caption "WAIT there's an app that LOCKS your phone until you PRAY???"
agent-media crazy-look --character char_8x2vqp --caption "how do you pray so consistently???" --look bug-eyed-shock --duration 10
agent-media crazy-look --description "21yo woman, long brown wavy hair, argyle cardigan" --caption "it took me 21 years to realize this" --look "custom:slowly raises one eyebrow, then breaks into a huge grin"
```

## The loose surface — `POST /v2/generate/{kind}`

Three primitives with no recipe: your prompt, your model, your reference images. This is what the hosted MCP connector exposes as `generate_video`, `generate_image`, `generate_audio` and `quote`. The fixed generators above stay on REST for the dashboard.

| Route | Body | Credits |
|---|---|---|
| `POST /v2/generate/video` | GenerateVideo (below) | seconds × the model rate — 150 for 5s on `seedance-2.0`, 495 on `seedance-2.5` |
| `POST /v2/generate/image` | GenerateImage | 20 per image on `gpt-image-2` |
| `POST /v2/generate/audio` | GenerateAudio | 1 per 100 characters on `elevenlabs-tts`, rounded up |
| `POST /v2/quote/{kind}` | the same body | 0 — returns `{ credits, usd, model, breakdown }` without running |

Response: `201 { job_id, status: "submitted", kind, model, credits_deducted, breakdown, status_url }`. Poll `GET /v1/videos/{job_id}`; `video_url` holds the output URL for every kind (png, mp4 or mp3). A failed job refunds automatically.

`model` must be a **live** catalog id of the right kind (`GET /v1/models`); a planned id is a `400 VALIDATION_ERROR` whose message lists the live ones. Omit it for the default. `refs` must be https URLs (`POST /v1/uploads/image` turns bytes into one). Bodies are strict: an unknown field is a 400, never silently ignored.

### GenerateVideo

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

### GenerateImage

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

### GenerateAudio

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

```bash
curl -X POST https://api.agent-media.ai/v2/generate/video \
  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \
  -d '{ "prompt": "A 28-year-old woman in a bright kitchen, phone framing, holds a serum bottle to the lens and says: \"Okay, I did not expect this to work.\"", "seconds": 5 }'
# -> 201 { "job_id": "...", "credits_deducted": 150, ... }
curl https://api.agent-media.ai/v1/videos/<job_id> -H "Authorization: Bearer ma_..."
```

---

## Shared

### Connecting an agent (no API key)

Driving agent-media from Claude, Claude Code, Cursor or Codex? Skip the API key entirely — add the hosted MCP connector, one URL with browser sign-in:

```
https://api.agent-media.ai/mcp
```

Claude (web or desktop): Settings → Connectors → Add custom connector. Claude Code: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`. Full guide: https://agent-media.ai/connect

Over MCP, always call `get_run_status` with the id you were given after submitting — generation is async and the submit response only confirms the job started.

If you have image bytes (a photo the user attached, a `data:` URL), call `upload_image` first and pass the https URL it returns. Never inline base64 into a generation call: the client prints tool arguments in the chat, so the user sees a wall of base64, and every retry re-sends it. `upload_image` costs no credits.

### Models

`GET /v1/models` (public, no key) and the `list_models` MCP tool return the model catalog with user prices, limits and what each model is good and bad at. Live today:

| Model | Kind | Tier | User price | Selectable via |
|---|---|---|---|---|
| `seedance-2.0` (default) | video | standard | 30 credits/second | `model` on `/v2/generate/video` and the `generate_video` MCP tool; `engine` on `/v2/selfie`, `/v2/crazy-look`, CLI `--engine` |
| `seedance-2.5` | video | premium | 99 credits/second | `model` on `/v2/generate/video` and the `generate_video` MCP tool; `engine` on `/v2/selfie`, `/v2/crazy-look`, CLI `--engine` |
| `gpt-image-2` (default) | image | standard | 20 credits/image | `model` on `/v2/generate/image` and the `generate_image` MCP tool |
| `elevenlabs-tts` (default) | audio | standard | 0.01 credits/character | `model` on `/v2/generate/audio` and the `generate_audio` MCP tool |

Planned, not selectable and unpriced until a real run is recorded: `seedance-2.0-mini`, `kling-o3`, `wan-3.0`, `omnihuman-1.5`, `sora-2`, `nano-banana-2`, `seedream-5.0-pro`, `z-image-turbo`, `doubao-seed-audio-1.0`, `suno`. One page per model lives under `docs/models/`.

`make_ugc` (REST, the dashboard) always renders on the default engine (`seedance-2.0`); it has no engine field.

### Authentication

Every v2 REST request sends `Authorization: Bearer ma_xxx`. Get a key via `agent-media login` (CLI) or the dashboard. (Not needed for the MCP connector above.)

### Polling

`GET /v1/videos/{job_id}` returns the same shape for v1 and v2 jobs. v2-specific fields:

- `character_id` — present on jobs that create a v2 character (`char_xxxxxxxxxx`).
- `video_url` — present on completed jobs; for `generate_image` / `generate_audio` jobs it holds the png / mp3 URL.

### Selfie pipeline artifacts

Selfie jobs expose intermediate URLs while processing:

- `portrait_url` — generated actor face portrait, unless reusing a saved character.
- `character_sheet_url` / `sheet_url` — full-body multi-angle character reference.
- `wireframe_url` — photographic storyboard/wireframe board with 8-10 frames and captions.
- `video_url` / `result_url` — final Seedance MP4 after completion.

Agents should surface each artifact as soon as it appears in status instead of waiting silently for the final video.
