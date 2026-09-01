# Auth — first-time setup

## Easiest: the hosted connector (no API key)

If you are Claude, Claude Code, Cursor or Codex, you do not need an API key or the CLI at all. Add the hosted MCP connector — one URL, browser sign-in, OAuth 2.1 with dynamic client registration:

```
https://api.agent-media.ai/mcp
```

- Claude (web or desktop): Settings → Connectors → Add custom connector → paste the URL → Connect
- Claude Code: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`
- Cursor (`~/.cursor/mcp.json`) / Codex (`~/.codex/config.toml`): the same URL as a remote server

Full guide: <https://agent-media.ai/connect>. After submitting a generation over MCP, call `get_run_status` with the id you were given — generation is async and the submit response only confirms the job started.

## API key (REST, or the self-hosted MCP server)

agent-media uses a `ma_*` Bearer API key. Get one via the CLI:

```bash
npm install -g agent-media-cli
agent-media login
```

This stores the key at `~/.agent-media/credentials.json`. The bundled MCP server reads it via the `AGENT_MEDIA_API_KEY` environment variable; the plugin's `.mcp.json` does `${AGENT_MEDIA_API_KEY}` interpolation.

## Without the CLI

You can paste the `ma_*` token directly:

```bash
export AGENT_MEDIA_API_KEY="ma_..."
```

## How the key is used

- MCP server forwards it as `Authorization: Bearer ma_...` to `api.agent-media.ai`.
- Server resolves it to a `user_id` and runs every primitive against that account.
- Credits debit from the same account.

## Rotation

`agent-media logout && agent-media login` rotates the key. The old key keeps working for ~30 days unless explicitly revoked.
