// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NextResponse } from 'next/server';

const LLMS_FULL_TXT = `# agent-media — Full LLM Context

> UGC for developers. Generate AI videos with talking heads, B-roll, voiceover, and subtitles via API, CLI, SDK, or MCP server. Plans start at $39/month.

## What is agent-media?

agent-media is a developer-first platform for AI UGC (user-generated content) video generation. Write a script, pick an AI actor, get a polished video with talking heads, B-roll, voiceover, and animated subtitles. Available as:

1. REST API v2 with OpenAPI spec and interactive Scalar docs
2. TypeScript SDK: \`npm install @agentmedia/sdk\`
3. Python SDK: \`pip install agent-media\`
4. CLI: \`npm install -g agent-media-cli\` (30 commands)
5. MCP Server: \`npx @agentmedia/mcp-server\` — one tool, make_ugc, that turns a script (plus an optional person, image, or saved character) into a finished vertical video, for Claude Code, Cursor, Windsurf
6. Web dashboard at https://agent-media.ai

## UGC Pipeline (Flagship Feature)

The UGC pipeline turns a script into a polished video:
- Script → scene splitting → TTS voiceover → AI talking heads + AI B-roll → crossfade assembly → animated subtitles → background music → end screen CTA
- Auto voice detection from face photo
- Subtitles are opt-in — added only when you request them. When you do, pick from 17 styles (hormozi is the default style): hormozi, minimal, bold, karaoke, clean, tiktok, neon, fire, glow, pop, aesthetic, impact, pastel, electric, boxed, gradient, spotlight

### UGC Commands
\`\`\`bash
# Basic UGC generation
agent-media ugc "your script text here..." --sync

# With face photo for talking heads + auto voice detection
agent-media ugc "script..." --face-url ./photo.png --sync

# Full options
agent-media ugc "script..." --face-url ./photo.png --style hormozi --duration 15 --aspect 9:16 --music chill --cta "Follow for more" --sync
\`\`\`

### UGC Flags
| Flag | Description | Example |
|------|-------------|---------|
| --actor | Library actor for talking heads (200+) | --actor naomi |
| --voice | TTS voice | --voice nova |
| --face-url | Face photo for talking heads | --face-url photo.png |
| --persona | Use saved persona | --persona brand-voice |
| --style | Subtitle style | --style hormozi |
| --duration | Target duration (5/10/15) | --duration 15 |
| --aspect | Aspect ratio | --aspect 16:9 |
| --music | Background music genre | --music chill |
| --cta | End screen text | --cta "Follow for more" |
| --broll | Enable B-roll cutaway scenes | --broll |
| --broll-images | Comma-separated image URLs for B-roll | --broll-images url1,url2 |
| --sync | Wait for completion | --sync |

## SaaS Review Videos

Generate AI review videos for any SaaS product — provide the name + screenshots and get a complete video:
\\\`\\\`\\\`bash
# Full SaaS review with product screenshots
agent-media review --saas "Postiz" --screenshots url1.png,url2.png --actor naomi --sync

# With angle and talking points
agent-media review --saas "Cursor" --angle enthusiastic \\\\
  --talking-points "AI code completion, fast" --actor sofia --sync
\\\`\\\`\\\`

### Review Flags
| Flag | Description | Example |
|------|-------------|---------|
| --saas | Product name (required) | --saas "Linear" |
| --screenshots | Screenshot URLs for B-roll (required, 1-3) | --screenshots url1,url2 |
| --angle | Review angle: honest, enthusiastic, roast, tutorial, comparison | --angle roast |
| --talking-points | Key points to mention | --talking-points "fast, AI-powered" |

## Subtitles

Add animated subtitles to any video:
\`\`\`bash
agent-media subtitle <video-or-job-id> --style bold --sync
\`\`\`

## Persona Management

Save voice + face combos for consistent UGC:
\`\`\`bash
agent-media persona create --name "brand-voice" --voice ./sample.mp3 --face ./photo.png
agent-media persona list
agent-media persona delete <persona-id>
\`\`\`

## Installation

\`\`\`bash
npm install -g agent-media-cli
\`\`\`

## Authentication

\`\`\`bash
agent-media login
# Opens browser to authenticate and stores session locally
\`\`\`

## Usage Examples

### Generate a UGC video from a script
\`\`\`bash
agent-media ugc "Ever wonder why some videos go viral? It's not luck..." --sync
\`\`\`

### UGC with face photo
\`\`\`bash
agent-media ugc "Your script here..." --face-url ./photo.png --style hormozi --sync
\`\`\`

### Check credits
\`\`\`bash
agent-media credits
\`\`\`

## CLI Commands (28 total)

### UGC & Subtitles
- ugc: Generate a UGC video from a script
- review: Generate a SaaS review video (name + screenshots → video)
- subtitle: Add animated subtitles to any video
- actor list: Browse 200+ pre-made AI actors
- persona list/create/delete: Manage voice + face personas

### Job Management
- status: Check job status
- list: List recent jobs
- download: Download generated media
- cancel: Cancel a job and refund credits
- retry: Retry a failed job

### Account & Billing
- login/logout: Authentication
- whoami: Current user info
- credits: Check credit balance
- subscribe: Manage subscription
- And more (run \`agent-media --help\` for full list)

## Pricing

| Plan | Monthly Price | Credits | Best For |
|------|-------------|---------|----------|
| Creator | $39 | 3,900 | ~13 10s videos, regular UGC and content creation |
| Pro | $69 | 6,900 | ~23 10s videos, professional UGC workflows |
| Pro Plus | $129 | 12,900 | ~43 10s videos, high-volume UGC production |

Extra credit pack: 3,900 credits for $39. A 10s video costs ~300 credits ($3).

## How agent-media Compares

agent-media is the only CLI tool offering a complete UGC pipeline (script → video with talking heads, B-roll, voiceover, and subtitles) from the terminal.

## Technical Details

- Runtime: Node.js (npm package)
- Package: agent-media-cli on npm
- Binary: agent-media
- Version: 1.5.0
- License: Apache-2.0
- Repository: https://github.com/gitroomhq/agent-media
- Website: https://agent-media.ai
- Backend: Supabase Edge Functions
- Payments: Stripe

## REST API Reference

Base URL: \`https://api.agent-media.ai/v1\`

Authentication: Bearer token via API key (\`Authorization: Bearer ma_xxx\`).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/videos | Create a video generation job |
| GET | /api/v1/videos | List video jobs (paginated) |
| GET | /api/v1/videos/:id | Get video job status |
| DELETE | /api/v1/videos/:id | Soft-delete a video |
| POST | /api/v1/videos/:id/cancel | Cancel a job (refunds credits) |
| GET | /v1/actors | List AI actors (filterable). Public endpoint — no API key required. Use ?slug=... for single-actor lookup. |
| GET | /api/v1/account | Account info, credits, plan |
| GET | /api/v1/account/usage | Usage statistics (7d/30d/90d) |
| POST | /api/v1/account/keys | Create an API key |
| GET | /api/v1/account/keys | List API keys |
| DELETE | /api/v1/account/keys/:keyId | Revoke an API key |

### Video Creation (POST /api/v1/videos)

Required: \`script\` (50-3000 chars) OR \`prompt\` (for AI script generation).

Core params: \`actor_slug\`, \`target_duration\` (5/10/15), \`style\` (17 subtitle styles, default: hormozi).

Advanced params: \`tone\` (energetic/calm/confident/dramatic), \`voice_speed\` (0.7-1.5), \`music\` (chill/energetic/corporate/dramatic/upbeat), \`cta\` (max 100 chars), \`aspect_ratio\` (9:16/16:9/1:1), \`template\` (monologue/testimonial/problem-solution/saas-review/before-after/listicle/product-demo), \`allow_broll\`, \`broll_images\` (array, max 10), \`product_image_url\`, \`dub_language\` (BCP-47 code), \`webhook_url\`, \`composition_mode\` ("pip"), \`pip_options\` ({position, size, animation, frame_style}), \`scenes\` (array of {type, text, visual_prompt, image}).

Response: \`{ job_id, status: "submitted", estimated_duration, credits_deducted, selected_voice, voice_auto_detected }\`

### Credit Costs

30 credits/second: 5s = 150 credits, 10s = 300 credits, 15s = 450 credits. AI script generation adds 5 credits.

### Error Format

\`{ error: { code, message, type } }\` where type is one of: validation_error (400), authentication_error (401/403), insufficient_credits (402), not_found (404), rate_limit_error (429), server_error (500).

### Subtitle Styles (17)

hormozi (default), minimal, bold, karaoke, clean, tiktok, neon, fire, glow, pop, aesthetic, impact, pastel, electric, boxed, gradient, spotlight.

### Webhooks

Pass \`webhook_url\` (HTTPS, max 2048 chars) in the POST body. agent-media POSTs to that URL when the job completes or fails.

On success: \`{ job_id, status: "completed", video_url }\`.
On failure: \`{ job_id, status: "failed", error_message }\`.

Retry policy: 3 attempts with exponential backoff (1s, 4s, 16s) on non-2xx responses. After that the webhook is abandoned — poll GET /api/v1/videos/:id for the result. The completed video is also accessible on the \`output_url\` field of the job record.

To verify authenticity, append a shared secret as a query parameter (e.g. \`?secret=MY_TOKEN\`). The query string is preserved as-supplied.

Full API documentation: https://agent-media.ai/docs/api
`;

export async function GET() {
  return new NextResponse(LLMS_FULL_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
