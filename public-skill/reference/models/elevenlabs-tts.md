# elevenlabs-tts

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

Text to speech and dubbing, used when a voice track is needed outside Seedance's native audio.

| | |
|---|---|
| Kind | audio (default for `generate_audio`) |
| Tier | standard |
| Status | **live** |
| Provider | elevenlabs (`eleven_multilingual_v2`) |
| Modes | text-to-speech |
| Features | voice-clone, multilingual, dubbing |
| Limits | none |
| User price | 1 credit per 100 characters (`generate_audio`), rounded up |
| Quality / speed | good / fast |
| Verified | 2026-09-05. wired in media-worker-v2 (tts.js, dubbing.js); standalone via generate_audio |

## How to use it

**Pick this when** you need a clean voice track and no face.

**Best for:** voiceover on b-roll; narration; a standalone voice file; an audio reference for generate_video.

**Avoid for:** lip-synced talking head: generate_video renders speech natively.

**Prompting:**

- Emotion tags like [excited] or [whispers] are honoured; keep sentences short for pacing.
- Seven named voices (sarah default) or a raw ElevenLabs voice id.

**Latency:** seconds.
<!-- /generated -->

## Usage notes

- Talking-head clips use Seedance native audio, not this.
- Used by the dubbing and voiceover paths in media-worker-v2 (`tts.js`, `dubbing.js`).
- Standalone via `generate_audio` (1 credit per 100 characters); the fixed skills include it in their video credits.

## How to select it

- `generate_audio` over MCP (the default, omit `model`, or pass `"model": "elevenlabs-tts"`); `POST /v2/generate/audio` over REST. 1 credit per 100 characters, rounded up. Named voices: jessica, sarah, liam, chris, lily, bill, matilda, or a raw voice id
- Internal: b-roll narration and dubbing inside the fixed skills
