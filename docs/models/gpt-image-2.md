# gpt-image-2

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

The image model behind every video: it draws the portrait, the multi-view character sheet and the framing wireframe that Seedance then animates.

| | |
|---|---|
| Kind | image |
| Tier | standard |
| Status | **live** |
| Provider | openai (`gpt-image-2`) |
| Modes | text-to-image, image-edit |
| Features | portrait, character-sheet, wireframe, prompt-adherence |
| Limits | 1024x1024, 1024x1536, 1536x1024; up to 4 refs |
| User price | 20 credits per image (`generate_image`) |
| Quality / speed | good / fast |
| Verified | 2026-09-05. every video pipeline stage A-C; portrait + sheet produced on run 2749ee84; standalone via generate_image |

## How to use it

**Pick this when** you are reproducing something that was made on gpt-image-2; otherwise take the default.

**Best for:** the previous generation, kept selectable for runs that were built on it.

**Avoid for:** new work: gpt-image-2.5 is the default and holds identity better.

**Prompting:**

- Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "headroom for a caption".
- With refs it EDITS or composes from them (a product into a hand, a portrait re-lit); without refs it paints from the prompt alone.

**Latency:** under a minute.
<!-- /generated -->

## Usage notes

- The previous generation. Kept live and selectable so a run built on it can be reproduced; `gpt-image-2.5` is the default for new work and holds identity better on edits.
- Rendered at the provider's `medium` tier, the tier it was priced and verified at.

## How to select it

- `generate_image` over MCP (the default, omit `model`, or pass `"model": "gpt-image-2"`); `POST /v2/generate/image` over REST. 20 credits per image. With `refs` it runs the image-edit endpoint (compose from the references); without, text-to-image
- Internal: pipeline stages A (portrait), B (sheet), C (wireframe) of the fixed video skills, included in those skills' credits
