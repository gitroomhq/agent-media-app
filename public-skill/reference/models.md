# Choosing a model

Generated from `packages/schema/src/v2/models.ts`. Call the `list_models` MCP tool (or `GET /v1/models`) for the live version with prices.

## The one rule

**Default to `seedance-2.0`.** It is the right engine for talking-head UGC, product-in-hands and crazy-look at 30 credits/second. `seedance-2.5` is about 3x the credits (99/second); pick it only when the user asks for the best possible single clip. Never pick it for drafts or bulk.

Today the engine is selectable on the CLI (`agent-media selfie --engine seedance-2.5`, `agent-media crazy-look --engine seedance-2.5`) and REST (`POST /v2/selfie`, `POST /v2/crazy-look` with `"engine"`). Over MCP, `make_ugc` has no engine field yet and always renders on seedance-2.0; that arrives in P2. Image and audio models are used inside the pipelines and are not selectable.

## Live models

| Model | Kind | Tier | User price | Max | Best for |
|---|---|---|---|---|---|
| [seedance-2.0](models/seedance-2.0.md) | video | standard | 30 credits/second | ≤15s | talking-head UGC |
| [seedance-2.5](models/seedance-2.5.md) | video | premium | 99 credits/second | ≤15s | hero product ads |
| [gpt-image-2](models/gpt-image-2.md) | image | standard | inside generator credits | – | portraits |
| [elevenlabs-tts](models/elevenlabs-tts.md) | audio | standard | inside generator credits | – | voiceover on b-roll |

## Planned (not selectable, no price yet)

Each goes live only after a real run is recorded and its cost is confirmed against the provider's detailed table.

| Model | Kind | Tier | Best for |
|---|---|---|---|
| [seedance-2.0-mini](models/seedance-2.0-mini.md) | video | draft | drafts |
| [kling-o3](models/kling-o3.md) | video | premium | second premium option next to seedance-2.5 |
| [wan-3.0](models/wan-3.0.md) | video | standard | clips longer than 15s in one take |
| [omnihuman-1.5](models/omnihuman-1.5.md) | video | premium | talking head driven by an existing voice track |
| [sora-2](models/sora-2.md) | video | premium | cinematic b-roll without a locked face |
| [nano-banana-2](models/nano-banana-2.md) | image | standard | product placement into a character frame |
| [seedream-5.0-pro](models/seedream-5.0-pro.md) | image | premium | multi-reference composites: person + product + setting |
| [z-image-turbo](models/z-image-turbo.md) | image | draft | framing wireframes |
| [doubao-seed-audio-1.0](models/doubao-seed-audio-1.0.md) | audio | draft | cheap voiceover and ambience beds |
| [suno](models/suno.md) | audio | standard | the `music` bed field on make_ugc |

1 credit = $0.01.
