# Auth, first-time setup

## Easiest: the hosted connector (no API key)

If you are Claude, Claude Code, Cursor or Codex, you do not need an API key or the CLI at all. Add the hosted MCP connector: one URL, browser sign-in, OAuth 2.1 with dynamic client registration:

```
https://api.agent-media.ai/mcp
```

- Claude (web or desktop): Customize > Connectors > + > Add custom connector > paste the URL > Connect and sign in
- Claude Code: `claude mcp add --transport http --scope user agent-media https://api.agent-media.ai/mcp`
- Cursor (`~/.cursor/mcp.json`) / Codex (`~/.codex/config.toml`): the same URL as a remote server

Full guide: <https://agent-media.ai/connect>. After submitting a generation over MCP, call `get_run_status` with the id you were given: generation is async and the submit response only confirms the job started.

When the user wants to provide a product photo, portrait, screenshot, or image reference, check tools/list. If open_upload_panel is available, offer it first: call open_upload_panel with {}, show its inline panel or returned browser link, and wait for the user to finish. Then call get_uploads with the returned session_id and use the exact ready image_url in refs, first_frame, last_frame, or the matching skill image field. Do not start a reference-dependent generation until the required images are ready. The panel accepts still PNG, JPEG, and WebP, up to 10 images and 25 MB each. Images expire 24 hours after the panel is created; show the returned expiry, request a new upload if expired, and never make a permanent copy. Uploading uses no generation credits. Do not ask the user for base64, shell commands, or a public hosting service; do not continuously poll while waiting for them. Only call these tool names when discovered. If they are missing from the connected tool catalog, call upload_image with {} to open the same panel; use the returned panel: upload_key with upload_image to retrieve images after the user finishes. If that reports the panel is unavailable, use upload_image only for an already accessible file or URL. Do not build an upload page or request a local folder as a substitute for the existing panel. Never invent access to a chat attachment: if you cannot read it, explain that and offer the panel when available. Browser fallback works without inline UI support; do not promise an inline panel in every client.
Inspect the native image previews returned with retrieved uploads before describing them or writing image-specific prompts. Never infer what the image shows from an email domain, account metadata, or filename. Use the original URLs for generation, not preview bytes. If the session ID was lost, call get_uploads with {} to list recent sessions, or upload_image with {"upload_key":"panel:recent"} for cached catalogs; retrieve the matching session before asking for re-upload. Account-wide recent uploads may belong to other conversations, so clarify ambiguous selection. Uploading stores an image; it does not attach it to a generation automatically. If the user already requested a generation with these images, continue that request using the returned URLs; do not stop at "upload complete" or ask again whether to use them. For generate_image, put the relevant image_url values in refs. For generate_video, use refs for product/person/appearance references, or first_frame for animating a still (last_frame only for an explicitly requested ending frame); never combine refs with frame fields. Preserve the user's intended image roles and model limits; ask only if the role or selection is unclear. For a fixed skill, use its declared image field. Include the URL in the tool arguments, not only in the prompt. Do not substitute a newly generated image for the uploaded reference. If the request was upload-only, report readiness and wait for a generation request; uploading alone does not authorize spending credits. After submitting, poll get_run_status and return the result.

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
