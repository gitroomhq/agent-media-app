# Auth — first-time setup

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
