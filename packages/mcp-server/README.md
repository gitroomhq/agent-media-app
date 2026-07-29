# @agentmedia/mcp-server

MCP server for [agent-media](https://agent-media.ai) — generate AI UGC videos from Claude Code, Cursor, Windsurf, or any MCP-compatible client.

UGC for developers. Script in, video URL out — directly from your IDE.

[![npm version](https://img.shields.io/npm/v/@agentmedia/mcp-server)](https://www.npmjs.com/package/@agentmedia/mcp-server)
[![license](https://img.shields.io/npm/l/@agentmedia/mcp-server)](https://github.com/gitroomhq/agent-media-app/blob/main/LICENSE)

## What It Does

Five tools that let AI agents generate UGC videos:

| Tool | Description |
|---|---|
| `create_video` | Generate a UGC video from a script. Polls until complete, returns the video URL. |
| `show_your_app` | Generate an actor holding a phone that shows your app screenshot. |
| `product_acting_ugc` | Generate an actor presenting or reacting to a product image. |
| `list_actors` | Browse available AI actors — slugs, names, demographics. |
| `get_video_status` | Check a generation job's status, video URL, or error message. |

## Setup

### 1. Get an API Key

Sign up at [agent-media.ai](https://agent-media.ai) and generate an API key in Settings.

### 2. Configure Your IDE

#### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": {
        "AGENT_MEDIA_API_KEY": "ma_your_key_here"
      }
    }
  }
}
```

#### Cursor

Open Settings > MCP Servers > Add Server:

```json
{
  "agent-media": {
    "command": "npx",
    "args": ["-y", "@agentmedia/mcp-server"],
    "env": {
      "AGENT_MEDIA_API_KEY": "ma_your_key_here"
    }
  }
}
```

#### Windsurf

Open Settings > MCP > Add:

```json
{
  "agent-media": {
    "command": "npx",
    "args": ["-y", "@agentmedia/mcp-server"],
    "env": {
      "AGENT_MEDIA_API_KEY": "ma_your_key_here"
    }
  }
}
```

#### Global Install (Alternative)

```bash
npm install -g @agentmedia/mcp-server
export AGENT_MEDIA_API_KEY=ma_your_key_here
agent-media-mcp
```

## Usage Examples

Once configured, ask your AI assistant:

> "Generate a 10-second UGC video with Sofia explaining why our product is great"

> "List available actors and create a SaaS Review video with an enthusiastic tone"

> "Create a product acting UGC video with Sofia holding this perfume bottle image"

> "Check the status of job abc123"

The MCP server handles the API calls, polling, and returns the finished video URL.

## Tool Parameters

### create_video

| Parameter | Type | Description |
|---|---|---|
| `script` | string | Video script (50-3000 chars). Required unless `prompt` is set. |
| `prompt` | string | AI generates the script from this prompt. |
| `actor_slug` | string | Actor to use (from `list_actors`). |
| `tone` | string | `energetic`, `calm`, `confident`, `dramatic` |
| `music` | string | `chill`, `energetic`, `corporate`, `dramatic`, `upbeat` |
| `style` | string | Subtitle style — 17 options including `hormozi`, `bold`, `neon`, `fire` |
| `target_duration` | number | `5`, `10`, or `15` seconds |
| `aspect_ratio` | string | `9:16`, `16:9`, `1:1` |
| `allow_broll` | boolean | Include AI-generated B-roll footage |
| `template` | string | `saas-review`, `testimonial`, `monologue`, `listicle`, etc. |
| `composition_mode` | string | `pip` for picture-in-picture |
| `webhook_url` | string | Async completion callback URL |

### product_acting_ugc

| Parameter | Type | Description |
|---|---|---|
| `product_image_url` | string | Public product image URL. Required. |
| `actor_slug` | string | Actor to use (from `list_actors`). Required. |
| `product_description` | string | Product context used when script is omitted. |
| `script` | string | Exact words the actor says. Optional if `product_description` is provided. |
| `template` | string | `product-in-hand`, `mirror-selfie`, `bathroom-reaction`, `kitchen-counter`, `car-selfie`, `couch-review`, `expert-interview`, `product-closeup` |
| `acting_style` | string | `raw-selfie`, `shocked`, `angry`, `excited`, `dramatic`, `weird-hook`, `casual-demo`, `honest-review` |
| `duration` | number | `5`, `10`, or `15` seconds |
| `subtitle_style` | string | `hormozi` or `none` |

### list_actors

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 20 | Max actors to return (max 200) |
| `offset` | number | 0 | Pagination offset |

### get_video_status

| Parameter | Type | Required | Description |
|---|---|---|---|
| `job_id` | string | Yes | Job ID from `create_video` |

## Webhooks

Pass `webhook_url` to `create_video` to get notified when the job completes or fails instead of polling.

**Payload on success:** `{ job_id, status: "completed", video_url }`
**Payload on failure:** `{ job_id, status: "failed", error_message }`

Must be `https://`, publicly reachable, max 2048 chars. On non-2xx response, agent-media retries 3× with exponential backoff (1 s, 4 s, 16 s). Query strings are preserved — append `?secret=MY_TOKEN` to verify authenticity.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENT_MEDIA_API_KEY` | Yes | — | Your API key (`ma_xxx` format) |
| `AGENT_MEDIA_API_URL` | No | Production API | Override the API base URL |

## Related Packages

| Package | Description |
|---|---|
| [`@agentmedia/sdk`](https://www.npmjs.com/package/@agentmedia/sdk) | TypeScript SDK for direct API integration |
| [`agent-media-cli`](https://www.npmjs.com/package/agent-media-cli) | CLI tool — generate videos from your terminal |
| [`@agentmedia/schema`](https://www.npmjs.com/package/@agentmedia/schema) | Shared schema — enums, types, Zod validation |
| [`agent-media`](https://pypi.org/project/agent-media/) | Python SDK |

## Links

- [Interactive API Docs](https://agent-media.ai/docs/api-reference)
- [OpenAPI Spec](https://agent-media.ai/openapi.json)
- [Website](https://agent-media.ai)
- [GitHub](https://github.com/gitroomhq/agent-media-app)

## License

Apache-2.0
