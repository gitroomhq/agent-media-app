# seedance-2.0

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

The default video engine for every agent-media video. It takes a character sheet plus a framing wireframe as image references and renders a 9:16 clip with native audio and lip-sync.

| | |
|---|---|
| Kind | video (default for `generate_video`) |
| Tier | standard |
| Status | **live** |
| Provider | evolink (`seedance-2.0-reference-to-video`) |
| Modes | reference-to-video, text-to-video |
| Features | native-audio, lip-sync, character-sheet-reference |
| Limits | 4–15 s; 9:16, 1:1; 480p, 720p, 1080p; refs: image |
| Our cost | $0.1 per second. EvoLink detailed table, 720p with image references. Marketing page shows $0.033/s "from" (480p). |
| User price | 30 credits per second |
| Quality / speed | good / medium |
| Verified | 2026-09-05. make_ugc via Claude Code over the hosted connector, 5s, succeeded (run 2749ee84-1835-4e69-947d-67034ead0890) |

## Best for

- talking-head UGC
- product in hands
- crazy look
- bulk daily posts

## Avoid for

- clips over 15s
- hero shots where 2.5 detail is worth 3x the price

## Usage notes

- Use it unless the user asks for the best possible single clip.
- Script length sets the duration: about 2.2 words per second, capped at 15s per take. Longer scripts become multi-take.
- Reference images must be https URLs. Use `upload_image` for bytes.
- Typical wall time 3 to 4 minutes; captions add about 2 minutes.

## How to select it

- `generate_video` over MCP (the default — omit `model`, or pass `"model": "seedance-2.0"`); `POST /v2/generate/video` over REST, same body
- `agent-media selfie --engine seedance-2.0 ...` (default, flag optional)
- `POST /v2/selfie` / `POST /v2/crazy-look` over REST (default engine)
- `make_ugc` (REST, the dashboard) always uses this engine
