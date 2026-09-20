# agent-media

AI UGC video generation from your terminal, your editor, or your AI agent.

[`agent-media.ai`](https://agent-media.ai) · [Install the skill](https://agent-media.ai/skill) · [API reference](https://agent-media.ai/docs/api-reference) · [Pricing](https://agent-media.ai/pricing)

**Docs:** [Public documentation](https://docs.agent-media.ai) · [Architecture](ARCHITECTURE.md) · [Self-hosting](#self-hosting) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## What it does

### Agents (MCP / HTTP): video, image and audio

The hosted connector exposes `generate_video`, `generate_image` and `generate_audio`.
Agents use `list_models` to choose a model and mode, `get_account` to check their
connection and available credits, and `quote` before generation. These checks
cost no credits; generation remains paid. See [account readiness](docs/account-readiness.md)
and the [public skill](public-skill/skills/agent-media/SKILL.md) for the full workflow.

For reference images, open the existing upload panel, drag in one or more images,
then pass the returned URLs into the requested generation. Images expire after
24 hours. See [temporary image uploads](docs/temporary-image-uploads.md).
Poll `get_run_status` with the returned job ID until the result is ready.

Self-hosted deployments can explicitly select the fixed recipe surface; the
hosted default uses the generation tools above.

### CLI / SDK: the low-level v2 generators

| Generator | What it makes |
|---|---|
| **Selfie** | 9:16 TikTok-style UGC video. **No photo needed** — generates a realistic actor, character sheet, photographic wireframe/storyboard board, then a Seedance 2.0 video. Durations: 5 / 10 / 15 s. |
| **Character** | Persists a reusable character (`char_xxxxxxxxxx`) so subsequent Selfies stay on-model. |
| **Subtitle** | Burns styled subs onto any existing video. Whisper transcribe or pass `--transcript`. |

Pricing lives at <https://agent-media.ai/pricing>. Use a quote to check the intended generation cost against the available balance and the user’s approved budget. The API debits credits when a generation is accepted.

## Connect — no API key needed

**One server URL. Sign in with your browser. That's it.**

```
https://api.agent-media.ai/mcp
```

The hosted connector speaks **OAuth 2.1 with dynamic client registration**, so your
agent registers itself and opens a sign-in page — you never copy a key, and no
secret is stored in a config file.

### The fastest way: paste this to your agent

Works in Claude Code, Cursor, Claude Desktop, or anything that speaks MCP — the
agent sets *itself* up:

```text
Set up agent-media for me so I can generate UGC videos from here.
1. Add the agent-media MCP server: https://api.agent-media.ai/mcp (Streamable HTTP).
2. Authenticate: complete the sign-in in the browser it opens.
3. Install the companion skills: run `npx skills add gitroomhq/agent-media-app`.
Once that's done, let me know when it's ready.
```

Then just ask: *"make me a UGC video of a woman reviewing my hair oil."*

### Claude.ai / Claude Desktop / Cowork

Settings → **Connectors** → Add custom connector → name it `agent-media`, paste
`https://api.agent-media.ai/mcp` → **Connect** → sign in. Done.

### Cursor / Continue / Windsurf

Point the client at the same hosted URL and it will run the OAuth flow:

```jsonc
// ~/.cursor/mcp.json (or your client's equivalent)
{
  "mcpServers": {
    "agent-media": { "url": "https://api.agent-media.ai/mcp" }
  }
}
```

<details>
<summary>Prefer an API key, or need a local stdio server? (optional)</summary>

Keys still work everywhere OAuth does — useful for CI and headless scripts.
Get one with `npm i -g agent-media-cli && agent-media login`, or from the
dashboard, then either send `Authorization: Bearer ma_...` to the hosted URL, or
run the stdio server locally:

```jsonc
{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": { "AGENT_MEDIA_API_KEY": "ma_..." }
    }
  }
}
```
</details>

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

## Temporary image upload panel

When enabled on the server, `open_upload_panel` opens a drag-and-drop uploader in compatible Claude/ChatGPT MCP Apps clients and returns a browser link for other agents. Upload PNG, JPEG, or WebP images, then call `get_uploads` to use their references in generation. Images are available for up to 24 hours; uploading uses no generation credits. See [setup, privacy, API contract, and tests](docs/temporary-image-uploads.md).

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

## The skill pack

[`public-skill/`](public-skill/) is the agent-facing pack: the `make-ugc` skill (the one
generation tool) plus `agent-media-ugc`, `make-podcast`, `publish-to-social`, a
plugin/marketplace manifest, and `reference/` docs. It is generated from the skill
registry by `services/api-v2/scripts/generate-public-skill.ts` — edit the registry, not
the emitted files.

Install it into an agent with `npx skills add gitroomhq/agent-media-app`, or as a Claude
Code plugin (see [`public-skill/README.md`](public-skill/README.md)).

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
public-skill/                generated agent skill pack and connector/model reference
supabase/migrations/         schema, RLS, edge functions
docs/v2/api-reference.md     auto-generated REST reference
```

Add a new v2 product: drop a row in `packages/schema/src/v2/generators.ts`, run `pnpm --filter @agentmedia/schema gen:v2-docs`, and the CLI command, MCP tool, REST route, SDK method, docs, and skill reference file all materialize from the registry.

## License

Apache-2.0

## Self-hosting

Run the whole stack locally or on your own infrastructure. Billing is **off** by
default for self-hosters — bring your own provider keys and generate freely.

```bash
cp .env.example .env     # add your Evolink / OpenAI / Anthropic keys
docker compose up
```

That brings up everything: Postgres, Supabase Auth (GoTrue), PostgREST, Supabase
Storage, Temporal, MinIO (S3-compatible storage), the four backend services and
the dashboard. Migrations are applied automatically on first boot.

- **Dashboard** → `http://localhost:3000` (set `WEB_PORT` if 3000 is taken)
- **API** → `http://localhost:3001`

A bare Postgres is *not* enough — the app depends on Supabase's Auth and
PostgREST APIs, so the compose file runs those as real services rather than
pretending Postgres alone will do.

**Dashboard only — there is no marketing site here.** `/` redirects straight to
`/dashboard`, and `robots.txt` disallows everything, because a self-hosted
instance has no business being indexed. The hosted site at agent-media.ai keeps
its own landing pages, pricing and SEO surface; none of that is in this repo.
Agents talk to the API directly and never see the UI at all.

You are not tied to our vendors: Temporal Cloud → the Temporal container,
Cloudflare R2 → MinIO (or any S3-compatible store via `S3_ENDPOINT`),
Railway/Vercel → any container or Node host. Every backend service ships its own
`Dockerfile` and is published to GHCR, so you can deploy them independently and
scale them separately. Configuration is injected at runtime; nothing is baked
into the images.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and which
providers are swappable.

## License

Apache-2.0 — see [LICENSE](LICENSE). No follow-on obligations beyond the license.
