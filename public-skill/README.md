# agent-media — Claude Skill plugin

[![npm — mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)
[![npm — CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)
[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media-app)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

**Agents: read this page, then [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md). That is everything.**

agent-media renders video, images and voice from YOUR prompt on the model YOU choose. There is no fixed recipe: you describe the shot like a director, pass reference images for identity, pick a model from the catalog (or take the default), and poll for the URL. Works in Claude Code, Claude.ai, Cursor, Codex, Grok, or any MCP / HTTP agent.

## 1. Connect — no API key needed

```
https://api.agent-media.ai/mcp
```

The hosted connector speaks OAuth 2.1 with dynamic client registration: your agent registers itself, opens a sign-in page, and gets a token. Nothing to copy.

**Paste this to your agent and it sets itself up:**

```text
Set up agent-media for me so I can generate videos, images and voice from here.
1. Add the agent-media MCP server: https://api.agent-media.ai/mcp (Streamable HTTP).
2. Authenticate: complete the sign-in in the browser it opens.
3. Install the companion skill: run `npx skills add gitroomhq/agent-media-app`.
Once that's done, call list_models and tell me what you can make.
```

Other routes: **Claude.ai / Desktop** → Settings → Connectors → add custom connector → paste the URL → Connect. **Claude Code** → `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`. **Codex** → `codex mcp add agent-media --url https://api.agent-media.ai/mcp`. **Grok** → `grok mcp add agent-media -t http https://api.agent-media.ai/mcp`. **Claude Code plugin** → `/plugin marketplace add gitroomhq/agent-media-app` then `/plugin install agent-media@agent-media`.

## 2. Auth

OAuth (above) is the default and needs no key. You need credits on the account — buy at agent-media.ai. 1 credit = $0.01.

**API keys** remain supported for CI, scripts, and the local stdio server (`npx @agentmedia/mcp-server`): get one with `npm i -g agent-media-cli && agent-media login` or from the dashboard, then send `Authorization: Bearer ma_...` — including to the same hosted URL above.

## 3. The tools

| Tool | What it does | Credits |
|---|---|---|
| `generate_video` | A clip from your prompt (+ reference images) on the model you pick. Native speech when the words are in the prompt. | seconds × the model's per-second rate (seedance-2.0: 30/s, seedance-2.5: 99/s) |
| `generate_image` | One image from your prompt; with refs it edits/composes from them. The way to build a portrait or product frame for a video. | 20 per image |
| `generate_audio` | Text to speech in a named voice. For voiceover over b-roll — a talking head does not need it. | 1 per 100 characters |
| `quote` | The price of any of the above without running it. | 0 |
| `list_models` | The catalog: what each model is good and bad at, limits, price, how to select it. | 0 |
| `list_characters` | Saved characters (sheet + portrait URLs) to pass as `refs`. | 0 |
| `get_run_status` | Poll a job id until it is done; returns the URL. | 0 |
| `upload_image` | Bytes in, https URL out. Call it before passing a photo. | 0 |

## 4. Ten-second tour

```text
generate_video { "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \"Okay, I did not expect this to actually work.\" Natural skin, soft window light, slight head tilt.", "seconds": 5 }
→ job_id … (150 credits)
get_run_status { "run_id": "…", "wait": true }   (repeat until completed)
→ Video: https://…/video.mp4
```

Same face across a series: `generate_image` a portrait once, then pass that URL in `refs` on every `generate_video`. Product in hand: pass the product photo (via `upload_image`) in `refs` and say where it is in the prompt.

## 5. Models

| Model | Kind | Price | Best for |
|---|---|---|---|
| `seedance-2.0` (default) | video | 30 credits/second | talking-head UGC; product in hands |
| `seedance-2.5` | video | 99 credits/second | hero product ads; close-up faces |
| `gpt-image-2` (default) | image | 20 credits/image | portraits; character sheets |
| `elevenlabs-tts` (default) | audio | 0.01 credits/character | voiceover on b-roll; dubbing |

Full guide with the avoid-for column and one page per model: [reference/models.md](reference/models.md). Planned models are listed there too — they cannot be selected until a real run is recorded.

## 6. REST

- `POST https://api.agent-media.ai/v2/generate/{video|image|audio}` (Bearer, JSON body = the tool arguments) → `201 { job_id, credits_deducted, status_url }`
- `POST https://api.agent-media.ai/v2/quote/{video|image|audio}` → `{ credits, usd, model, breakdown }`
- `GET https://api.agent-media.ai/v1/videos/{job_id}` → `{ status, video_url }` (the URL is an image or mp3 for those kinds)
- `GET https://api.agent-media.ai/v1/models` → the catalog, public
- Exact input schemas: MCP `tools/list`, or [reference/tools.md](reference/tools.md). Trust those over any hand-written list.

## Publish to social

Post a generated video to the user's TikTok / Instagram / X via `POST /v1/social/*` — see [skills/publish-to-social/SKILL.md](skills/publish-to-social/SKILL.md).

## Reference docs

- [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md) — the skill: prompting, recipes, rules
- [reference/models.md](reference/models.md) — which model for what, with prices
- [reference/prompting.md](reference/prompting.md) — how to write a prompt that comes out real
- [reference/recipes.md](reference/recipes.md) — talking head, product in hand, crazy look, b-roll voiceover, series
- [reference/tools.md](reference/tools.md) — every tool with its exact input schema
- [reference/auth.md](reference/auth.md) — first-time setup

## How this repo is built

This directory is generated from the agent-media monorepo (`pnpm --filter api-v2 gen:public-skill`); CI fails if it drifts from the code. Do not hand-edit.

License: Apache-2.0.
