# gpt-image-2.5

> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.

| | |
|---|---|
| Kind | image (default for `generate_image`) |
| Tier | premium |
| Status | **live** |
| Provider | openai (`gpt-image-2.5-sunburst`) |
| Modes | text-to-image, image-edit |
| Features | portrait, character-sheet, wireframe, identity-hold, multi-reference, prompt-adherence |
| Limits | 1024x1024, 1024x1536, 1536x1024; up to 4 refs |
| User price | 20 credits per image (`generate_image`) |
| Quality / speed | premium / fast |
| Verified | no recorded run yet |

## How to use it

**Pick this when** you are making the image a video will be built on: a portrait, a character sheet, a first frame, or an edit that has to keep the same person.

**Best for:** portraits and character sheets that a video has to keep; the first frame of a clip; product in hand; edits that must not lose the face.

**Avoid for:** bulk throwaway drafts where gpt-image-2.5-flare is faster.

**Prompting:**

- Concrete subject, age, framing, light, what the hands do; it follows layout instructions like "four poses on a plain background" or "headroom for a caption".
- With refs it edits or composes from them and holds the identity across poses, which is what makes a character sheet usable as a video reference.
- Pass the result straight to generate_video as first_frame (to animate it) or in refs (to keep that person across clips).

**Latency:** about 30 seconds, a little longer for an edit with references.
<!-- /generated -->

## Usage notes

- The default for `generate_image` and for every image stage inside the video skills: the portrait, the character sheet and the framing wireframe are all painted with it, so a video's identity starts here.
- Rendered at the provider's `high` tier. That is not a user choice: one price per image, one tier, so the price list and the bill cannot drift apart.
- Character sheets are the reason it is the default. Give it a portrait as a reference and ask for four poses on a plain background; it holds the same face across the panels, and that sheet is what `generate_video` reads in `refs`.
- Sizes: 1024x1536 portrait (the default, matches 9:16 video), 1024x1024 square, 1536x1024 landscape (good for a multi-pose sheet).
- Up to 4 reference images per call. With references it edits or composes; without, it paints from the prompt alone.

## How to select it

- `generate_image` over MCP (the default, omit `model`, or pass `"model": "gpt-image-2.5"`); `POST /v2/generate/image` over REST, same body. 20 credits per image.
- Inside the fixed video skills (selfie, crazy look, character create) it runs automatically for the portrait, sheet and wireframe stages; those credits are already in the video price.
- Pass its output URL to `generate_video` as `first_frame` to animate that exact still, or in `refs` to keep the person across clips.
