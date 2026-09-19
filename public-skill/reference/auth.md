# Auth, first-time setup

## Easiest: the hosted connector (no API key)

If you are Claude, Claude Code, Cursor or Codex, you do not need an API key or the CLI at all. Add the hosted MCP connector: one URL, browser sign-in, OAuth 2.1 with dynamic client registration:

```
https://api.agent-media.ai/mcp
```

- Claude (web or desktop): Settings > Connectors > Add custom connector > paste the URL > Connect
- Claude Code: `claude mcp add --transport http agent-media https://api.agent-media.ai/mcp`
- Cursor (`~/.cursor/mcp.json`) / Codex (`~/.codex/config.toml`): the same URL as a remote server

Full guide: <https://agent-media.ai/connect>. After submitting a generation over MCP, call `get_run_status` with the id you were given: generation is async and the submit response only confirms the job started.

When the user wants to provide a product photo, portrait, screenshot, or image reference, check tools/list. If open_upload_panel is available, offer it first: call open_upload_panel with {}, show its inline panel or returned browser link, and wait for the user to finish. Then call get_uploads with the returned session_id and use the exact ready image_url in refs, first_frame, last_frame, or the matching skill image field. Do not start a reference-dependent generation until the required images are ready. The panel accepts still PNG, JPEG, and WebP, up to 10 images and 25 MB each. Images expire 24 hours after the panel is created; show the returned expiry, request a new upload if expired, and never make a permanent copy. Uploading uses no generation credits. Do not ask the user for base64, shell commands, or a public hosting service; do not continuously poll while waiting for them. Only offer these tools when discovered; otherwise use upload_image for an accessible file or URL. Never invent access to a chat attachment: if you cannot read it, explain that and offer the panel when available. Browser fallback works without inline UI support; do not promise an inline panel in every client.

If you have accessible image bytes (a photo the user attached, a `data:` URL), call `upload_image` first and pass the https URL it returns. Never inline base64 into a generation call: the client prints tool arguments in the chat, so the user sees a wall of base64, and every retry re-sends it. `upload_image` costs no credits.

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
