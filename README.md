# agent-media

AI UGC video generation from your terminal, your editor, or your AI agent.

[`agent-media.ai`](https://agent-media.ai) · [Install the skill](https://agent-media.ai/skill) · [API reference](https://agent-media.ai/docs/api-reference) · [Pricing](https://agent-media.ai/pricing)

## What it does

### Agents (MCP / HTTP): one tool — `make_ugc`

For AI agents (Claude Code, Cursor, Claude.ai/Cowork, …) the surface is a **single tool, `make_ugc` ("Agent-Media UGC Video")**. Give it a script plus an optional person description, image, or saved character, and it returns a finished vertical video — it resolves identity and routes to the right engine internally (no sub-skill picking).

- **Captions are opt-in.** They are **not** added automatically; the agent asks whether you want captions (and which style) before adding them.
- **Same person within a session is reused.** After the first video the character is saved; a follow-up request reuses it (faster, on-model) unless you ask for a new one — the agent narrates each step (portrait → sheet → video → captions) as it runs.

### CLI / SDK: the low-level v2 generators

| Generator | What it makes |
|---|---|
| **Selfie** | 9:16 TikTok-style UGC video. **No photo needed** — generates a realistic actor, character sheet, photographic wireframe/storyboard board, then a Seedance 2.0 video. Durations: 5 / 10 / 15 s. |
| **Character** | Persists a reusable character (`char_xxxxxxxxxx`) so subsequent Selfies stay on-model. |
| **Subtitle** | Burns styled subs onto any existing video. Whisper transcribe or pass `--transcript`. |

Pricing lives at <https://agent-media.ai/pricing>. The API debits internally — agents and SDK consumers should never need to quote credit numbers to end users.

## Install

The fastest path is the public install hub: <https://agent-media.ai/skill>. It routes you by client.

### Claude Code

```bash
npm install -g agent-media-cli@latest
agent-media login
claude skills add github:gitroomhq/agent-media
```

### Claude.ai / Cowork / Claude Desktop

Settings → Integrations → **Add custom MCP server**

- URL: `https://api.agent-media.ai/mcp`
- Auth header: `Authorization: Bearer <your-ma_xxx-key>`

### Cursor / Continue / Windsurf

```jsonc
// ~/.cursor/mcp.json (or your client's equivalent)
{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": { "AGENT_MEDIA_API_KEY": "<your-ma_xxx-key>" }
    }
  }
}
```

### Standalone CLI / scripts / CI

```bash
npm install -g agent-media-cli@latest
agent-media login
agent-media selfie \
  --description "25yo asian woman, long wavy dark hair, soft smile" \
  --script "I keep getting DMs about my hair oil routine" \
  --scene-action "standing by a bright vanity, showing a small amber hair-oil bottle and scrunching one curl mid-line" \
  --duration 10
```

## Keeping the skill up-to-date

The CLI ships an updater:

```bash
agent-media skill update       # pulls the latest skill tree
agent-media skill status       # local vs remote version
```

Every CLI invocation also runs a once-per-day background check and prints a one-line nudge when a newer skill version is available.

## Published packages

| Package | Version | Notes |
|---|---|---|
| [`agent-media-cli`](https://www.npmjs.com/package/agent-media-cli) | `1.18.0+` | the CLI |
| [`@agentmedia/mcp-server`](https://www.npmjs.com/package/@agentmedia/mcp-server) | `0.7.0+` | local stdio MCP — reads `/v1/skills` live (make_ugc) |
| [`@agentmedia/sdk`](https://www.npmjs.com/package/@agentmedia/sdk) | `0.5.0+` | TypeScript SDK |
| [`@agentmedia/schema`](https://www.npmjs.com/package/@agentmedia/schema) | `0.5.0+` | shared zod schemas + registry |

## Public skill repo

<https://github.com/gitroomhq/agent-media> — public mirror of the `public-skill/` subtree: the `make-ugc` skill (one agent tool) plus `agent-media-ugc` and `publish-to-social`, a plugin/marketplace manifest, and `reference/` docs. Mirrored by `.github/workflows/mirror-public-skill.yml` (subtree split on `public-skill/` only — nothing else in this monorepo is ever pushed).

## Repository layout (this monorepo)

```
apps/
  cli/                       agent-media CLI source
  web/                       agent-media.ai (marketing + dashboard)
packages/
  schema/                    @agentmedia/schema — zod schemas + V2_GENERATORS registry (source of truth)
  sdk-ts/                    @agentmedia/sdk
  sdk-python/                agent-media (PyPI)
  mcp-server/                @agentmedia/mcp-server
services/
  api-v2/                    REST API (api.agent-media.ai) — routes, auth, dispatch
  media-worker-v2/           pipeline runner — gpt-image-2 + Seedance + ffmpeg
public-skill/                public mirror source — subtree pushed to gitroomhq/agent-media (one agent tool: make_ugc)
supabase/migrations/         schema, RLS, edge functions
docs/v2/api-reference.md     auto-generated REST reference
```

Add a new v2 product: drop a row in `packages/schema/src/v2/generators.ts`, run `pnpm --filter @agentmedia/schema gen:v2-docs`, and the CLI command, MCP tool, REST route, SDK method, docs, and skill reference file all materialize from the registry.

## License

Apache-2.0
