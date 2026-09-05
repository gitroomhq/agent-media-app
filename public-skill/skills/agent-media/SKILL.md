---
name: 'Agent-Media'
description: 'Make AI video, images and voice with agent-media as the director: write the prompt, pick the model (default seedance-2.0; seedance-2.5 for a hero clip at ~3x; gpt-image-2 for images; elevenlabs-tts for speech), pass reference images for identity, quote the price, poll for the URL. Tools: generate_video, generate_image, generate_audio, quote, list_models, list_characters, get_run_status, upload_image. Use for UGC clips, product-in-hand, reaction clips, portraits, voiceover, and series with one face.'
allowed-tools: ['mcp__agent-media__generate_video', 'mcp__agent-media__generate_image', 'mcp__agent-media__generate_audio', 'mcp__agent-media__quote', 'mcp__agent-media__list_models', 'mcp__agent-media__list_characters', 'mcp__agent-media__get_run_status', 'mcp__agent-media__upload_image']
x-skill-slug: 'agent-media'
x-skill-version: '2.0.0'
x-surface: 'loose'
---
# agent-media — the skill

You are the director. agent-media gives you three primitives and a model catalog; there is no fixed recipe between your intent and the render. Read this once; it is the whole manual.

## The loop

1. **Decide the shot** in words: who, where, what happens, camera, and — if anyone speaks — the exact words in quotes.
2. **Pick the model.** Omit `model` and you get the default (`seedance-2.0` for video, `gpt-image-2` for images, `elevenlabs-tts` for speech). Call `list_models` when the job is unusual — it says what each model is good at, bad at, and what it costs. Only live models are accepted; naming a planned one returns the live list.
3. **Get identity right.** Same face across clips ⇒ pass the same reference URL in `refs` every time. Make the reference with `generate_image` (a clean portrait), take it from `list_characters` (a saved character sheet), or `upload_image` the user's photo.
4. **Quote if the user cares about cost** (`quote` costs nothing), then call the tool.
5. **Poll `get_run_status`** with the job id (`wait: true`) until it is `completed`, and hand the user the URL. Never report success before you hold the URL.

## The tools

### generate_video — 150 / 300 / 450 credits for 5 / 10 / 15s on seedance-2.0 (495 for 5s on seedance-2.5)

```json
{
  "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \"Okay, I did not expect this to actually work.\" Natural skin texture, soft window light, slight head tilt, hands busy with the bottle.",
  "refs": ["https://…/portrait.png"],
  "seconds": 5,
  "aspect": "9:16",
  "audio": true
}
```

- `seconds` 4–15, `aspect` `9:16` or `1:1`, `refs` up to 4 https URLs, `seed` for a repeatable take, `model` a live video id.
- With `refs` the model keeps that person / product / look (reference-to-video). Without, it invents one from the prompt (text-to-video).
- Speech: put the exact words in quotes in the prompt and leave `audio: true`. The model renders the voice and lip-sync natively — you do not need `generate_audio` for a talking head.
- Pace the words: ~2.3 words per second. 5s ≈ 10–12 words, 10s ≈ 20–25, 15s ≈ 30–35. A longer script is several clips.

### generate_image — 20 credits

```json
{ "prompt": "Head-and-shoulders portrait of a 28-year-old woman, warm smile, soft window light, phone camera, natural skin, plain kitchen behind her", "size": "1024x1536" }
```

- `size` `1024x1024`, `1024x1536`, `1536x1024` (portrait is the default). With `refs` it edits/composes from them: put a product into a hand, re-light a portrait, pose a character sheet.
- This is how you make the reference a series needs. One portrait, then every clip cites it.

### generate_audio — 1 credit per 100 characters

```json
{ "text": "[excited] Three things nobody tells you about launching…", "voice": "sarah", "tone": "energetic" }
```

- Voices: `jessica` (young female), `sarah` (female), `liam` (young male), `chris` (male), `lily` (elder female), `bill` (elder male), `matilda` (warm, mom); or a raw ElevenLabs voice id. Emotion tags like `[excited]`, `[whispers]` are honoured.
- Use it for voiceover over b-roll or a standalone audio file. Not for a talking head (see generate_video).

### quote

`{ "kind": "video", "input": { …the same arguments… } }` → credits, USD, model, breakdown. Nothing is rendered.

### list_models · list_characters · get_run_status · upload_image

All free. `list_models` is the recommendation layer — read it before an unusual job. `list_characters` returns saved characters with `character_sheet_url` / portrait URLs for `refs`. `get_run_status` takes any job id this server gave you. `upload_image` turns bytes or a foreign URL into an https URL — never paste base64 into a tool call.

## Writing a prompt that comes out real

The fixed pipelines used to inject this rubric into every prompt. Now it is yours to include — put the relevant lines in your `prompt`, in your own words:

```text
Critical realism rules (must all be visible in the frame):
- skin shows pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb), realistic shadows;
- stable iPhone-like framing by default (no noticeable shake/drift), with slight off-axis angle (about 5-12 degrees) and imperfect centering;
- 9:16 vertical, looks like raw iPhone footage, NOT a studio shot;
- NO plastic AI sheen, NO uncanny symmetry, NO ultra-smoothed skin;
- NO shiny/plastic face, NO glowing light on the face, NO beauty-filter glow;
- subtle asymmetry: head tilt, blink, micro-expressions;
- hands are always doing something — gesturing, holding a product, adjusting clothing, or otherwise occupied (never limp at the sides);
- mouth caught mid-syllable when talking, not closed and not open-smile;
- eyes slightly off-center to camera, not a dead stare;
- no visible phone, selfie-stick, or outstretched selfie arm unless explicitly requested.
```

Also: name the age, the setting and the light; say what the hands are doing; do not write "selfie" or "phone" unless the phone should be visible; keep to one person unless it is a two-shot; quote the spoken words verbatim.

Full guide: [reference/prompting.md](../../reference/prompting.md).

## Recipes

The things the old fixed skills did, as prompts you write yourself — see [reference/recipes.md](../../reference/recipes.md) for the full versions:

- **Talking-head UGC** — generate_video with the script in quotes; a portrait in `refs` if the face must persist.
- **Product in hand** — upload_image the product → generate_image "…holding <product> up to the lens" with the product URL in refs → generate_video with that frame in refs.
- **Crazy look** — silent 5s extreme close-up, one exaggerated expression held to the lens, `audio: false`; burn the caption in your editor or ask for it in the prompt.
- **B-roll voiceover** — generate_audio the narration; the user overlays it on their footage (agent-media does not mux external video on this surface).
- **A series with one face** — one generate_image portrait, then N generate_video calls with the same `refs` and the same `seed` family.
- **Hero clip** — the one clip that must be the best: `model: "seedance-2.5"` (≈3x the credits). Never for drafts or bulk.

## Rules

- Ask before spending big: quote a 15s seedance-2.5 clip before running it.
- Default model for everything unless the user asked for the best possible single clip.
- Every image URL must be https (upload_image first). Refs are kept private to the account.
- Poll until `completed`; a clip takes a few minutes, an image under a minute, audio seconds. If a job fails, the credits are refunded automatically — say so and retry with a clearer prompt.
- Do not claim a video exists until get_run_status returned its URL.

## Errors

- `VALIDATION_ERROR` with `model` in the message — you named a planned or unknown model; the message lists the live ones.
- `INSUFFICIENT_CREDITS` — the account is out; point the user to agent-media.ai billing.
- `TOO_MANY_ACTIVE_VIDEOS` — wait for one to finish.
- `CONTENT_POLICY_BLOCKED` — the provider refused the prompt or the reference; rephrase, or use a different image.
