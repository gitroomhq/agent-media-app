# agent-media CLI

**AI UGC video from your terminal. Describe a person, give them a script, get a 9:16 selfie clip with native audio and subtitles.**

[![npm version](https://img.shields.io/npm/v/agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)
[![downloads](https://img.shields.io/npm/dm/agent-media-cli)](https://www.npmjs.com/package/agent-media-cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Install

```bash
npm install -g agent-media-cli
```

## Quick Start

```bash
# 1. Log in
agent-media login

# 2. Generate a selfie clip from a description and a script
agent-media selfie \
  --description "woman in her late 20s, warm and approachable, natural makeup, casual" \
  --script "Stop scrolling. This tool changed everything for me." \
  --duration 10

# 3. Follow the job, then download the mp4
agent-media status <job-id> --watch
agent-media download <job-id> -o clip.mp4
```

## Selfie pipeline

Portrait from your description (or your photo) → multi-pose character sheet → photographic storyboard → Seedance animates the scene with native audio → optional polish pass and Hormozi-style subtitles.

```bash
# Exact likeness: pair a reference photo with the description
agent-media selfie --photo ./me.png --description "..." --script "..."

# Reuse a saved character across clips
agent-media character create --photo ./me.png --name jordan
agent-media selfie --character char_XXXXXXXXXX --script "..."

# Pin the scene and the energy
agent-media selfie --description "..." --script "..." \
  --shot-preset kitchen-glow-up --vibe calm

# Silent reaction clip with a burned caption
agent-media crazy-look --help

# Burn subtitles onto any hosted video (17 styles)
agent-media subs --video https://cdn.example.com/clip.mp4 --style hormozi
```

## Selfie flags

| Flag | Description |
|------|-------------|
| `--description <text>` | Who the person is. agent-media generates them from this text |
| `--photo <file\|url>` | Optional reference photo for an exact likeness |
| `--character <id>` | Saved character id instead of description + photo |
| `--script <text\|@file>` | What they say. `@file` reads from a file |
| `--scene-action <text>` | What they are doing, for non-speech clips |
| `--background-music [text]` | Add music, optionally with a direction |
| `--duration <seconds>` | 5, 10 or 15 (default 10) |
| `--subtitles <bool>` | Burn subtitles (default true) |
| `--shot-preset <preset>` | Pin the composition (bedroom-morning-ritual, kitchen-glow-up, car-quick-honest-review, ... or `custom-scene:<text>`) |
| `--vibe <vibe>` | excited, calm, sassy, serious, curious |
| `--camera-handheld` | Handheld motion. Locked camera is the default |
| `--phone-in-frame <mode>` | forbidden, optional, required |
| `--polish <intensity>` | off, default, heavy |
| `--engine <name>` | seedance-2.0 (default) or seedance-2.5 |

Run `agent-media selfie --help` for the full list of presets.

## Credits

1 credit = $0.01. A selfie clip on seedance-2.0 costs 75 credits plus 60 per second: 375 for 5s, 675 for 10s, 975 for 15s. seedance-2.5 is 75 plus 125 per second. Failed jobs are refunded automatically. Plans and top-ups: [agent-media.ai/pricing](https://agent-media.ai/pricing).

## All commands

```bash
agent-media selfie ...                     # Generate a selfie clip
agent-media character create|list|show     # Saved characters
agent-media crazy-look ...                 # Silent reaction clip
agent-media subs --video <url>             # Burn subtitles
agent-media product-acting ...             # Product-in-hand clip with a library actor
agent-media actor list                     # Actor library for product-acting
agent-media status <job-id> --watch        # Follow a job
agent-media download <job-id>              # Download the mp4
agent-media list                           # List your jobs
agent-media credits                        # Credit balance
agent-media subscribe                      # Subscribe or buy credits
agent-media apikey list                    # Manage API keys
agent-media whoami                         # Current user info
agent-media doctor                         # Diagnostics
agent-media update                         # Update CLI + Claude Code skill docs
```

## Retired on 2026-09-22

`agent-media ugc`, `saas-review`, `review` and `persona` are gone. They rendered on the v1 UGC pipeline, whose talking-head model was discontinued by its provider. The API answers `410 GENERATOR_RETIRED` on the old endpoints. Use `agent-media selfie` instead: it generates the person on every run, keeps them consistent across clips through saved characters, and ships native audio.

## Updates

```bash
# Update the global CLI package and refresh Claude Code skill docs
agent-media update

# Preview what would update without changing anything
agent-media update --check

# Force reinstall the latest npm CLI and refresh the Claude Code skill
agent-media update --force

# Update only one side when needed
agent-media update --cli-only
agent-media update --skills-only
```

Skill docs are refreshed from `gitroomhq/agent-media-app` with Claude Code selected non-interactively:

```bash
npx --yes skills add gitroomhq/agent-media-app --agent claude-code --yes
```

Self-updates use npm by default. If you intentionally manage global packages with pnpm or yarn, set `AGENT_MEDIA_UPDATE_PM=pnpm` or `AGENT_MEDIA_UPDATE_PM=yarn`.

## Also available

| Package | Description |
|---|---|
| [`@agentmedia/sdk`](https://www.npmjs.com/package/@agentmedia/sdk) | TypeScript SDK |
| [`agent-media`](https://pypi.org/project/agent-media/) | Python SDK |
| [`@agentmedia/mcp-server`](https://www.npmjs.com/package/@agentmedia/mcp-server) | MCP server for Claude Code, Cursor, Windsurf |

## Links

- [Docs](https://agent-media.ai/docs)
- [OpenAPI Spec](https://api.agent-media.ai/openapi.json)
- [Website](https://agent-media.ai)
- [GitHub](https://github.com/gitroomhq/agent-media-app)

## License

Apache-2.0
