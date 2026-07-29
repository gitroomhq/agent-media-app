---
name: agent-media
description: AI UGC video production from the terminal using the current agent-media v2 CLI. Use for Selfie videos, reusable character creation, and subtitle burning. For Selfie, always gather script/action, character, director brief, and duration before running; then surface portrait, character sheet, wireframe, and final video as each completes.
---

# agent-media

Use `agent-media` to generate AI UGC videos from the terminal.

This root skill is the public GitHub entrypoint. The maintained multi-file
v2 skill lives in [`skills/agent-media-v2/`](skills/agent-media-v2/). When
working from this repository, prefer that skill tree and read
[`skills/agent-media-v2/reference/conversation-flow.md`](skills/agent-media-v2/reference/conversation-flow.md)
before running any command.

## Current Selfie Pipeline

`agent-media selfie` runs the production v2 Selfie pipeline:

1. Claude orchestration resolves missing creative details and writes prompts.
2. `gpt-image-2` generates a realistic face portrait when no saved character or photo is supplied.
3. `gpt-image-2` generates a simple full-body character sheet from the portrait.
4. `gpt-image-2` generates a photographic wireframe/storyboard board with 8-10 frames and brief explanations.
5. Seedance 2.0 creates the final 9:16 video from the character sheet, wireframe board, script, and action prompt.

The final job status can surface these URLs while processing:

- `portrait_url`
- `character_sheet_url` or `sheet_url`
- `wireframe_url`
- `video_url` or `result_url`

Open or show each artifact as soon as it appears.

## Selfie Workflow

Before running `agent-media selfie`, collect or infer:

1. **Script or scene action**
   - Preserve a user-provided script verbatim.
   - If there is no speech, pass `--scene-action` and usually `--background-music`.
2. **Character**
   - Run `agent-media character list --json` yourself.
   - Present saved characters by name, never by `char_xxx` id.
   - Never auto-pick a character.
   - If creating a new character, pass `--description`; no photo is required unless the user explicitly provides one.
3. **Director brief**
   - Propose setting, lighting, framing, wardrobe/hair, props/product, body action, subtitles, and music.
   - Put visual identity/look in `--description`.
   - Put product handling, turns, outfit checks, walking, dancing, unboxing, or any non-default behavior in `--scene-action`.
4. **Duration**
   - Allowed values: `5`, `10`, `15`.
   - Natural speech is about 2-4 words/sec.
   - Use 5s for 10-20 words, 10s for 20-40 words, 15s for 30-60 words or action-heavy clips.

Do not pass removed v2 flags: `--preset`, `--vibe`, `--voice-brief`, or `--sync`.

## Example

```bash
agent-media selfie \
  --description "28yo fit blonde woman, stylish natural fragrance UGC creator, cream jacket over fitted white top, loose blonde waves, bright bedroom daylight" \
  --script "This perfume is honestly gorgeous. It smells expensive, soft, and clean, but still gets noticed." \
  --scene-action "standing near a wooden dresser, holding a frosted perfume bottle, showing the label and cap, spraying her wrist, smiling while talking, removing jacket tastefully, turning once, then facing camera again" \
  --duration 15 \
  --subtitles true
```

For progress:

```bash
agent-media status <job_id> --json
```

Poll about every 20-30 seconds when the user expects progress updates.

## Hard Rules

- Never mention credit costs, USD, or pricing unless the user asks; then point to https://agent-media.ai/pricing.
- Never use legacy v1 commands (`ugc`, `product-acting`, `character-video`, `text-to-video`) as fallbacks for v2 Selfie.
- Never ask users to provide `char_xxx` ids.
- Never invent extra spoken dialogue after the script is confirmed.
- Respect "no subs" by passing `--subtitles false`.

## vNext Skill Library (preview)

**For agents, the surface is ONE tool: `make_ugc` ("Agent-Media UGC Video").**
Give it a script plus an optional person/image/saved character and it returns a
finished vertical video — it resolves identity and routes to the right primitive
or composed skill below. Agents never pick a sub-skill. Captions are **opt-in**
(make_ugc asks before adding them), and the same character is reused within a
session unless the user asks for a new one.

The vNext primitive runtime exposes the named **micro-skills** below — each a
thin wrapper around exactly one primitive on the `primitive-vnext-v1` Temporal
task queue. They are the internal building blocks `make_ugc` (and the Skill
Center) compose into multi-step flows — not a menu agents choose from.

**Authoritative library:** [`services/api-v2/src/skills/registry.ts`](services/api-v2/src/skills/registry.ts) — in-code map of slug → primitive + input schema. A future marketplace will persist this shape to a `skills` table.

