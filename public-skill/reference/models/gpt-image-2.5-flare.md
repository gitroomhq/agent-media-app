# gpt-image-2.5-flare

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

| | |
|---|---|
| Kind | image |
| Tier | standard |
| Status | **live** |
| Provider | openai (`gpt-image-2.5-flare`) |
| Modes | text-to-image, image-edit |
| Features | portrait, character-sheet, wireframe, fast |
| Limits | 1024x1024, 1024x1536, 1536x1024; up to 4 refs |
| User price | 20 credits per image (`generate_image`) |
| Quality / speed | good / fast |
| Verified | no recorded run yet |

## How to use it

**Pick this when** you want the same look as gpt-image-2.5 but faster, or you are making several images at once.

**Best for:** variants and drafts at the same quality tier; batches of frames; anything where a few seconds matter.

**Avoid for:** the one sheet a whole series depends on, where gpt-image-2.5 edits hold identity a little better.

**Prompting:**

- Same prompts as gpt-image-2.5; it is the speed tier of the same family.

**Latency:** about 15 to 30 seconds.
<!-- /generated -->

## Usage notes

- The speed tier of the same family: same prompts, same price, a few seconds faster per image, at the same `high` provider tier.
- Use it for variants and batches, when you are making several frames and will pick one.
- For the one character sheet a whole series depends on, prefer `gpt-image-2.5`: its edits hold identity a little more tightly.

## How to select it

- `generate_image` over MCP with `"model": "gpt-image-2.5-flare"`; `POST /v2/generate/image` over REST, same body. 20 credits per image.
- Not used by the fixed video skills: those follow the catalog default.
