# seedance-2.0

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

The default video engine for every agent-media video. It takes a character sheet plus a framing wireframe as image references and renders a 9:16 clip with native audio and lip-sync.

| | |
|---|---|
| Kind | video (default for `generate_video`) |
| Tier | standard |
| Status | **live** |
| Provider | evolink |
| Modes | text-to-video, image-to-video, reference-to-video |
| Features | native-audio, lip-sync, first-frame, first-and-last-frame, image-references, video-references, audio-references |
| Limits | 4 to 15 s (per mode below); worker waits up to 30 min |
| User price | 30 credits/s at 480p, 60 credits/s at 720p, 150 credits/s at 1080p. Reference video seconds are billed at the same rate. |
| Quality / speed | good / medium |
| Verified | modes: text, image, reference (see below) |

## Modes

The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.

| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |
|---|---|---|---|---|---|---|---|
| text | `seedance-2.0-text-to-video` | prompt only | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p | no | 2026-09-06. 4s, 16:9, 480p, native audio; rendered in 231 s (run task-unified-1788681109-ghg38bm9) |
| image | `seedance-2.0-image-to-video` | first_frame (+ last_frame) | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default adaptive) | 480p, 720p, 1080p | no | 2026-09-06. first_frame only (4s, 480p, adaptive) and first_frame + last_frame (task-unified-1788681109-w09254uu); both rendered in about 3 to 5 min (run task-unified-1788681109-qybq2r1j) |
| reference | `seedance-2.0-reference-to-video` | 9 images, 3 clips (15 s total), 3 audio (15 s total) | 4 to 15 | 9:16, 16:9, 1:1, 4:3, 3:4, 21:9, adaptive (default 9:16) | 480p, 720p, 1080p | no | 2026-09-06. image ref (4s, 480p) and image ref + 8 s reference clip (task-unified-1788681110-hdbufncn); earlier 5s 720p portrait run b0011e92 via Claude Code (run task-unified-1788681109-a6w7aq0y) |

- text: No seed. Every render is new; keep a series consistent with references, not seeds.
- image: first_frame becomes frame one of the clip; last_frame (optional) becomes the final frame and the model animates between them.
- image: Frames only: refs, video_refs and audio_refs are not accepted in this mode. To keep an identity AND set the frame, put the frame image in refs and describe it as @image1.
- image: aspect "adaptive" (default) follows the first frame. Frame images: jpeg/png/webp, ratio between 0.4 and 2.5, 300 to 6000 px, up to 30 MB.
- reference: address references as @image1 @video1 @audio1 (numbered per list, from 1).
- reference: Address references in the prompt: "@image1 holds @image2 and says ...". Numbering is per list: refs are @image1.., video_refs are @video1.., audio_refs are @audio1...
- reference: Reference clips: 2 to 15 s each, 15 s in total, mp4/mov 480p to 1080p, 24 to 60 fps, up to 50 MB. Their seconds are billed like output seconds.
- reference: Audio references: wav/mp3, 2 to 15 s each, 15 s in total, up to 15 MB. Audio alone is not accepted: add an image or video reference.
- reference: aspect "adaptive" follows the first video reference, else the first image, else the prompt.

## How to use it

**Pick this when** you need a real-looking person saying real words, or a still brought to life, at a normal budget.

**Best for:** talking-head UGC; product in hands; crazy look; bulk daily posts; animating a still (first frame) into a clip.

**Avoid for:** clips over 15s; hero shots where 2.5 detail is worth 2x the price; anything that needs a seed.

**Prompting:**

- Write the shot as a director: who (age, look), where (setting, light), what happens, phone framing, and the exact spoken words in quotes. About 2.3 words per second.
- Keep a person consistent across clips with refs (a portrait or a character sheet), addressed as @image1; the model has no seed.
- To animate a specific still, pass it as first_frame; add last_frame to control where the motion ends.

**Latency:** about 3 minutes for a 5 s clip at 720p.
<!-- /generated -->

## Usage notes

- Use it unless the user asks for the best possible single clip.
- Script length sets the duration: about 2.2 words per second, capped at 15s per take. Longer scripts become multi-take.
- Reference images must be https URLs. Use `upload_image` for bytes.
- Typical wall time 3 to 4 minutes for a 5 s clip (the fixed skills add about 2 minutes for captions).

## How to select it

- `generate_video` over MCP (the default, omit `model`, or pass `"model": "seedance-2.0"`); `POST /v2/generate/video` over REST, same body. The provider model follows the mode: `first_frame` uses `seedance-2.0-image-to-video`, references use `seedance-2.0-reference-to-video`, a bare prompt uses `seedance-2.0-text-to-video`
- `agent-media selfie --engine seedance-2.0 ...` (default, flag optional)
- `POST /v2/selfie` / `POST /v2/crazy-look` over REST (default engine)
- `make_ugc` (REST, the dashboard) always uses this engine
