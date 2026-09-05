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
| Limits | 1024, 1536; refs: image |
| Our cost | $0.06 per image. OpenAI direct, quality "medium", 1024x1536 — the published gpt-image-1 rate ($0.063); gpt-image-2 assumed equal until an invoice line is checked. EvoLink lists $0.015 for its 1K tier. |
| User price | 20 credits per image standalone (`generate_image`); included in the credits of the fixed video skills |
| Quality / speed | good / fast |
| Verified | 2026-09-05. every video pipeline stage A-C; portrait + sheet produced on run 2749ee84; standalone via generate_image |

## Best for

- portraits
- character sheets
- framing wireframes
- product placement frames

## Avoid for

- photoreal 4K hero stills

## Usage notes

- Not selectable on its own today; every generator uses it internally and its cost is inside the generator credits.
- Prompt adherence is strong; it follows framing instructions like headroom for a caption.
- Will become a `generate_image` model choice in P2.

## How to select it

- `generate_image` over MCP (the default — omit `model`, or pass `"model": "gpt-image-2"`); `POST /v2/generate/image` over REST. 20 credits per image. With `refs` it runs the image-edit endpoint (compose from the references); without, text-to-image
- Internal: pipeline stages A (portrait), B (sheet), C (wireframe) of the fixed video skills, included in those skills' credits
