# agent-media

Python SDK for [agent-media](https://agent-media.ai) — UGC video generation for developers.

Generate AI videos with realistic talking heads, B-roll, voiceover, animated subtitles, and music. One function call, finished video.

[![PyPI version](https://img.shields.io/pypi/v/agent-media)](https://pypi.org/project/agent-media/)
[![Python](https://img.shields.io/pypi/pyversions/agent-media)](https://pypi.org/project/agent-media/)
[![license](https://img.shields.io/pypi/l/agent-media)](https://github.com/gitroomhq/agent-media-app/blob/main/LICENSE)

## Install

```bash
pip install agent-media
```

## Quick Start

```python
from agent_media import AgentMedia

client = AgentMedia(api_key="ma_YOUR_KEY")

# Generate a video — blocks until complete, returns the URL
video = client.create_video(
    script="Have you tried building UGC content at scale? This API makes it trivial.",
    actor_slug="sofia",
    tone="energetic",
    style="hormozi",
    target_duration=10,
)
print(video["video_url"])
# → https://...mp4
```

## Async

```python
from agent_media.client import AsyncAgentMedia

async with AsyncAgentMedia(api_key="ma_YOUR_KEY") as client:
    video = await client.create_video(
        script="Your script here...",
        actor_slug="sofia",
        tone="confident",
    )
    print(video["video_url"])
```

## API Reference

### `AgentMedia(api_key, base_url?, timeout?)`

| Parameter | Type | Required | Default |
|---|---|---|---|
| `api_key` | str | Yes | — |
| `base_url` | str | No | Production API |
| `timeout` | float | No | 60.0 |

### `client.create_video(**params)`

Generate a video and wait for completion. Returns `{ job_id, video_url, credits_deducted, duration }`.

```python
video = client.create_video(
    script="Your script (50-3000 chars)",
    actor_slug="sofia",           # use list_actors() to browse
    tone="energetic",             # energetic | calm | confident | dramatic
    music="chill",                # chill | energetic | corporate | dramatic | upbeat
    style="hormozi",              # 17 subtitle styles
    target_duration=10,           # 5 | 10 | 15 seconds
    aspect_ratio="9:16",          # 9:16 | 16:9 | 1:1
    allow_broll=True,             # include AI-generated B-roll
    template="saas-review",       # optional template
    webhook_url="https://...",    # optional async callback
    timeout_seconds=600,          # max wait time (default 10 min)
)
```

### `client.submit_video(**params)`

Submit without waiting. Returns `{ job_id, status, credits_deducted }`.

### `client.submit_subtitle(**params)`

Add subtitles to an existing video.

```python
job = client.submit_subtitle(
    video_url="https://example.com/video.mp4",
    style="bold",
)
```

### `client.submit_saas_review(**params)`

Generate a SaaS Review video from a URL.

```python
job = client.submit_saas_review(
    product_url="https://example.com/product",
    angle="enthusiastic",
    actor_slug="sofia",
)
```

`submit_product_review(...)` remains available as a deprecated wrapper for one release.

### `client.create_product_acting(**params)`

Generate Product Acting UGC from a product image and actor.

```python
video = client.create_product_acting(
    product_image_url="https://cdn.example.com/perfume.png",
    actor_slug="sofia",
    product_name="Rose Noir",
    product_description="Premium rose perfume with a warm vanilla dry-down.",
    template="product-in-hand",
    acting_style="honest-review",
    duration=5,
    subtitle_style="hormozi",
)
print(video["video_url"])
```

Use `submit_product_acting(...)` if you want to submit without waiting and poll with `get_video_status()`.

### Character Video — 3-step Content Machine pipeline

```python
result = client.create_character_video(
    description="Marco, 35yo Italian chef, white uniform, curly black hair",
    script="Marco walks into his sunlit Brooklyn kitchen, takes a bite of fresh bread, smiles.",
    duration=5,
    aspect_ratio="9:16",
)
print(result["character_sheet_url"])  # Step 1
print(result["storyboard_url"])        # Step 2
print(result["video_url"])             # Step 3 (final 720p MP4)
```

`create_character_video` runs the three steps in order, threading a single `session_id` so the server backstops the scene prompt from the storyboard. Cost: 20 credits sheet (or 35 for description-only) + 20 storyboard + 350/700 video for 5s/10s.

For step-by-step control or the AI beat suggester:

```python
# One of: actor_slug | reference_image_url | description
sheet = client.submit_character_sheet(description="Marco the chef")
# (poll client.get_video_status(sheet["job_id"]) until completed)

suggestions = client.suggest_storyboard(
    character_description="Marco the chef",
    vibe="wholesome",
)
# → {"options": [{"title", "beats": [...]}, ...]}

sb = client.submit_character_storyboard(
    character_sheet_url=character_sheet_url,
    beats=suggestions["options"][0]["beats"],
)

video = client.submit_character_video(
    character_sheet_url=character_sheet_url,
    storyboard_url=storyboard_url,
    duration=5,
)
```

The `AsyncAgentMedia` class exposes `await client.create_character_video(...)` and the same `submit_*` / `suggest_storyboard` methods with identical signatures.

### `client.list_actors(limit?, offset?)`

Browse available AI actors.

```python
result = client.list_actors(limit=20)
for actor in result["actors"]:
    print(f"{actor['slug']} — {actor['name']} ({actor['gender']}, {actor['nationality']})")
```

### `client.get_video_status(job_id)`

Check job progress.

```python
status = client.get_video_status("job_abc123")
if status["status"] == "completed":
    print(status["video_url"])
```

## Error Handling

```python
from agent_media import AgentMedia, AgentMediaError

try:
    video = client.create_video(script="...")
except AgentMediaError as e:
    print(f"{e.code}: {e} (HTTP {e.status})")
```

## Webhooks

Skip polling — pass `webhook_url` and agent-media will POST to it when the job completes or fails.

```python
job = client.submit_video(
    script="...",
    actor_slug="sofia",
    webhook_url="https://example.com/webhooks/agent-media?secret=MY_TOKEN",
)
```

**Payload on success:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "video_url": "https://media.agent-media.ai/videos/550e8400.mp4"
}
```

**Payload on failure:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error_message": "Script exceeded maximum duration for selected actor."
}
```

**Rules:**
- Must be `https://` (plain HTTP is rejected)
- Publicly reachable
- Max 2048 characters
- Retries on non-2xx: 3 attempts with exponential backoff (1 s, 4 s, 16 s)
- Query strings are preserved — append `?secret=MY_TOKEN` to verify authenticity

## Batch Generation

```python
from concurrent.futures import ThreadPoolExecutor

scripts = ["Script 1...", "Script 2...", "Script 3..."]

with ThreadPoolExecutor(max_workers=3) as pool:
    videos = list(pool.map(
        lambda s: client.create_video(script=s, actor_slug="sofia"),
        scripts,
    ))

for v in videos:
    print(v["video_url"])
```

## Related Packages

| Package | Registry | Description |
|---|---|---|
| [`@agentmedia/sdk`](https://www.npmjs.com/package/@agentmedia/sdk) | npm | TypeScript SDK |
| [`@agentmedia/mcp-server`](https://www.npmjs.com/package/@agentmedia/mcp-server) | npm | MCP server for Claude Code, Cursor, Windsurf |
| [`agent-media-cli`](https://www.npmjs.com/package/agent-media-cli) | npm | CLI tool |
| [`@agentmedia/schema`](https://www.npmjs.com/package/@agentmedia/schema) | npm | Shared schema, types, Zod validation |

## Links

- [Interactive API Docs](https://agent-media.ai/docs/api-reference)
- [OpenAPI Spec](https://agent-media.ai/openapi.json)
- [Website](https://agent-media.ai)
- [GitHub](https://github.com/gitroomhq/agent-media-app)

## License

Apache-2.0
