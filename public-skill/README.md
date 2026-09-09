# agent-media

[![npm, mcp-server](https://img.shields.io/npm/v/%40agentmedia%2Fmcp-server?label=%40agentmedia%2Fmcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)
[![npm, CLI](https://img.shields.io/npm/v/agent-media-cli?label=agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)
[![Claude plugin](https://img.shields.io/badge/claude-%2Fplugin%20install-A78BFA)](https://github.com/gitroomhq/agent-media-app)
[![Cursor plugin](https://img.shields.io/badge/cursor-plugin-A78BFA)](https://cursor.com/marketplace)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

**Agents: read this page, then [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md). That is everything.**

agent-media renders video, images and voice from YOUR prompt on the model YOU choose. There is no fixed recipe: you describe the shot like a director, pass a first frame to animate or reference images, clips and audio to follow, pick a model from the catalog (or take the default), and poll for the URL. Works in Claude Code, Claude.ai, Cursor, Codex, Grok, or any MCP / HTTP agent.

## 1. Connect, no API key needed

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

Other routes: **Claude.ai / Desktop**: Settings > Connectors > add custom connector > paste the URL > Connect. **Claude Code**: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`. **Codex**: `codex mcp add agent-media --url https://api.agent-media.ai/mcp`. **Grok**: `grok mcp add agent-media -t http https://api.agent-media.ai/mcp`. **Claude Code plugin**: `/plugin marketplace add gitroomhq/agent-media-app` then `/plugin install agent-media@agent-media`. **Cursor plugin**: Settings > Plugins > search Agent Media > Install, or `/add-plugin agent-media` in chat; the plugin ships this skill plus the hosted MCP server, and Cursor opens the sign-in for you.

## 2. Auth

OAuth (above) is the default and needs no key. You need credits on the account, buy at agent-media.ai. 100 credits = 1 USD.

**API keys** remain supported for CI, scripts, and the local stdio server (`npx @agentmedia/mcp-server`): get one with `npm i -g agent-media-cli && agent-media login` or from the dashboard, then send `Authorization: Bearer ma_...`, including to the same hosted URL above.

## 3. The tools

| Tool | What it does | Credits |
|---|---|---|
| `generate_video` | A clip from your prompt on the model you pick, in one of three modes: text (prompt only), image-to-video (`first_frame`, optional `last_frame`) or reference (`refs`, `video_refs`, `audio_refs`, addressed as @image1 @video1 @audio1). Native speech when the words are in the prompt. | seconds x the per-second rate at the chosen quality (seedance-2.0: 15 credits/s at 480p, 30 at 720p, 75 at 1080p; seedance-2.5: 50 credits/s at 480p, 99 at 720p, 180 at 1080p); reference clip seconds are billed like output seconds |
| `generate_image` | One image from your prompt; with refs it edits/composes from them. The way to build a portrait, a product frame or a first frame for a video. | 20 per image |
| `generate_audio` | Text to speech in a named voice. For voiceover over b-roll, or an audio reference for a clip; a talking head does not need it. | 1 per 100 characters |
| `quote` | The price of any of the above without running it. | 0 |
| `list_models` | The catalog: modes, limits, prices per quality, what each model is good and bad at, how to select it, recent results. | 0 |
| `list_characters` | Saved characters (sheet + portrait URLs) to pass as `refs`. | 0 |
| `get_run_status` | Poll a job id until it is done; returns the URL. | 0 |
| `upload_image` | A file on disk, or bytes, or a foreign URL in; an https URL out. Call it before passing a photo. | 0 |
| `rate_run` | Say what you thought of a finished run, 1 to 5 plus a note. Feeds the per-model stats and `model:"auto"`. | 0 |

## 4. Ten-second tour

```text
generate_video { "prompt": "A 28-year-old woman in a bright kitchen, phone-camera framing, holds a small serum bottle up to the lens and says: \"Okay, I did not expect this to actually work.\" Natural skin, soft window light, slight head tilt.", "seconds": 5 }
-> job_id ... (150 credits at 720p)
get_run_status { "run_id": "...", "wait": true }   (repeat until completed)
-> Video: https://.../video.mp4
```

Same face across a series: `generate_image` a portrait once, then pass that URL in `refs` on every `generate_video` and call it @image1 in the prompt. Product in hand: pass the product photo (via `upload_image`) in `refs` and say where it is. Animate a still: pass it as `first_frame` (and a `last_frame` to say where the motion ends). Follow a clip's motion: pass it in `video_refs` and describe the new clip as @video1. Frames and refs cannot be mixed on Seedance: one or the other per call.

## 5. Models

| Model | Kind | Price | Modes and limits | Best for |
|---|---|---|---|---|
| `seedance-2.0` (default) | video | 15 credits/s at 480p, 30 at 720p, 75 at 1080p | text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p; image-to-video (first_frame + optional last_frame): 4 to 15 s, default aspect adaptive, 480p/720p/1080p; reference (refs / video_refs / audio_refs, up to 9 images, 3 clips, 15 s total, 3 audio, 15 s total, not alone): 4 to 15 s, default aspect 9:16, 480p/720p/1080p | talking-head UGC; product in hands |
| `seedance-2.5` | video | 50 credits/s at 480p, 99 at 720p, 180 at 1080p | text (prompt only): 4 to 15 s, default aspect 9:16, 480p/720p/1080p; image-to-video (first_frame + optional last_frame): 4 to 15 s, aspect adaptive only, 480p/720p/1080p; reference (refs / video_refs / audio_refs, up to 30 images, 10 clips, 30 s total, 10 audio, 30 s total): 4 to 15 s, default aspect 9:16, 480p/720p/1080p | hero product ads; close-up faces |
| `gpt-image-2.5` (default) | image | 20 credits per image | 1024x1024, 1024x1536, 1536x1024; refs up to 4 | portraits and character sheets that a video has to keep; the first frame of a clip |
| `gpt-image-2.5-flare` | image | 20 credits per image | 1024x1024, 1024x1536, 1536x1024; refs up to 4 | variants and drafts at the same quality tier; batches of frames |
| `gpt-image-2` | image | 20 credits per image | 1024x1024, 1024x1536, 1536x1024; refs up to 4 | the previous generation, kept selectable for runs that were built on it |
| `elevenlabs-tts` (default) | audio | 1 credit per 100 characters | up to 4000 characters per call | voiceover on b-roll; narration |

Full guide with the avoid-for column, the per-mode table and one page per model: [reference/models.md](reference/models.md). Planned models are listed there too, they cannot be selected until a real run is recorded. `list_models` also carries `recent`: the last 30 days of real runs per model (fail rate, auto-judge score, user ratings, typical render time); pass `model: "auto"` and the printed policy picks from those numbers.

## 6. REST

- `POST https://api.agent-media.ai/v2/generate/{video|image|audio}` (Bearer, JSON body = the tool arguments) returns `201 { job_id, credits_deducted, status_url }`
- `POST https://api.agent-media.ai/v2/quote/{video|image|audio}` returns `{ credits, usd, model, breakdown }`
- `GET https://api.agent-media.ai/v1/videos/{job_id}` returns `{ status, video_url }` (the URL is an image or mp3 for those kinds)
- `GET https://api.agent-media.ai/v1/models` returns the catalog, public
- Exact input schemas: MCP `tools/list`, or [reference/tools.md](reference/tools.md). Trust those over any hand-written list.

## Publish to social

Post a generated video to the user's TikTok / Instagram / X via `POST /v1/social/*`, see [skills/publish-to-social/SKILL.md](skills/publish-to-social/SKILL.md).

## Reference docs

- [skills/agent-media/SKILL.md](skills/agent-media/SKILL.md), the skill: modes, prompting, recipes, rules
- [reference/models.md](reference/models.md), which model for what, with the per-mode limits and prices
- [reference/prompting.md](reference/prompting.md), how to write a prompt that comes out real
- [reference/recipes.md](reference/recipes.md), talking head, product in hand, animate a still, first and last frame, match a reference clip, crazy look, b-roll voiceover, series
- [reference/tools.md](reference/tools.md), every tool with its exact input schema
- [reference/auth.md](reference/auth.md), first-time setup

## How this repo is built

This directory is generated from the agent-media monorepo (`pnpm --filter api-v2 gen:public-skill`); CI fails if it drifts from the code. Do not hand-edit.

License: Apache-2.0.
