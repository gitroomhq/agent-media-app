# wan-3.0

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

Wan 3.0 accepts references and renders up to 30 seconds in one take, which nothing live does today.

| | |
|---|---|
| Kind | video |
| Tier | standard |
| Status | **candidate** |
| Provider | evolink |
| Modes | text-to-video, image-to-video, reference-to-video |
| Features | first-frame, first-and-last-frame, image-references, video-references, audio-references, seed, long-clip |
| Limits | 2 to 30 s (per mode below); worker waits up to 30 min |
| User price | none (candidate) |
| Quality / speed | good / medium |
| Verified | no recorded run yet |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| text | `wan3.0-text-to-video` | prompt only | 2 to 30 | adaptive, 16:9, 9:16, 1:1, 4:3, 3:4 (default 9:16) | 480p, 720p, 1080p | yes | no recorded run yet |
| image | `wan3.0-image-to-video` | first_frame (+ last_frame) | 2 to 30 | adaptive, 16:9, 9:16, 1:1, 4:3, 3:4 (default adaptive) | 480p, 720p, 1080p | yes | no recorded run yet |
| reference | `wan3.0-reference-video` | 10 images, 5 clips (15 s total), 5 audio (15 s total) | 2 to 30 | adaptive, 16:9, 9:16, 1:1, 4:3, 3:4 (default 9:16) | 480p, 720p, 1080p | yes | no recorded run yet |

- image: Frames only; references are refused next to a first frame.
- reference: address references as "Image 1", "Video 1", "Audio 1" (capitalised, space before the number).
- reference: Each reference image should contain a single character.
- reference: Reference video seconds plus output seconds may not exceed 30.
<!-- /generated -->

## Usage notes

- Planned use: single-take clips over 15s.
- Lip-sync quality unverified.
- Not selectable yet.
