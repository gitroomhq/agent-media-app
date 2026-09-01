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

## Shared

### Connecting an agent (no API key)

Driving agent-media from Claude, Claude Code, Cursor or Codex? Skip the API key entirely — add the hosted MCP connector, one URL with browser sign-in:

```
https://api.agent-media.ai/mcp
```

Claude (web or desktop): Settings → Connectors → Add custom connector. Claude Code: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`. Full guide: https://agent-media.ai/connect

Over MCP, always call `get_run_status` with the id you were given after submitting — generation is async and the submit response only confirms the job started.

If you have image bytes (a photo the user attached, a `data:` URL), call `upload_image` first and pass the https URL it returns. Never inline base64 into a generation call: the client prints tool arguments in the chat, so the user sees a wall of base64, and every retry re-sends it. `upload_image` costs no credits.

### Authentication

Every v2 REST request sends `Authorization: Bearer ma_xxx`. Get a key via `agent-media login` (CLI) or the dashboard. (Not needed for the MCP connector above.)

### Polling

`GET /v1/videos/{job_id}` returns the same shape for v1 and v2 jobs. v2-specific fields:

- `character_id` — present on jobs that create a v2 character (`char_xxxxxxxxxx`).
- `video_url` — present on completed video jobs.

### Selfie pipeline artifacts

Selfie jobs expose intermediate URLs while processing:

- `portrait_url` — generated actor face portrait, unless reusing a saved character.
- `character_sheet_url` / `sheet_url` — full-body multi-angle character reference.
- `wireframe_url` — photographic storyboard/wireframe board with 8-10 frames and captions.
- `video_url` / `result_url` — final Seedance MP4 after completion.

Agents should surface each artifact as soon as it appears in status instead of waiting silently for the final video.
