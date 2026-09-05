# Choosing a model

Generated from `packages/schema/src/v2/models.ts`. Call the `list_models` MCP tool (or `GET /v1/models`) for the live version.

## The one rule

**Default to `seedance-2.0`.** It is right for talking-head UGC, product-in-hand and crazy-look at 30 credits/second. `seedance-2.5` is about 3x (99/second); pick it only when the user asks for the best possible single clip. Never for drafts or bulk.

## How to select

Pass the id as `model` to `generate_video` / `generate_image` / `generate_audio` (MCP) or `POST /v2/generate/<kind>` (REST). Omit it for the default. Live video models are also the `engine` of the fixed REST skills (`/v2/selfie`, `/v2/crazy-look`, CLI `--engine`). Only live models are accepted; a planned id returns a 400 naming the live ones.

## Live models

| Model | Kind | Tier | Price | Max | Best for | Avoid for |
|---|---|---|---|---|---|---|
| [seedance-2.0](models/seedance-2.0.md) (default) | video | standard | 30 credits/second | ≤15s | talking-head UGC; product in hands; crazy look; bulk daily posts | clips over 15s; hero shots where 2.5 detail is worth 3x the price |
| [seedance-2.5](models/seedance-2.5.md) | video | premium | 99 credits/second | ≤15s | hero product ads; close-up faces; one clip that has to be the best | drafts; bulk; anything where 2.0 is good enough: it is ~3x the credits |
| [gpt-image-2](models/gpt-image-2.md) (default) | image | standard | 20 credits/image | – | portraits; character sheets; framing wireframes; product placement frames | photoreal 4K hero stills |
| [elevenlabs-tts](models/elevenlabs-tts.md) (default) | audio | standard | 0.01 credits/character | – | voiceover on b-roll; dubbing; when Seedance native audio is not used | lip-synced talking head: Seedance native audio is the default there |

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
| [suno](models/suno.md) | audio | standard | a music bed under a clip |

1 credit = $0.01.
