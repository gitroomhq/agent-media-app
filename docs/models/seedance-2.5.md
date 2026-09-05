# seedance-2.5

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

The premium video engine. Same inputs and pipeline as 2.0, the provider's newer generation, at roughly three times the credits. No side-by-side quality comparison has been recorded yet; treat the quality tier as the provider's claim.

| | |
|---|---|
| Kind | video |
| Tier | premium |
| Status | **live** |
| Provider | evolink (`seedance-2.5-reference-to-video`) |
| Modes | reference-to-video, text-to-video |
| Features | native-audio, lip-sync, character-sheet-reference |
| Limits | 4–15 s; 9:16, 1:1; 480p, 720p, 1080p; refs: image |
| Our cost | $0.296 per second. EvoLink detailed table, 720p with IMAGE references bills at the text-to-video rate; the reference discount applies only to VIDEO references. Marketing page shows $0.084/s "from". |
| User price | 99 credits per second |
| Quality / speed | premium / slow |
| Verified | 2026-09-05. generate_video, text-only (seedance-2.5-text-to-video), 4s, 396 credits; EvoLink render took ~25 min (run 431f82ba-9e9e-4644-beb3-b1f67c0de91e) |

## Best for

- hero product ads
- close-up faces
- one clip that has to be the best

## Avoid for

- drafts
- bulk
- anything where 2.0 is good enough: it is ~3x the credits

## Usage notes

- Only choose it when the user asks for top quality or a hero clip.
- Cost trap: with image references at 720p the provider bills the text-to-video rate. There is no reference discount for images, only for video references. That is why it is 99 credits/s.
- First recorded run: job 431f82ba (2026-09-05), `generate_video` with no refs on `seedance-2.5-text-to-video`, 4s, 396 credits. The provider took ~25 minutes for 4 seconds of video; budget for that (2.0 renders 5s in ~3 minutes).
- Max 15s per take through agent-media even though the provider allows up to 30s.

## How to select it

- `generate_video` over MCP with `"model": "seedance-2.5"`; `POST /v2/generate/video` over REST, same body. With `refs` the provider model is `seedance-2.5-reference-to-video`; without, `seedance-2.5-text-to-video`
- `agent-media selfie --engine seedance-2.5 ...` or `agent-media crazy-look --engine seedance-2.5 ...`
- `POST /v2/selfie` / `POST /v2/crazy-look` over REST with `"engine": "seedance-2.5"`
- `make_ugc` has no engine field and always renders on seedance-2.0
