---
name: 'Agent-Media UGC Playbook'
description: 'Playbook for Agent-Media UGC Video — the one tool for UGC video on agent-media. Always call the single make_ugc skill: give it a `script` (any length) and optionally a person/image/character; it returns the finished captioned vertical video. Short script → one clip, long monologue → full multi-take (never trimmed), `broll_url` → narrated overlay. You never pick a sub-skill.'
allowed-tools: ['mcp__agent-media__make_podcast', 'mcp__agent-media__make_ugc']
x-skill-slug: 'agent-media-ugc'
x-skill-version: '1.1.0'
---
# Agent-Media UGC Playbook

You're an agent (Claude, Cursor, custom) that needs to produce a finished UGC video on agent-media. There is exactly ONE tool — `make_ugc` (Agent-Media UGC Video). You never pick a sub-skill; make_ugc resolves identity and runs the whole pipeline internally.

## One tool, three shapes

| You want | Give make_ugc | Result |
| --- | --- | --- |
| A short clip | a one-line `script` (+ optional person/image/character) | one clean talking-head clip |
| A full monologue | a long `script` (+ a real face via `image` or `character`) | a seamless multi-take video, never trimmed |
| A narrated b-roll review | `script` + `broll_url` + a `character`/`image` | the person narrates over your footage |

## How to call it

A single call. The server picks the pipeline, the take count and the duration, runs it in one Temporal workflow, and returns a `skill_run_id` you poll.

```http
POST https://api.agent-media.ai/v1/skills/make_ugc/run
Authorization: Bearer $AGENT_MEDIA_API_KEY

{
  "script": "Okay this is wild, I tried the new flow and it actually works.",
  "person": "a friendly young woman, soft daylight, candid framing",
  "name": "Maya, 27"
}
```

Poll with `GET /v1/skills/runs/<skill_run_id>` until `status` is `succeeded`; `final_output.video_url` is your finished MP4.

See [skills/make-ugc/SKILL.md](../make-ugc/SKILL.md) for the full field manual.

## Step D — publish it (optional)

Once you have a `video_url`, you can post it straight to the user's TikTok / Instagram / X with the **publish-to-social** skill — `POST /v1/social/publish` (CLI `agent-media social publish`, MCP `social_publish`). The user connects each network once via OAuth (`/v1/social/connect`). See [skills/publish-to-social/SKILL.md](../publish-to-social/SKILL.md).

## Identity

- `person` — describe them in words; `image` — a photo (https URL or base64); `character` — a saved `char_…` id or `character_sheet_url` from list_characters; omit all three for a default person.
- A full monologue or a b-roll review needs a real face — pass `image` or `character`, not just `person`.
- Reuse a saved character: pass the same `character` on the next call — no re-generation.

## Rules

- make_ugc paces and chunks the script for you — pass the FULL line or monologue and do NOT trim it. Length is inferred from the script.
- Any image/video URL you pass must be a public https URL (make_ugc re-hosts it onto R2 for you) — or a `character_sheet_url` / `char_…` for a saved character.
- Credits are deducted as each take runs. Portrait + character-sheet prep inside a video are FREE — you only pay for the video itself.
- Don't put "selfie" or "phone" in a description — say "talking to camera" instead. make_ugc already handles this internally.

## Troubleshooting

- **`INSUFFICIENT_CREDITS`** — user is out. Surface the agent-media.ai billing page link.
- **`make_ugc_needs_face`** — a full monologue or a b-roll review needs `image` or `character` (a real face), not just `person`.
- **Video has subject holding a phone** — they used a pose hint mentioning "selfie" or "phone". Strip it or set `pose: ""`.
- **Step stuck in `submitted`** — Temporal worker may be restarting. Wait 30s and re-poll; if still stuck after 5 min, the workflow is hung — contact agent-media support with the `workflow_id`.

## See also

- [reference/auth.md](../../reference/auth.md) — first-time setup
- [reference/pacing.md](../../reference/pacing.md) — 2–4 words/sec rule with examples
- [reference/realism-rubric.md](../../reference/realism-rubric.md) — the 9 realism props baked into every prompt
