# @agentmedia/sdk

TypeScript SDK for [agent-media](https://agent-media.ai) — UGC video generation for developers.

Generate AI videos with realistic talking heads, B-roll, voiceover, animated subtitles, and music. One function call, finished video.

[![npm version](https://img.shields.io/npm/v/@agentmedia/sdk)](https://www.npmjs.com/package/@agentmedia/sdk)
[![license](https://img.shields.io/npm/l/@agentmedia/sdk)](https://github.com/gitroomhq/agent-media/blob/main/LICENSE)

## Install

```bash
npm install @agentmedia/sdk
```

## Quick Start

```typescript
import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({ apiKey: 'ma_YOUR_KEY' });

// Generate a video — polls until complete, returns the URL
const video = await client.createVideo({
  script: 'Have you tried building UGC content at scale? This API makes it trivial.',
  actor_slug: 'sofia',
  tone: 'energetic',
  style: 'hormozi',
  target_duration: 10,
});

console.log(video.video_url);
// → https://...mp4
```

That's it. Script in, video URL out.

## API Reference

### `new AgentMedia(config)`

| Parameter | Type | Required | Default |
|---|---|---|---|
| `apiKey` | `string` | Yes | — |
| `baseUrl` | `string` | No | `https://api.agent-media.ai` |

### `client.createVideo(input, options?)`

Generate a UGC video and wait for completion. Returns `{ job_id, video_url, credits_deducted, duration }`.

```typescript
const video = await client.createVideo({
  script: 'Your script here (50-3000 chars)',
  actor_slug: 'sofia',           // use listActors() to browse
  tone: 'energetic',             // energetic | calm | confident | dramatic
  music: 'chill',                // chill | energetic | corporate | dramatic | upbeat
  style: 'hormozi',              // 17 subtitle styles available
  target_duration: 10,           // 5 | 10 | 15 seconds
  aspect_ratio: '9:16',          // 9:16 | 16:9 | 1:1
  allow_broll: true,             // include AI-generated B-roll
  template: 'saas-review',       // optional template
  webhook_url: 'https://...',    // optional async callback
});
```

**Timeout:** Default 10 minutes. Override with `{ timeoutMs: 300_000 }`.

### `client.submitVideo(input)`

Submit a video job without waiting. Returns `{ job_id, status, credits_deducted }`. Use with `getVideoStatus()` for custom polling.

### `client.submitSubtitle(input)`

Add subtitles to an existing video.

```typescript
const job = await client.submitSubtitle({
  video_url: 'https://example.com/video.mp4',
  style: 'bold', // 17 styles: hormozi, minimal, bold, karaoke, neon, fire, ...
});
```

### `client.submitSaasReview(input)`

Generate a SaaS Review video from a URL.

```typescript
const job = await client.submitSaasReview({
  product_url: 'https://example.com/product',
  angle: 'enthusiastic', // honest | enthusiastic | roast | tutorial | comparison
  actor_slug: 'sofia',
});
```

`submitProductReview(input)` remains available as a deprecated wrapper for one release.

### `client.createProductActing(input, options?)`

Generate Product Acting UGC from a product image and actor. Returns `{ job_id, video_url, credits_deducted, duration, actor_slug }`.

```typescript
const video = await client.createProductActing({
  product_image_url: 'https://cdn.example.com/perfume.png',
  actor_slug: 'sofia',
  product_name: 'Rose Noir',
  product_description: 'Premium rose perfume with a warm vanilla dry-down.',
  template: 'product-in-hand',
  acting_style: 'honest-review',
  duration: 5,
  subtitle_style: 'hormozi',
});
```

Use `submitProductActing(input)` if you want to submit without waiting and poll with `getVideoStatus()`.

### Character Video — 3-step Content Machine pipeline

```typescript
const result = await client.createCharacterVideo({
  description: 'Marco, 35yo Italian chef, white uniform, curly black hair',
  script: 'Marco walks into his sunlit Brooklyn kitchen, takes a bite of fresh bread, smiles.',
  duration: 5,
  aspect_ratio: '9:16',
});

console.log(result.character_sheet_url); // Step 1 output
console.log(result.storyboard_url);       // Step 2 output
console.log(result.video_url);            // Step 3 output (final 720p MP4)
```

`createCharacterVideo` runs the three steps in order, threading a single `session_id` so the server backstops the scene prompt from the storyboard. Cost: 20 credits sheet (or 35 for description-only) + 20 storyboard + 350/700 video for 5s/10s.

For step-by-step control or the AI beat suggester, the lower-level methods are also exposed:

```typescript
// One of: actor_slug | reference_image_url | description
const sheet = await client.submitCharacterSheet({ description: 'Marco the chef' });
// (poll client.getVideoStatus(sheet.job_id) until completed)

const suggestions = await client.suggestStoryboard({
  character_description: 'Marco the chef',
  vibe: 'wholesome',
});
// → { options: [{ title, beats: [...] }, …] }

const sb = await client.submitCharacterStoryboard({
  character_sheet_url,
  beats: suggestions.options[0].beats,
});

const video = await client.submitCharacterVideo({
  character_sheet_url,
  storyboard_url,
  duration: 5,
});
```

### `client.listActors(options?)`

Browse available AI actors.

```typescript
const { actors, total } = await client.listActors({ limit: 20 });
actors.forEach(a => console.log(`${a.slug} — ${a.name} (${a.gender}, ${a.nationality})`));
```

### `client.getVideoStatus(jobId)`

Check job progress. Returns `{ job_id, status, video_url, error_message }`.

```typescript
const status = await client.getVideoStatus('job_abc123');
if (status.status === 'completed') console.log(status.video_url);
```

## Error Handling

```typescript
import { AgentMedia, AgentMediaError } from '@agentmedia/sdk';

try {
  const video = await client.createVideo({ script: '...' });
} catch (err) {
  if (err instanceof AgentMediaError) {
    console.error(`${err.code}: ${err.message} (HTTP ${err.status})`);
  }
}
```

## Types

All input types are exported from `@agentmedia/schema`:

```typescript
import type { CreateVideoInput, SubtitleInput, ProductReviewInput, ProductActingInput } from '@agentmedia/sdk';
```

## PIP (Picture-in-Picture) Mode

Compose talking head over custom background:

```typescript
const video = await client.createVideo({
  script: '...',
  actor_slug: 'sofia',
  composition_mode: 'pip',
  pip_options: {
    position: 'bottom-center',  // bottom-center | bottom-left | bottom-right
    size: 'medium',             // small | medium | large
    animation: 'slide-up',      // slide-up | slide-left | slide-right | fade | scale
    frame_style: 'rounded',     // none | rounded | shadow
  },
  broll_images: ['https://example.com/bg.jpg'],
});
```

## Webhooks

Skip polling — pass `webhook_url` and agent-media will POST to it when the job completes or fails.

```typescript
const job = await client.submitVideo({
  script: '...',
  actor_slug: 'sofia',
  webhook_url: 'https://example.com/webhooks/agent-media?secret=MY_TOKEN',
});
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

```typescript
const scripts = ['Script 1...', 'Script 2...', 'Script 3...'];

const videos = await Promise.all(
  scripts.map(script =>
    client.createVideo({ script, actor_slug: 'sofia', tone: 'confident' })
  )
);

videos.forEach(v => console.log(v.video_url));
```

## Related Packages

| Package | Description |
|---|---|
| [`agent-media-cli`](https://www.npmjs.com/package/agent-media-cli) | CLI tool — generate videos from your terminal |
| [`@agentmedia/mcp-server`](https://www.npmjs.com/package/@agentmedia/mcp-server) | MCP server for Claude Code, Cursor, Windsurf |
| [`@agentmedia/schema`](https://www.npmjs.com/package/@agentmedia/schema) | Shared schema — enums, types, Zod validation |
| [`agent-media`](https://pypi.org/project/agent-media/) | Python SDK |

## Links

- [Interactive API Docs](https://agent-media.ai/docs/api-reference)
- [OpenAPI Spec](https://agent-media.ai/openapi.json)
- [Website](https://agent-media.ai)
- [GitHub](https://github.com/gitroomhq/agent-media)

## License

Apache-2.0
