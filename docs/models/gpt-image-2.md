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
| Limits | 1024, 1536; refs: image |
| Our cost | $0.015 per image. EvoLink list price per 1K image; OpenAI direct is comparable. Used for portrait, sheet and wireframe stages. |
| User price | included in the generator's credits |
| Quality / speed | good / fast |
| Verified | 2026-09-05. every video pipeline stage A-C; portrait + sheet produced on run 2749ee84 |

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

- Internal: pipeline stages A (portrait), B (sheet), C (wireframe)
