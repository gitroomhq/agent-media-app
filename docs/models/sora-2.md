# sora-2

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

OpenAI's video model via EvoLink, with native audio, text-to-video only.

| | |
|---|---|
| Kind | video |
| Tier | premium |
| Status | **candidate** |
| Provider | evolink |
| Modes | text-to-video, image-to-video |
| Features | native-audio |
| Limits | 4 to 12 s (per mode below); worker waits up to 30 min |
| User price | none (candidate) |
| Quality / speed | premium / slow |
| Verified | no recorded run yet |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| text | `sora-2-preview` | prompt only | 4 to 12 | 16:9, 9:16 (default 9:16) | 720p | no | no recorded run yet |
| image | `sora-2-preview` | first_frame | 4 to 12 | 16:9, 9:16 (default 9:16) | 720p | no | no recorded run yet |

- text: Only 4, 8 or 12 s. Strict content moderation; real people are not accepted.
- image: One image; its pixel size must match the aspect exactly (1280x720 or 720x1280). No real people.
<!-- /generated -->

## Usage notes

- No reference input, so a saved character's identity cannot be locked. Planned for cinematic b-roll only.
- Not selectable yet.
