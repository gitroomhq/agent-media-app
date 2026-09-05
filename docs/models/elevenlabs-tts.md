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
| Limits | – |
| Our cost | $0.00003 per character. ElevenLabs Creator tier, ~$0.30 per 10k characters. Used by tts.js / dubbing.js in media-worker-v2. |
| User price | 1 credit per 100 characters standalone (`generate_audio`), rounded up; included in the credits of the fixed skills |
| Quality / speed | good / fast |
| Verified | 2026-09-05. wired in media-worker-v2 (tts.js, dubbing.js); standalone via generate_audio |

## Best for

- voiceover on b-roll
- dubbing
- when Seedance native audio is not used

## Avoid for

- lip-synced talking head: Seedance native audio is the default there

## Usage notes

- Talking-head clips use Seedance native audio, not this.
- Used by the dubbing and voiceover paths in media-worker-v2 (`tts.js`, `dubbing.js`).
- Billed inside the generator credits, not separately.

## How to select it

- `generate_audio` over MCP (the default — omit `model`, or pass `"model": "elevenlabs-tts"`); `POST /v2/generate/audio` over REST. 1 credit per 100 characters, rounded up. Named voices: jessica, sarah, liam, chris, lily, bill, matilda, or a raw voice id
- Internal: b-roll narration and dubbing inside the fixed skills