**Endpoints (feature-flagged behind `VNEXT_PRIMITIVES_ENABLED`):**

- `GET /v1/skills` — list registered skills with their JSON-schema'd inputs.
- `POST /v1/skills/:slug/run` — validate input against the skill's schema, start the underlying primitive workflow on `primitive-vnext-v1`. Honors `Idempotency-Key`. Returns `{run_id, workflow_id, skill, primitive, status}`.

### Currently registered micro-skills

| slug | primitive | input | output |
|---|---|---|---|
| `make_portrait` | `portrait_gpt2` | `description` (required), `setting?`, `aspect_ratio?` (`1:1`\|`9:16`), `realism_target?` (`natural`\|`commercial`\|`raw_iphone`), `reference_photo_url?` (R2-only) | one photoreal portrait PNG at `vnext/primitive-runs/<run_id>/portrait.png` |
| `make_character_sheet` | `character_sheet_gpt2` | **either** `portrait_url` (R2-only) **or** `portrait_image_base64` (PNG/JPEG, ≤10 MB; the API uploads it to R2 first under `vnext/uploads/<user_id>/`), `description?` (≤10 words), `aspect_ratio?` | one character-sheet PNG at `vnext/primitive-runs/<run_id>/character-sheet.png` |
| `make_simple_selfie` | `simple_selfie` | `character_sheet_url` (R2-only), `duration` (`5`\|`10`\|`15`), `script` (word count 2–4 wps), `location?` (≤120 chars), `pose?` (≤120 chars, no holding objects), `aspect_ratio?` (default `9:16`) | one vertical MP4 with native lip-synced audio at `vnext/primitive-runs/<run_id>/simple-selfie.mp4` via Seedance 2.0 fast (BytePlus ARK) |
| `make_subtitles` | `subtitles_v2` | `video_url` (R2-only), `transcript?` (≤5000 chars, optional), `style?` (`hormozi` default \| `tiktok` \| `minimal`), `language?` (2-char ISO), `aspect_ratio?` (default `9:16`) | one MP4 with burned-in captions at `vnext/primitive-runs/<run_id>/subtitled.mp4` via OpenAI Whisper + FFmpeg |
| `make_broll_talking_head` | `composed:broll_talking_head` | `actor_image_url` (any https image; re-hosted to R2), `broll_video_url` (R2-only square video), **either** `script` (Seedance voice, up to 30s) **or** `audio_url` (R2-only, single clip ≤15s), `duration?` (`10`\|`15`\|`20`\|`25`\|`30`, default `20`), `aspect_ratio?` (default `9:16`), `subtitles?`, `overlay_size?` (`small`\|`medium`\|`large` default\|`full`), `overlay_position?` (`bottom` default\|`bottom_left`\|`bottom_right`\|`center`) | one vertical MP4 — an up-to-30s seamless talking head (last-frame-chained ≤10s clips) with the square b-roll looping on the bottom half, at `vnext/primitive-runs/<run_id>/broll-talking-head.mp4` |

Both micro-skills internally call Claude Haiku (`claude-haiku-4-5`) to
build the gpt-image-2 prompt, then OpenAI `gpt-image-2` for the image,
then upload to R2. The generated prompt is persisted into
`primitive_runs.input.generated_prompt` for audit.

### Sample call

```bash
curl -X POST https://api.agent-media.ai/v1/skills/make_character_sheet/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: sara-cs-1" \
  -d '{
    "portrait_url": "https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/vnext/primitive-runs/<id>/portrait.png",
    "description": "Sara, 28 years old"
  }'
```

For the full vNext architecture (primitives, Temporal worker, data plane, operating rules), see [`docs/handover/2026-05-27-primitive-architecture/`](docs/handover/2026-05-27-primitive-architecture/).

### Skill Center UI

Internal browse / run UI lives at **`/dashboard/skills`** on agent-media.ai. Lists every entry in the registry, expands each into a hand-coded form, fires the same `POST /v1/skills/:slug/run` endpoint, and polls `GET /v1/skills/runs/:id` (composed) or `GET /v1/primitives/runs/:id` (standalone) every 4s for live per-step progress. Artifacts open in a new tab as each step completes.

Adding a new skill in the registry auto-exposes it via REST + MCP, and the UI picks it up at next page-load. To get a custom form, add an entry to `FORMS` in [`apps/web/app/(app-dark)/dashboard/skills/page.tsx`](apps/web/app/(app-dark)/dashboard/skills/page.tsx) — otherwise the card shows up with a "call the REST endpoint directly" hint.
