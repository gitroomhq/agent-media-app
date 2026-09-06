# gpt-image-2

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

The image model behind every video: it draws the portrait, the multi-view character sheet and the framing wireframe that Seedance then animates.

| | |
|---|---|
| Kind | image (default for `generate_image`) |
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

**Pick this when** you are building the reference or the first frame a video will use.

**Best for:** portraits; character sheets; framing wireframes; product placement frames; a first frame for generate_video.

**Avoid for:** photoreal 4K hero stills.

**Prompting:**

- Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "headroom for a caption".
- With refs it EDITS or composes from them (a product into a hand, a portrait re-lit); without refs it paints from the prompt alone.

**Latency:** under a minute.
<!-- /generated -->

## Usage notes

- Selectable via `generate_image` (20 credits per image); the fixed video skills also use it internally for portraits and sheets.
- Prompt adherence is strong; it follows framing instructions like headroom for a caption.

## How to select it

- `generate_image` over MCP (the default, omit `model`, or pass `"model": "gpt-image-2"`); `POST /v2/generate/image` over REST. 20 credits per image. With `refs` it runs the image-edit endpoint (compose from the references); without, text-to-image
- Internal: pipeline stages A (portrait), B (sheet), C (wireframe) of the fixed video skills, included in those skills' credits
