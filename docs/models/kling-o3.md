# kling-o3

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

Kling's reference-and-edit model. A second premium option beside Seedance 2.5 and the first that can edit an existing clip.

| | |
|---|---|
| Kind | video |
| Tier | premium |
| Status | **candidate** |
| Provider | evolink |
| Modes | text-to-video, image-to-video, reference-to-video |
| Features | first-frame, first-and-last-frame, image-references, video-reference, sound-effects |
| Limits | 3 to 15 s (per mode below); worker waits up to 30 min |
| User price | none (candidate) |
| Quality / speed | premium / medium |
| Verified | no recorded run yet |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| text | `kling-o3-text-to-video` | prompt only | 3 to 15 | 16:9, 9:16, 1:1 (default 9:16) | 720p, 1080p | no | no recorded run yet |
| image | `kling-o3-image-to-video` | first_frame (+ last_frame) | 3 to 15 | 16:9, 9:16, 1:1 (default 9:16) | 720p, 1080p | no | no recorded run yet |
| reference | `kling-o3-reference-to-video` | 4 images, 1 clips | 3 to 10 | 16:9, 9:16, 1:1 (default 9:16) | 720p, 1080p | no | no recorded run yet |

- text: Prompt up to 2500 characters. Sound is effects, not verified lip-sync.
- image: last_frame needs first_frame and is refused when style refs are also given.
- reference: address references as <<<image_1>>> <<<video_1>>>.
- reference: Exactly one reference video (3 s or longer); sound is forced off with a video reference.
<!-- /generated -->

## Usage notes

- Planned use: hero clips where a Seedance look is not wanted, and clip editing.
- Not selectable yet.
