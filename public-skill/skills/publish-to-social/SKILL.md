---
name: 'Publish to Social'
description: 'Publish a generated Agent-Media UGC Video to the user''s connected TikTok, Instagram, or X. Connect channels (OAuth) and post or schedule via the REST API. Use after producing a video with make_ugc.'
x-skill-slug: 'publish-to-social'
x-skill-version: '1.0.0'
---
# Publish to Social

Post a finished agent-media video (an R2 `video_url` from any of the video skills) to the user's connected social channels — **TikTok, Instagram, or X**. Works from three surfaces: REST, the CLI (`agent-media social ...`), and MCP tools (`social_channels` / `social_connect` / `social_publish`). All calls use the user's `Authorization: Bearer ma_...` token against `https://api.agent-media.ai`.

## 1. Connect a channel (one-time, requires the human)

```
GET    /v1/social/providers             -> connectable networks: tiktok, instagram, instagram-standalone, x
POST   /v1/social/connect { provider }  -> { url }   # the user opens this OAuth url and authorizes
GET    /v1/social/channels              -> { channels: [{ id, name, provider, profile, picture }] }
DELETE /v1/social/channels/:channelId   -> disconnect
```

The connect step returns an OAuth URL the **human** must open and authorize — an agent cannot complete OAuth itself. Once authorized, the channel appears in `/v1/social/channels` with an `id` you pass to publish.

CLI: `agent-media social providers` · `agent-media social connect x` · `agent-media social channels`.
MCP: `social_connect { provider }` (returns the URL for the user) · `social_channels`.

## 2. Publish a video

```bash
curl -X POST https://api.agent-media.ai/v1/social/publish \
  -H "Authorization: Bearer ma_..." -H "Content-Type: application/json" \
  -d '{ "video_url": "https://pub-...r2.dev/generation-outputs/<user>/<job>/...mp4",
        "channel_ids": ["<channel-id-from-/channels>"],
        "caption": "made with agent-media",
        "type": "now" }'    # or "type":"schedule" + "date":"2026-06-01T10:00:00.000Z"
```

CLI: `agent-media social publish --video <url> --channels <id,id> --caption "..."` (add `--at <iso>` to schedule).
MCP: `social_publish { video_url, channel_ids, caption, type }`.

`video_url` must be an agent-media R2 URL (the output of a video skill) — agent-media re-hosts it on the publishing provider for you. `channel_ids` come from `/v1/social/channels`. Per-network requirements (e.g. X reply settings) are filled in server-side; you don't send them.

**Returns** `{ success: true, media_id, post_ids: ["..."] }`. A real post was created only when `post_ids` is non-empty — treat an empty `post_ids` as a failure, not a success.

## Typical flow

1. Produce a video → `make_ugc` → `final_output.video_url`.
2. If the user has no connected channel, send them to connect (step 1) — you can't OAuth for them.
3. Publish that `video_url` to the chosen `channel_ids`; confirm `post_ids` came back.

Note: social operations run on a shared rate budget — don't poll; connect once and publish on demand.
