# agent-media — Claude Skill plugin

[![npm — mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)
[![npm — CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)
[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

**Agents: read this whole page. It is everything you need to create UGC videos with agent-media — no other docs required.**

agent-media turns a short description (or a photo) + a script into a finished, captioned, lip-synced vertical UGC video. Works in Claude Code, Cursor, or any MCP / HTTP agent. One Bearer token authenticates everything.

## 1. Connect (pick one)

- **One-liner (recommended):** `npx skills add gitroomhq/agent-media` — installs all of agent-media's skills into your agent (Claude Code, Cursor, etc.).
- **Claude Code plugin (skills + MCP tools):** inside a Claude Code session run `/plugin marketplace add gitroomhq/agent-media` then `/plugin install agent-media@agent-media`.
- **Any MCP agent:** run the MCP server `npx -y -p @agentmedia/mcp-server@latest agent-media-mcp` with env `AGENT_MEDIA_API_KEY=ma_...`. All skills self-describe via `tools/list`.
- **Plain HTTP:** call the REST API directly (below).

## 2. Auth

Get a Bearer token: `npm i -g agent-media-cli && agent-media login` (stores it at `~/.agent-media/credentials.json`), or grab the `ma_*` token from the dashboard. Every call uses `Authorization: Bearer ma_...`. You need credits on the account (buy at agent-media.ai).

## 3. Make a video — `make_ugc` (the one tool)

`make_ugc` is the only generation tool: give it a `script` + a person/image/character and it returns the finished captioned video. Short script → one clip; long monologue → seamless multi-take (never trimmed); add `broll_url` → narrated overlay.

```bash
curl -X POST https://api.agent-media.ai/v1/skills/make_ugc/run \
  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \
  -d '{ "script": "Okay, this changed my whole morning routine — you have to try it.",
        "person": "a friendly 28-year-old woman, soft daylight" }'
#   (captions are opt-in — add "captions": true only if the user asked for them)
# -> 202 { "skill_run_id": "..." }   then poll:
curl https://api.agent-media.ai/v1/skills/runs/<skill_run_id> -H "Authorization: Bearer ma_..."
# when status == "succeeded", final_output.video_url is your MP4.
```

In Claude/Cursor you just say it in words: *"Make a UGC video of a friendly woman saying '…' with TikTok captions."* — the agent calls the one tool, `make_ugc`.

## 4. Calling it (REST / MCP / CLI)

- **REST:** `POST https://api.agent-media.ai/v1/skills/make_ugc/run` (Bearer auth, JSON body) → `202` with a `skill_run_id`.
- **Poll:** `GET /v1/skills/runs/<skill_run_id>` → `final_output.video_url` when `status` is `succeeded`.
- **MCP:** call the `make_ugc` tool; arguments = its input fields.
- **Exact input schema (always current):** `GET https://api.agent-media.ai/v1/public/skills` or MCP `tools/list`. Trust that over any hand-written list.

## Skills

- `make_podcast` (v1.0.0) — Two saved characters recording a podcast in ONE room — the camera cuts to whoever is speaking, and each actor stays in their IDENTICAL seat, desk and mic position across every cut. Provide character_a and character_b (saved char_… ids from list_characters, or https image URLs) and an ordered `script` of A/B dialogue turns (each { speaker: "A" | "B", line: "…" }). The pipeline renders ONE shared two-shot, locks a close-up per actor, animates every turn with native lip-synced Seedance voice (each actor keeps a consistent look AND voice across the whole episode), and hard-cuts the turns together as a 9:16 vertical video. Long turns auto-split into ≤15s takes. Captions are OPT-IN — ask the user first, then set subtitles:true.
- `make_ugc` (v1.0.0) — The ONE tool for UGC video. Give a `script` (any length) and optionally a `person` description, an `image` (photo), or a `character` (saved char_… or sheet URL); it returns the finished vertical video. Short script → one clip; long monologue → full multi-take (never trimmed); pass `broll_url` → narrated b-roll overlay. Captions are OPT-IN — ASK the user if they want them (and which style) before generating; set `captions:true` only if they say yes. You never pick a sub-tool.

Rules: give `make_ugc` the full `script` (any length — it is never trimmed) or a `scene_action` for a silent clip; pass `person`, `image` (https or base64), or `character` (a `char_…` id / sheet URL) for identity, or none for a default person; captions are OFF unless you set them — ASK the user if they want captions and which style first, never add them unprompted. Each run costs credits (see the cost in the skill). Reuse a saved character by passing its `character` on the next call — no re-generation. The other primitives (portrait, character sheet, lip-sync from your own audio, captioning an external video, etc.) stay available over REST/MCP for advanced use.

## Publish to social

Post a generated video to the user's TikTok / Instagram / X — via REST, the CLI, or MCP tools:
- `POST /v1/social/connect { provider }` → returns an OAuth `url` the user opens to authorize (agents can't OAuth for them). CLI: `agent-media social connect x`. MCP: `social_connect`.
- `GET /v1/social/channels` → the user's connected channels `[{ id, name, provider, profile }]`. CLI: `agent-media social channels`. MCP: `social_channels`.
- `POST /v1/social/publish { video_url, channel_ids, caption, type:"now"|"schedule", date? }` → re-hosts the R2 video on the network and posts/schedules it; returns `{ success, media_id, post_ids }`. CLI: `agent-media social publish`. MCP: `social_publish`.

See `skills/publish-to-social/SKILL.md` for the full flow.

## Reference docs

- [reference/auth.md](reference/auth.md) — first-time setup
- [reference/pacing.md](reference/pacing.md) — the 2–4 words-per-second script rule
- [reference/realism-rubric.md](reference/realism-rubric.md) — realism props baked into every prompt

## How this repo is built

This repo is generated. The source of truth is the agent-media private monorepo. A GitHub Action mirrors the `public-skill/` subtree here on every push. Do not commit hand-edits — they will be overwritten.

License: Apache-2.0.
