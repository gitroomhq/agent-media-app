# seedance-2.0-mini

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

Draft tier of Seedance 2.0. Same family, lower resolution ceiling, about a third of the cost.

| | |
|---|---|
| Kind | video |
| Tier | draft |
| Status | **candidate** |
| Provider | evolink |
| Modes | text-to-video, image-to-video, reference-to-video |
| Features | native-audio, first-frame, image-references, video-references, audio-references |
| Limits | 4 to 15 s (per mode below); worker waits up to 30 min |
| User price | none (candidate) |
| Quality / speed | draft / fast |
| Verified | no recorded run yet |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| text | `seedance-2.0-mini-text-to-video` | prompt only | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p | no | no recorded run yet |
| image | `seedance-2.0-mini-image-to-video` | first_frame (+ last_frame) | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default adaptive) | 480p, 720p | no | no recorded run yet |
| reference | `seedance-2.0-mini-reference-to-video` | 9 images, 3 clips (15 s total), 3 audio (15 s total) | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p | no | no recorded run yet |

- reference: address references as @image1 @video1 @audio1 (numbered per list, from 1).
<!-- /generated -->

## Usage notes

- Planned use: previews and bulk variants before a final render on 2.0.
- Not selectable yet. Goes live after a real run and a confirmed 720p image-reference price.
