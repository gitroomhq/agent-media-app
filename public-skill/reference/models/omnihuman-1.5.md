# omnihuman-1.5

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

Audio-driven digital human: give it a face and a voice track, it lip-syncs.

| | |
|---|---|
| Kind | video |
| Tier | premium |
| Status | **candidate** |
| Provider | evolink |
| Modes | lipsync |
| Features | audio-driven-lip-sync, digital-human |
| Limits | 1 to 35 s (per mode below); worker waits up to 30 min |
| User price | none (candidate) |
| Quality / speed | premium / slow |
| Verified | no recorded run yet |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| reference | `omnihuman-1.5` | 1 images, 1 audio (35 s total) | 1 to 35 | adaptive (default adaptive) | 720p | yes | no recorded run yet |

- reference: One photo of a person plus one audio file (mp3/wav, up to 35 s). The clip is as long as the audio; seconds is not a parameter.
<!-- /generated -->

## Usage notes

- Planned use: a talking head driven by an existing recording, e.g. the user's own voice.
- Expensive per second; not for silent clips.
- Not selectable yet.
