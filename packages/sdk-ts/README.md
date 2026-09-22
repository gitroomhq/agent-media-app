# @agentmedia/sdk

TypeScript SDK for [agent-media](https://agent-media.ai), AI UGC video generation for developers.

Describe a person, give them a script, get a 9:16 clip with native audio and burned subtitles. Or generate any clip, image or voice from a prompt.

[![npm version](https://img.shields.io/npm/v/@agentmedia/sdk)](https://www.npmjs.com/package/@agentmedia/sdk)
[![license](https://img.shields.io/npm/l/@agentmedia/sdk)](https://github.com/gitroomhq/agent-media-app/blob/main/LICENSE)

## Install

```bash
npm install @agentmedia/sdk
```

## Quick Start

```typescript
import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({ apiKey: 'ma_YOUR_KEY' });

// A selfie clip: generated on-model person, native audio, subtitles burned in.
// runUntilDone polls until the job lands (completed | failed).
const done = await client.v2.runUntilDone(
  client.v2.selfie({
    description: 'woman in her late 20s, warm and natural, kitchen morning light',
    script: 'Have you tried building UGC content at scale? This API makes it trivial.',
    duration: 10,
  }),
);

console.log(done.video_url);
// → https://...mp4
```

Or one clip from a prompt on the loose surface:

```typescript
const job = await client.v2.generateVideo({
  prompt: 'A 28-year-old woman in a bright kitchen, phone framing, says: "Okay, this actually works."',
  seconds: 5,
  aspect: '9:16',
});
const status = await client.v2.runUntilDone(Promise.resolve(job));
```

## Retired on 2026-09-22

`createVideo`, `submitVideo`, `submitSaasReview` and `submitProductReview` wrapped the v1 UGC pipeline, whose talking-head model was discontinued by its provider. They now throw `AgentMediaError` with `status 410` and `code GENERATOR_RETIRED` without making a request. Move to `client.v2.selfie(...)` (a person delivering your script) or `client.v2.generateVideo(...)` (any clip from a prompt).

## API Reference

### `new AgentMedia(config)`

| Parameter | Type | Required | Default |
|---|---|---|---|
| `apiKey` | `string` | Yes | — |
| `baseUrl` | `string` | No | `https://api.agent-media.ai` |

### `client.submitSubtitle(input)`

Add subtitles to an existing video.

```typescript
const job = await client.submitSubtitle({
  video_url: 'https://example.com/video.mp4',
  style: 'bold', // 17 styles: hormozi, minimal, bold, karaoke, neon, fire, ...
});
```

### `client.v2.selfie(input)`

Submit a selfie clip. Returns `{ job_id, status }`; poll with `client.v2.status(jobId)` or wrap in `client.v2.runUntilDone(...)`.

```typescript
const job = await client.v2.selfie({
  description: 'woman in her late 20s, warm and natural',   // or character_id: 'char_...' from createCharacter
  photo_url: 'https://cdn.example.com/me.png',              // optional exact likeness
  script: 'Stop scrolling. This tool changed everything for me.',
  duration: 10,                                             // 5 | 10 | 15
  subtitles: true,
  shot_preset: 'kitchen-glow-up',                           // optional scene
  vibe: 'excited',                                          // excited | calm | sassy | serious | curious
  engine: 'seedance-2.0',                                   // or seedance-2.5
});
```

75 credits plus 60 per second on seedance-2.0 (375 for 5s, 675 for 10s). Failed jobs are refunded.

### `client.v2.generateVideo(input)`, `generateImage(input)`, `generateAudio(input)`, `quote(kind, input)`

The loose surface, `POST /v2/generate/{kind}`. `generateVideo` takes `prompt`, `seconds`, `aspect`, `quality` (480p | 720p | 1080p), and either `first_frame` (+ `last_frame`) for image-to-video or `refs` / `video_refs` / `audio_refs` for reference-to-video. `quote` returns the credits for the same body without running it.

### `client.v2.createCharacter(input)`

Persist a person once (`name`, `description`, optional `photo_url`) and reuse the returned `character_id` on every selfie.

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
  const job = await client.v2.selfie({ description: '...', script: '...' });
} catch (err) {
  if (err instanceof AgentMediaError) {
    console.error(`${err.code}: ${err.message} (HTTP ${err.status})`);
  }
}
```

## Types

All input types are exported from `@agentmedia/schema`:

```typescript
import type { SubtitleInput, ProductActingInput, V2LooseSubmitted, V2Quote } from '@agentmedia/sdk';
import type { SelfieInput, CharacterCreateInput } from '@agentmedia/schema/v2';
```

## Webhooks

The v2 routes have no `webhook_url` field. Poll `client.v2.status(jobId)` (the API sends `Retry-After: 5` while a job runs) or let `client.v2.runUntilDone(...)` do it. `webhook_url` still works on the remaining v1 generators (`submitSubtitle`, `createProductActing`, `createShowYourApp`, `createLaptopUgc`):

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
  "error_message": "Reference image is corrupt or unreadable."
}
```

**Rules:**
- Must be `https://` (plain HTTP is rejected)
- Publicly reachable
- Max 2048 characters
- Retries on non-2xx: 3 attempts with exponential backoff (1 s, 4 s, 16 s)
- Query strings are preserved: append `?secret=MY_TOKEN` to verify authenticity

## Batch Generation

```typescript
const scripts = ['Script 1...', 'Script 2...', 'Script 3...'];

const results = await Promise.all(
  scripts.map(script =>
    client.v2.runUntilDone(
      client.v2.selfie({ description: 'woman in her late 20s, warm and natural', script, vibe: 'serious' }),
    ),
  ),
);

results.forEach(r => console.log(r.video_url));
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
- [GitHub](https://github.com/gitroomhq/agent-media-app)

## License

Apache-2.0
