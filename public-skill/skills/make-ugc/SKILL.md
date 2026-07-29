---
name: 'Agent-Media UGC Video'
description: 'The ONE tool for UGC video. Give a `script` (any length) and optionally a `person` description, an `image` (photo), or a `character` (saved char_… or sheet URL); it returns the finished vertical video. Short script → one clip; long monologue → full multi-take (never trimmed); pass `broll_url` → narrated b-roll overlay. Captions are OPT-IN — ASK the user if they want them (and which style) before generating; set `captions:true` only if they say yes. You never pick a sub-tool.'
allowed-tools: ['mcp__agent-media__make_ugc']
x-skill-slug: 'make_ugc'
x-skill-version: '1.0.0'
x-primitive: 'composed:make_ugc'
x-mcp-tool: 'mcp__agent-media__make_ugc'
---
# Agent-Media UGC Video

**One tool. One call. A finished, captioned, vertical UGC video.**

You give a `script` and (optionally) who says it — agent-media picks the pipeline, the take count, and the duration for you. You NEVER pick a sub-tool:

- **Short line** → one clean talking-head clip.
- **Full monologue** (any length) → a seamless multi-take video, **never trimmed to fit a clip**.
- **`broll_url`** → the person narrates over your b-roll / gameplay / product footage.

## Inputs

**What they say** — exactly one of:
- `script` — the spoken line, **any length**. A sentence becomes one clip; a paragraph becomes the full multi-take video. Never trimmed.
- `scene_action` — a silent clip instead (dancing, b-roll, vibes). Requires a `character`.

**Who says it** — optional, pass at most one (omit → a default person is generated):
- `person` — describe them in words, e.g. `"a 25-year-old woman with curly red hair"`.
- `image` — a photo of the person: a public `https` URL **or** base64. The face is locked to it.
- `character` — reuse a saved character: its `char_…` id (from `list_characters`) **or** its `character_sheet_url`.
- `name` — optional name/age/vibe hint, e.g. `"Sophia, 28"`.

> A **long monologue** or a **`broll_url`** review needs a real face — pass `image` or `character`, not just `person`.

**Captions are OPT-IN — do NOT add them on your own.** First ASK the user whether they want captions and which `caption_style` (`hormozi` | `tiktok` | `minimal`); set `captions:true` only if they say yes, otherwise leave it off.

**Look & format** — all optional:
- `captions` — off unless set true (ask first, above); `caption_style` (`hormozi` | `tiktok` | `minimal`)
- `look` (`natural` | `commercial` | `raw_iphone`), `aspect_ratio` (`9:16` | `1:1`)
- `broll_url` — an `https` video overlaid on the lower half while they narrate.
- `duration` — leave blank; length is inferred from the script. Set only to force a short clip.

## Examples

A quick clip from a text description:
```json
{ "script": "Honestly? This app saved my whole morning routine.", "person": "a friendly young woman, soft daylight" }
```

A full monologue from a saved character — multi-take, never trimmed:
```json
{ "script": "Okay I have to be honest with you for a second. Three months ago I was completely overwhelmed … (the entire monologue, as long as you like) … and that is your sign.", "character": "char_8f3ac210" }
```

From a photo of a real person:
```json
{ "script": "Wait — you have to see what this actually does.", "image": "https://example.com/face.jpg", "name": "Maya, 27" }
```

A narrated b-roll / gameplay review:
```json
{ "script": "Watch this play — this is where the whole match turns around.", "broll_url": "https://example.com/clip.mp4", "character": "char_8f3ac210" }
```

## Reuse the same person across a session

After a video finishes, the character is **saved** — `GET /v1/characters` lists it with a `character_id` (`char_…`) and a `character_sheet_url`. For the NEXT video in the same task, pass that as `character` instead of a new `person`: it keeps the exact same face, and it's faster + cheaper because it reuses the existing portrait + character sheet rather than re-making them (the character sheet is never skipped — it's reused). Only generate a NEW person when the user asks for a different one. **If you're not sure whether they want the same person or a new one, ASK the user before generating.**

## How to call it

Preferred path: MCP tool `mcp__agent-media__make_ugc`. The full schema is auto-published via `tools/list`; the fields above are the manual.

Fallback path: REST.
```http
POST https://api.agent-media.ai/v1/skills/make_ugc/run
Authorization: Bearer $AGENT_MEDIA_API_KEY
Content-Type: application/json
Idempotency-Key: <any unique string per intent>

{ "script": "Okay this completely changed how I work — I plan my whole week in ten minutes now.", "character": "char_8f3ac210" }
```

## Cost & timing

- Credits: `route-dependent: ~190–505 for a short clip; priced per-take for a long monologue or b-roll review`
- Wall time (typical): `360–1400s`
- Deducted as each take runs.

## Polling the result

```http
GET https://api.agent-media.ai/v1/skills/runs/<skill_run_id>
Authorization: Bearer $AGENT_MEDIA_API_KEY
```

Returns per-step `status` + `current_step`; `final_output.video_url` is your finished MP4 when `status` is `succeeded`.

**Keep the user posted — don't go silent.** A video takes a few minutes: a new person runs portrait → character sheet → the video (→ captions if asked); reusing a saved person skips straight to the video. When you submit, tell the user the plan + a rough ETA, then poll and report each `current_step` as it changes (e.g. "building the character sheet…", "rendering the video…", "adding captions…") so they always know what's happening.

## House rules

- See [reference/realism-rubric.md](../../reference/realism-rubric.md) for the realism doctrine baked into every prompt.
- See [reference/pacing.md](../../reference/pacing.md) — you don't manage pacing; make_ugc sizes every take to the words.
- See [reference/auth.md](../../reference/auth.md) for first-time install and `agent-media login`.

## Source of truth

Auto-generated by `scripts/generate-public-skill.ts` from `services/api-v2/src/skills/registry.ts`. Do not hand-edit; CI rejects drift.
