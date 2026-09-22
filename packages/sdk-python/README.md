# agent-media

Python SDK for [agent-media](https://agent-media.ai), AI UGC video generation for developers.

Describe a person, give them a script, get a 9:16 clip with native audio and burned subtitles. Or generate any clip, image or voice from a prompt.

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

# A selfie clip: generated on-model person, native audio, subtitles burned in.
# run_until_done polls until the job lands (completed | failed).
done = client.v2.run_until_done(
    client.v2.selfie(
        description="woman in her late 20s, warm and natural, kitchen morning light",
        script="Have you tried building UGC content at scale? This API makes it trivial.",
        duration=10,
    )
)
print(done["video_url"])
# → https://...mp4
```

Or one clip from a prompt on the loose surface:

```python
job = client.v2.generate_video(
    prompt='A 28-year-old woman in a bright kitchen, phone framing, says: "Okay, this actually works."',
    seconds=5,
    aspect="9:16",
)
done = client.v2.run_until_done(job)
```

## Async

```python
from agent_media.client import AsyncAgentMedia

async with AsyncAgentMedia(api_key="ma_YOUR_KEY") as client:
    job = await client.v2.selfie(description="...", script="Your script here...")
    done = await client.v2.run_until_done(job)
    print(done["video_url"])
```

## Retired on 2026-09-22

`create_video`, `submit_video`, `submit_saas_review` and `submit_product_review` wrapped the v1 UGC pipeline, whose talking-head model was discontinued by its provider. They now raise `AgentMediaError` with `status 410` and `code GENERATOR_RETIRED` without making a request. Move to `client.v2.selfie(...)` (a person delivering your script) or `client.v2.generate_video(...)` (any clip from a prompt).

## API Reference

### `AgentMedia(api_key, base_url?, timeout?)`

| Parameter | Type | Required | Default |
|---|---|---|---|
| `api_key` | str | Yes | — |
| `base_url` | str | No | Production API |
| `timeout` | float | No | 60.0 |

### `client.submit_subtitle(**params)`

Add subtitles to an existing video.

```python
job = client.submit_subtitle(
    video_url="https://example.com/video.mp4",
    style="bold",
)
```

### `client.v2.selfie(**params)`

Submit a selfie clip. Returns `{"job_id", "status"}`; poll with `client.v2.status(job_id)` or wrap in `client.v2.run_until_done(...)`.

```python
job = client.v2.selfie(
    description="woman in her late 20s, warm and natural",   # or character_id="char_..." from create_character
    photo_url="https://cdn.example.com/me.png",              # optional exact likeness
    script="Stop scrolling. This tool changed everything for me.",
    duration=10,                                             # 5 | 10 | 15
    subtitles=True,
    shot_preset="kitchen-glow-up",                           # optional scene
    vibe="excited",                                          # excited | calm | sassy | serious | curious
    engine="seedance-2.0",                                   # or seedance-2.5
)
```

75 credits plus 60 per second on seedance-2.0 (375 for 5s, 675 for 10s). Failed jobs are refunded.

### `client.v2.generate_video(**params)`, `generate_image(**params)`, `generate_audio(**params)`, `quote(kind, **params)`

The loose surface, `POST /v2/generate/{kind}`. `generate_video` takes `prompt`, `seconds`, `aspect`, `quality` (480p | 720p | 1080p), and either `first_frame` (+ `last_frame`) for image-to-video or `refs` / `video_refs` / `audio_refs` for reference-to-video. `quote` returns the credits for the same body without running it.

### `client.v2.create_character(**params)`

Persist a person once (`name`, `description`, optional `photo_url`) and reuse the returned `character_id` on every selfie.

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
    job = client.v2.selfie(description="...", script="...")
except AgentMediaError as e:
    print(f"{e.code}: {e} (HTTP {e.status})")
```

## Webhooks

The v2 routes have no `webhook_url` field. Poll `client.v2.status(job_id)` (the API sends `Retry-After: 5` while a job runs) or let `client.v2.run_until_done(...)` do it. `webhook_url` still works on the remaining v1 generators (`submit_subtitle`, `create_product_acting`, `create_show_your_app`, `create_laptop_ugc`): the API POSTs `{"job_id", "status", "video_url"}` on success and `{"job_id", "status": "failed", "error_message"}` on failure. It must be `https://`, publicly reachable, at most 2048 characters; non-2xx responses are retried 3 times with backoff (1 s, 4 s, 16 s); query strings are preserved, so append `?secret=MY_TOKEN` to verify authenticity.

## Batch Generation

```python
from concurrent.futures import ThreadPoolExecutor

scripts = ["Script 1...", "Script 2...", "Script 3..."]

def render(script):
    job = client.v2.selfie(description="woman in her late 20s, warm and natural", script=script, vibe="serious")
    return client.v2.run_until_done(job)

with ThreadPoolExecutor(max_workers=3) as pool:
    for done in pool.map(render, scripts):
        print(done["video_url"])
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
