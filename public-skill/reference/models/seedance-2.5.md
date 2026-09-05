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
| Verified | no recorded run yet |

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
- No run has been recorded on this model through the connector yet; the engine has been selectable since release ff89413 and as `model` on `generate_video` since the loose surface shipped. `seedance-2.5-text-to-video` (the no-refs path) follows the provider's naming pattern and is confirmed by the first recorded text-only run.
- Max 15s per take through agent-media even though the provider allows up to 30s.

## How to select it

- `generate_video` over MCP with `"model": "seedance-2.5"`; `POST /v2/generate/video` over REST, same body. With `refs` the provider model is `seedance-2.5-reference-to-video`; without, `seedance-2.5-text-to-video`
- `agent-media selfie --engine seedance-2.5 ...` or `agent-media crazy-look --engine seedance-2.5 ...`
- `POST /v2/selfie` / `POST /v2/crazy-look` over REST with `"engine": "seedance-2.5"`
- `make_ugc` has no engine field and always renders on seedance-2.0
