# agent-media CLI

**UGC for developers. Generate AI videos with talking heads, B-roll, voiceover, and subtitles — from your terminal.**

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

# 2. Pick an actor
agent-media actor list

# 3. Generate a UGC video
agent-media ugc "Stop scrolling. This tool changed everything for me." \
  --actor sofia --style neon --duration 10 --sync

# 4. Add subtitles to any video
agent-media subtitle ./video.mp4 --style hormozi --sync
```

## UGC Pipeline

Script → scene splitting → TTS voiceover → AI talking heads → AI B-roll → crossfade assembly → animated subtitles → background music → end screen CTA

```bash
# Basic UGC with actor
agent-media ugc "your script..." --actor marcus --style tiktok --sync

# With B-roll cutaway scenes
agent-media ugc "your script..." --actor sofia --broll --sync

# With product screenshots as B-roll
agent-media ugc "your script..." --actor sofia --broll \
  --broll-images ./dashboard.png,./calendar.png --sync

# AI-generated script from a product description
agent-media ugc -g "A fitness tracker that monitors sleep quality" --actor naomi --sync

# PIP mode (talking head + rotating B-roll overlays)
agent-media ugc "your script..." --actor adaeze --pip --duration 15 --sync

# Product Acting UGC from a product image URL
agent-media product-acting \
  --product-image https://cdn.example.com/product.png \
  --actor sofia \
  --about "A premium perfume with a warm vanilla dry-down" \
  --template product-in-hand \
  --acting-style honest-review \
  --sync
```

## UGC Flags

| Flag | Description |
|------|-------------|
| `--actor <slug>` | AI actor for talking heads (required) |
| `--style <name>` | Subtitle style (17 options — see below) |
| `-d, --duration <s>` | 5, 10, or 15 seconds |
| `--tone <name>` | energetic, calm, confident, dramatic |
| `--music <genre>` | chill, energetic, corporate, dramatic, upbeat |
| `--aspect <ratio>` | 9:16, 16:9, 1:1 |
| `--cta <text>` | End screen call-to-action |
| `--broll` | Enable AI B-roll cutaways |
| `--broll-images <urls>` | Image URLs for B-roll |
| `--pip` | PIP mode |
| `--template <slug>` | monologue, testimonial, problem-solution, saas-review, before-after, listicle, product-demo |
| `--voice-speed <n>` | TTS speed (0.7–1.5) |
| `-g, --generate-script` | AI-generate script from description |
| `-s, --sync` | Wait for completion |

## Subtitle Styles (17)

hormozi, minimal, bold, karaoke, clean, tiktok, neon, fire, glow, pop, aesthetic, impact, pastel, electric, boxed, gradient, spotlight

## All Commands

```bash
agent-media ugc "script..."                # Generate UGC video
agent-media saas-review --saas Linear      # Generate a SaaS Review video
agent-media product-acting --product-image https://... --actor sofia --about "..." --sync
agent-media actor list                     # Browse 200+ AI actors
agent-media subtitle ./video.mp4           # Add subtitles
agent-media status <job-id>                # Check job status
agent-media download <job-id>              # Download video
agent-media list                           # List your jobs
agent-media credits                        # View credit balance
agent-media subscribe                      # Subscribe or buy credits
agent-media apikey list                    # Manage API keys
agent-media whoami                         # Current user info
agent-media doctor                         # Run diagnostics
agent-media update                         # Update CLI + Claude Code skill docs
```

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

Skill docs are refreshed from `gitroomhq/agent-media` with Claude Code selected non-interactively:

```bash
npx --yes skills add gitroomhq/agent-media --agent claude-code --yes
```

Self-updates use npm by default. If you intentionally manage global packages with pnpm or yarn, set `AGENT_MEDIA_UPDATE_PM=pnpm` or `AGENT_MEDIA_UPDATE_PM=yarn`.

## Pricing

| Plan | Price | Credits/month | ~10s Videos |
|------|-------|---------------|-------------|
| Creator | $39/mo | 3,900 | ~13 |
| Pro | $69/mo | 6,900 | ~23 |
| Pro Plus | $129/mo | 12,900 | ~43 |

30 credits/sec. Pay-as-you-go: 3,900 credits for $39.

## Also Available

| Package | Description |
|---|---|
| [`@agentmedia/sdk`](https://www.npmjs.com/package/@agentmedia/sdk) | TypeScript SDK |
| [`agent-media`](https://pypi.org/project/agent-media/) | Python SDK |
| [`@agentmedia/mcp-server`](https://www.npmjs.com/package/@agentmedia/mcp-server) | MCP server for Claude Code, Cursor, Windsurf |

## Links

- [Interactive API Docs](https://agent-media.ai/docs/api-reference)
- [OpenAPI Spec](https://agent-media.ai/openapi.json)
- [Website](https://agent-media.ai)
- [GitHub](https://github.com/gitroomhq/agent-media)

## License

Apache-2.0
