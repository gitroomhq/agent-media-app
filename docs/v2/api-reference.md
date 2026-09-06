<!--
  AUTO-GENERATED, do not hand-edit.
  Source: packages/schema/src/v2/generators.ts
  Regenerate: pnpm --filter @agentmedia/schema gen:v2-docs
-->

# agent-media v2, API reference

_Public REST surface for v2 generators (Selfie, Character). Auth is a Bearer API key (`ma_xxx`)._

**Base URL:** `https://api.agent-media.ai`

## Endpoints

- [`POST /v2/selfie`, AI UGC selfie video with generated actor, character sheet, storyboard board, and Seedance.](#selfie)
- [`POST /v2/characters`, Create a reusable AI character from a single photo.](#character_create)
- [`POST /v2/subtitle`, Burn styled subtitles onto an existing video.](#subtitle)
- [`POST /v2/crazy-look`, Silent extreme close-up reaction clip with a static caption overlay ("the crazy look").](#crazy_look)

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

Generate a 5 to 10s vertical 9:16 reaction clip: one character, extreme close-up (face fills most of the frame), an exaggerated silent expression held straight into the lens, and a static caption burned over the full clip. No speech, no lip-sync, no TTS, the caption is the hook, the face is the reaction. Ambient room tone is kept (no music); creators add trending sounds in their editor. Pick a look preset (bug-eyed-shock, jaw-drop, unhinged-grin, …) or pass "custom:<text>"; omit `look` and the worker picks one at random. The expression is DYNAMIC, the face morphs through randomized silent beats (brow pops, mouth drops, eye darts, head tilts); `chaos` (0 to 1, default 0.6) sets how wild the evolution gets so repeated calls with the same caption produce varied reactions, the format is a volume play: same hook, many looks, one recurring character. `framing` rotates crop levels (full-face, eyes-only, mouth-only, nose-up, medium) and is sampled per job when omitted; warm looks (sweet-smile, giggle-fit) give contrast beats between the shocked faces. THE FIRST FRAME IS THE LOOK: at 0.0s the face is already at peak expression (no build-up), and a saved character keeps the SAME signature look on every clip unless `look` is passed explicitly, that recurring face is what makes a feed recognisable. A SERIES MUST START WITH A CHARACTER SHEET: run character_create first, the saved sheet + pinned seed keeps the SAME face on every clip. Inline description invents a NEW person per clip; use it only for a one-off test. Output: an mp4 hosted on R2.

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

## The loose surface: `POST /v2/generate/{kind}`

Three primitives with no recipe: your prompt, your model, your frames or references. This is what the hosted MCP connector exposes as `generate_video`, `generate_image`, `generate_audio` and `quote`. The fixed generators above stay on REST for the dashboard.

| Route | Body | Credits |
|---|---|---|
| `POST /v2/generate/video` | GenerateVideo (below) | seconds x the model rate at the chosen quality: 150 for 5s on `seedance-2.0` at 720p (75 at 480p, 375 at 1080p), 495 on `seedance-2.5` at 720p; reference clip seconds (video_refs) are billed at the same rate (300 for 5s plus a 5s reference clip) |
| `POST /v2/generate/image` | GenerateImage | 20 per image on `gpt-image-2` |
| `POST /v2/generate/audio` | GenerateAudio | 1 per 100 characters on `elevenlabs-tts`, rounded up |
| `POST /v2/quote/{kind}` | the same body | 0: returns `{ credits, usd, model, mode?, quality?, breakdown, auto? }` without running |
| `POST /v1/runs/{job_id}/rate` | `{ score: 1..5, note? }` | 0: records the user's verdict on a finished loose-surface run |

Response: `201 { job_id, status: "submitted", kind, model, mode?, quality?, credits_deducted, breakdown, auto?, status_url }`. Poll `GET /v1/videos/{job_id}`; `video_url` holds the output URL for every kind (png, mp4 or mp3). A failed job refunds automatically.

`model` must be a **live** catalog id of the right kind (`GET /v1/models`), or `"auto"`; a planned id is a `400 VALIDATION_ERROR` whose message lists the live ones. Omit it for the default. Every URL (`refs`, `first_frame`, `last_frame`, `video_refs`, `audio_refs`) must be https (`POST /v1/uploads/image` turns image bytes into one). Bodies are strict: an unknown field is a 400, never silently ignored.

### Video modes

The mode is derived from the body, one provider model per (catalog model, mode): `first_frame` (and optional `last_frame`) is **image-to-video**, the still becomes frame one and the clip animates it; `refs` / `video_refs` / `audio_refs` is **reference**, the identity, look, motion or sound is kept and the prompt addresses them as `@image1`, `@video1`, `@audio1` (numbered per list); neither is **text**. Frames and refs cannot be mixed on Seedance. Every limit of the (model, mode) cell is checked at submit, so an out-of-range `seconds`, `aspect`, `quality` or ref count is a 400 naming the allowed values, never a provider failure minutes later.

`aspect` is one of `9:16`, `16:9`, `1:1`, `4:3`, `3:4`, `21:9`, `adaptive` (default 9:16 for text and reference, adaptive for image-to-video; `seedance-2.5` accepts adaptive only in image mode). `quality` is one of `480p`, `720p`, `1080p` (default 720p); the price per second follows it: `seedance-2.0` 15 credits/s at 480p, 30 at 720p, 75 at 1080p; `seedance-2.5` 50 credits/s at 480p, 99 at 720p, 180 at 1080p. No live model accepts a seed; the field exists for planned models only and is refused on every live one.

| Model | Mode | Inputs | Seconds | Aspects | Qualities |
|---|---|---|---|---|---|
| `seedance-2.0` | text | prompt only | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p |
| `seedance-2.0` | image | first_frame + optional last_frame | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default adaptive) | 480p, 720p, 1080p |
| `seedance-2.0` | reference | refs up to 9, video_refs up to 3 (15 s total), audio_refs up to 3 (15 s total); audio needs an image or video beside it | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p |
| `seedance-2.5` | text | prompt only | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p |
| `seedance-2.5` | image | first_frame + optional last_frame | 4 to 15 | adaptive (default adaptive) | 480p, 720p, 1080p |
| `seedance-2.5` | reference | refs up to 30, video_refs up to 10 (30 s total), audio_refs up to 10 (30 s total) | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p |

A reference prompt that carries `video_refs` must not read as an edit or extend request ("edit the video", "remove", "replace", "extend", "continue the clip"): the schema refuses it, because the provider would reclassify the job and fail it after rendering. Describe the new clip you want.

### The quality loop

Every completed loose-surface job is scored by an auto-judge in media-worker-v2 (3 frames or the image, graded against the realism rubric, prompt adherence and, with refs, identity match; `gpt-4o-mini`, JSON verdict) into `generation_quality`, alongside any `rate` call. `GET /v1/models` exposes the last 30 days per model as `recent` (`runs`, `fail_rate`, `auto_score`, `scored`, `user_score`, `rated`, `p50_seconds`) and prints the `auto_policy`. `model: "auto"` applies that policy: the default unless it fails more than 25% of at least 10 runs and another live model is healthy, or a live model within 1.5x the price beats its auto score by 0.10 or more over at least 10 judged runs; only models that have the request's mode are candidates; the response carries `auto: { model, reason }`.

### GenerateVideo

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
# -> 201 { "job_id": "...", "mode": "text", "quality": "720p", "credits_deducted": 150, ... }
# image-to-video: add "first_frame": "https://.../still.png"; reference: add "refs": ["https://.../portrait.png"] and say @image1 in the prompt
curl https://api.agent-media.ai/v1/videos/<job_id> -H "Authorization: Bearer ma_..."
```

---

## Shared

### Connecting an agent (no API key)

Driving agent-media from Claude, Claude Code, Cursor or Codex? Skip the API key entirely, add the hosted MCP connector, one URL with browser sign-in:

```
https://api.agent-media.ai/mcp
```

Claude (web or desktop): Settings → Connectors → Add custom connector. Claude Code: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`. Full guide: https://agent-media.ai/connect

Over MCP, always call `get_run_status` with the id you were given after submitting, generation is async and the submit response only confirms the job started.

If you have image bytes (a photo the user attached, a `data:` URL), call `upload_image` first and pass the https URL it returns. Never inline base64 into a generation call: the client prints tool arguments in the chat, so the user sees a wall of base64, and every retry re-sends it. `upload_image` costs no credits.

### Models

`GET /v1/models` (public, no key) and the `list_models` MCP tool return the model catalog with user prices per quality, the modes and limits of every video model, a usage card (pick when, prompting tips, latency) and what each model is good and bad at. Live today:

| Model | Kind | Tier | User price | Modes | Selectable via |
|---|---|---|---|---|---|
| `seedance-2.0` (default) | video | standard | 15 credits/s at 480p, 30 at 720p, 75 at 1080p | text 4 to 15 s; image 4 to 15 s; reference 4 to 15 s | `model` on `/v2/generate/video` and the `generate_video` MCP tool; `engine` on `/v2/selfie`, `/v2/crazy-look`, CLI `--engine` |
| `seedance-2.5` | video | premium | 50 credits/s at 480p, 99 at 720p, 180 at 1080p | text 4 to 15 s; image 4 to 15 s; reference 4 to 15 s | `model` on `/v2/generate/video` and the `generate_video` MCP tool; `engine` on `/v2/selfie`, `/v2/crazy-look`, CLI `--engine` |
| `gpt-image-2` (default) | image | standard | 20 credits/image | text-to-image, image-edit | `model` on `/v2/generate/image` and the `generate_image` MCP tool |
| `elevenlabs-tts` (default) | audio | standard | 0.01 credits/character | text-to-speech | `model` on `/v2/generate/audio` and the `generate_audio` MCP tool |

Planned, not selectable and unpriced until a real run is recorded: `seedance-2.0-mini`, `kling-o3`, `wan-3.0`, `omnihuman-1.5`, `sora-2`, `nano-banana-2`, `seedream-5.0-pro`, `z-image-turbo`, `doubao-seed-audio-1.0`, `suno`. One page per model lives under `docs/models/`.

`make_ugc` (REST, the dashboard) always renders on the default engine (`seedance-2.0`); it has no engine field.

### Authentication

Every v2 REST request sends `Authorization: Bearer ma_xxx`. Get a key via `agent-media login` (CLI) or the dashboard. (Not needed for the MCP connector above.)

### Polling

`GET /v1/videos/{job_id}` returns the same shape for v1 and v2 jobs. v2-specific fields:

- `character_id`, present on jobs that create a v2 character (`char_xxxxxxxxxx`).
- `video_url`, present on completed jobs; for `generate_image` / `generate_audio` jobs it holds the png / mp3 URL.

### Selfie pipeline artifacts

Selfie jobs expose intermediate URLs while processing:

- `portrait_url`, generated actor face portrait, unless reusing a saved character.
- `character_sheet_url` / `sheet_url`, full-body multi-angle character reference.
- `wireframe_url`, photographic storyboard/wireframe board with 8-10 frames and captions.
- `video_url` / `result_url`, final Seedance MP4 after completion.

Agents should surface each artifact as soon as it appears in status instead of waiting silently for the final video.
