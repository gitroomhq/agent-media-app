#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Generates generated/openapi.json from the GENERATORS registry.
 * Addresses all findings from architect review 2026-04-11.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GENERATORS } from '../src/generators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../../../generated');
const outputPath = resolve(outputDir, 'openapi.json');

// ── Field descriptions ──────────────────────────────────────────────────────

const FIELD_DESCRIPTIONS: Record<string, string> = {
  script: 'Narration script for the video. Must be 50-3000 characters. Either script or prompt is required.',
  prompt: 'AI generates a script from this description. 1-1000 characters. Either script or prompt is required.',
  product_url: 'SaaS product URL for context during AI script generation.',
  actor_slug: 'AI actor slug for talking head. Run GET /v1/actors to browse. Example: "sofia", "marcus".',
  persona_slug: 'Custom persona slug (cloned voice + face). Mutually exclusive with actor_slug.',
  face_photo_url: 'Direct URL to a face photo. Mutually exclusive with actor_slug.',
  voice: 'TTS voice ID. Auto-detected from face photo if omitted.',
  target_duration: 'Target video duration in seconds. Must be 5, 10, or 15.',
  style: 'Subtitle style. 17 options: hormozi, minimal, bold, karaoke, clean, tiktok, neon, fire, glow, pop, aesthetic, impact, pastel, electric, boxed, gradient, spotlight.',
  tone: 'Voice tone for the narration.',
  voice_speed: 'TTS speed multiplier. 1.0 is normal, 0.7 is slow, 1.5 is fast.',
  music: 'Background music genre.',
  cta: 'End screen call-to-action text. Max 100 characters. Example: "Follow for more".',
  aspect_ratio: 'Video aspect ratio.',
  template: 'Script structure template. Options: monologue, testimonial, problem-solution, saas-review, before-after, listicle, product-demo.',
  composition_mode: 'Set to "pip" for picture-in-picture overlay mode.',
  allow_broll: 'Enable AI-generated B-roll cutaway scenes mixed with talking head.',
  broll_model: 'Deprecated. Backend auto-selects the best model. Accepted but ignored.',
  broll_images: 'Array of image URLs for B-roll scenes. Max 10. Use descriptive filenames for better scene matching.',
  product_image_url: 'Product image URL used as default B-roll reference.',
  dub_language: 'BCP-47 language code for dubbing the final video. Example: "es", "fr", "de".',
  scenes: 'Array of scene objects for explicit per-scene control. Bypasses AI scene splitting. Max 30.',
  webhook_url: 'URL to receive a POST callback when the job completes or fails.',
  video_url: 'URL of the video to add subtitles to.',
  angle: 'Review angle/perspective.',
  product_image_url: 'Public URL of the product image to place in the actor scene. PNG, JPEG, or WebP recommended.',
  actor_variant_id: 'Optional actor variant UUID for a specific outfit, framing, expression, or background.',
  product_name: 'Optional product name used for prompt/script context.',
  product_description: 'Product context used to generate a short script when script is omitted.',
  duration: 'Video duration in seconds. Must be 5, 10, or 15.',
  subtitles: 'Whether to burn word-level synced subtitles into the final video.',
  subtitle_style: 'Subtitle style. Use "none" to disable subtitle rendering.',
  template: 'Product Acting UGC scenario template.',
  acting_style: 'Product Acting UGC delivery style.',
  visual_style: 'Extra camera, pose, environment, or framing direction.',
};

// ── Build spec ──────────────────────────────────────────────────────────────

const paths: Record<string, unknown> = {};

for (const [id, gen] of Object.entries(GENERATORS).filter(([, gen]) => !(gen as { legacy?: boolean }).legacy)) {
  const jsonSchema = zodToJsonSchema(gen.inputSchema, {
    name: `${id}_input`,
    $refStrategy: 'none',
  });

  const schema = (jsonSchema as any).definitions?.[`${id}_input`] ?? jsonSchema;

  // Inject descriptions into properties
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
      if (FIELD_DESCRIPTIONS[key] && !prop.description) {
        prop.description = FIELD_DESCRIPTIONS[key];
      }
    }
  }

  // Add target_duration constraints
  if (schema.properties?.target_duration) {
    schema.properties.target_duration.minimum = 5;
    schema.properties.target_duration.maximum = 15;
    schema.properties.target_duration.description = FIELD_DESCRIPTIONS.target_duration;
  }

  paths[`/v1/generate/${id}`] = {
    post: {
      operationId: id,
      summary: gen.description,
      tags: ['generate'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema,
            example: id === 'ugc_video' ? {
              script: 'Have you ever struggled with creating video content? This tool changed everything for me.',
              actor_slug: 'sofia',
              tone: 'energetic',
              music: 'upbeat',
              style: 'hormozi',
              target_duration: 10,
              aspect_ratio: '9:16',
            } : id === 'subtitle' ? {
              video_url: 'https://example.com/video.mp4',
              style: 'hormozi',
            } : id === 'saas_review' ? {
              product_url: 'https://example.com/product',
              angle: 'honest',
              actor_slug: 'marcus',
            } : id === 'show_your_app' ? {
              app_screenshot_url: 'https://cdn.example.com/my-app.png',
              script: 'You really need to try this',
              duration: 5,
              subtitle_style: 'hormozi',
            } : id === 'product_acting_ugc' ? {
              product_image_url: 'https://cdn.example.com/perfume.png',
              actor_slug: 'sarah',
              product_name: 'Rose Noir',
              product_description: 'Premium rose perfume with a warm vanilla dry-down.',
              template: 'product-in-hand',
              acting_style: 'honest-review',
              duration: 5,
              subtitle_style: 'hormozi',
            } : undefined,
          },
        },
      },
      'x-codeSamples': id === 'ugc_video' ? [
        {
          lang: 'curl',
          label: 'cURL',
          source: `curl -X POST https://api.agent-media.ai/v1/generate/ugc_video \\
  -H "Authorization: Bearer ma_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "script": "Have you ever struggled with creating video content? This tool changed everything for me.",
    "actor_slug": "sofia",
    "tone": "energetic",
    "style": "hormozi",
    "target_duration": 10
  }'`,
        },
        {
          lang: 'python',
          label: 'Python',
          source: `from agent_media import AgentMedia

client = AgentMedia(api_key="ma_YOUR_KEY")
video = client.create_video(
    script="Have you ever struggled with creating video content? This tool changed everything for me.",
    actor_slug="sofia",
    tone="energetic",
    style="hormozi",
    target_duration=10,
)
print(video["video_url"])`,
        },
        {
          lang: 'typescript',
          label: 'TypeScript',
          source: `import { AgentMedia } from '@agent-media/sdk';

const client = new AgentMedia({ apiKey: 'ma_YOUR_KEY' });
const video = await client.createVideo({
  script: 'Have you ever struggled with creating video content? This tool changed everything for me.',
  actor_slug: 'sofia',
  tone: 'energetic',
  style: 'hormozi',
  target_duration: 10,
});
console.log(video.video_url);`,
        },
      ] : undefined,
      responses: {
        '201': {
          description: 'Job submitted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/JobSubmitted' },
            },
          },
        },
        '400': {
          description: 'Validation error — request body failed schema validation',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '401': {
          description: 'Unauthorized — missing or invalid Bearer token',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '402': {
          description: 'Insufficient credits',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InsufficientCredits' } } },
        },
        '403': {
          description: 'Plan tier insufficient for this operation',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '404': {
          description: 'Unknown generator ID',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '429': {
          description: 'Rate limit exceeded',
          headers: {
            'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until rate limit resets' },
          },
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  };
}

// ── Non-generator endpoints ─────────────────────────────────────────────────

paths['/v1/actors'] = {
  get: {
    operationId: 'listActors',
    summary: 'List actors with filters, or look up a single actor by slug',
    description:
      'Public endpoint — no API key required. Lists active actors, supports filters (gender, age_range, actor_type, preset, search), and returns a single actor when ?slug=… is provided (with similar-slug suggestions on 404). Rate limited to 60 requests/minute per IP.',
    tags: ['actors'],
    parameters: [
      { name: 'gender', in: 'query', required: false, schema: { type: 'string', enum: ['female', 'male'] }, description: 'Filter by gender' },
      { name: 'age_range', in: 'query', required: false, schema: { type: 'string', enum: ['18-25', '26-35', '36-50', '51+'] }, description: 'Filter by age range' },
      { name: 'actor_type', in: 'query', required: false, schema: { type: 'string', enum: ['Young Adult', 'Professional', 'Mom', 'Elder', 'Casual'] }, description: 'Filter by persona type' },
      { name: 'preset', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by preset tag (e.g. show_your_app)' },
      { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Case-insensitive substring on name' },
      { name: 'slug', in: 'query', required: false, schema: { type: 'string' }, description: 'Exact slug. Returns single actor or 404 with similar-slug suggestions. Other filters and pagination are ignored.' },
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 500, default: 500 }, description: 'Page size (ignored when slug is set). Default 500 — large enough to return the full active library in one call.' },
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Page offset (ignored when slug is set)' },
    ],
    responses: {
      '200': {
        description: 'Actor list (when slug is omitted) or single actor (when slug is given).',
        content: {
          'application/json': {
            schema: { oneOf: [{ $ref: '#/components/schemas/ActorList' }, { $ref: '#/components/schemas/ActorSingle' }] },
            example: {
              actors: [
                {
                  id: '66ac63f6-1be0-4c70-9914-c8ed90208be0',
                  slug: 'aaliyah',
                  name: 'Aaliyah',
                  gender: 'female',
                  age: 28,
                  age_range: '26-35',
                  nationality: 'African American',
                  actor_type: 'Professional',
                  style: 'Confident, poised, thoughtful presence',
                  portrait_url: 'https://example.com/aaliyah.png',
                  green_screen_url: 'https://example.com/aaliyah-gs.png',
                  voice_id: 'cgSgspJ2msm6clMCkdW9',
                  voice_gender: 'female',
                  lip_sync_engine: 'aurora',
                  preset: null,
                  presets: ['show_your_app'],
                  status: 'active',
                },
              ],
              total: 200,
              limit: 50,
              offset: 0,
            },
          },
        },
      },
      '404': {
        description: 'Slug lookup miss. Includes a similar-slug suggestion list.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      '429': {
        description: 'Rate limited',
        headers: { 'Retry-After': { schema: { type: 'integer' } } },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
};

paths['/v1/videos/{jobId}'] = {
  get: {
    operationId: 'getVideoStatus',
    summary: 'Get video generation job status',
    description: 'Poll this endpoint to check if your video is ready. Status progresses: submitted → processing → completed (or failed). When completed, video_url contains the download link.',
    tags: ['videos'],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'jobId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Job ID returned from the generate endpoint',
      },
    ],
    responses: {
      '200': {
        description: 'Job status and video URL (when completed)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/JobStatus' },
            example: {
              job_id: '9ba7ff45-b161-4aba-b14c-fd87d7e19a77',
              status: 'completed',
              progress: {},
              video_url: 'https://media.agent-media.ai/generation-outputs/.../ugc-final.mp4',
              error_message: null,
              created_at: '2026-04-11T10:00:00Z',
              updated_at: '2026-04-11T10:03:00Z',
            },
          },
        },
      },
      '404': {
        description: 'Job not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
};

// ── Full spec ───────────────────────────────────────────────────────────────

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'agent-media API',
    version: '1.0.0',
    description: `AI UGC video production API. Generate talking head videos with lip-synced AI actors, SaaS reviews, and styled subtitles.

## Authentication
All endpoints require a Bearer token. Use either:
- **API key**: \`Authorization: Bearer ma_your_key_here\`
- **Supabase JWT**: \`Authorization: Bearer eyJ...\`

## Async workflow
Video generation is async. POST to /v1/generate/* returns a job_id immediately. Poll GET /v1/videos/{jobId} until status is "completed" or "failed". Optionally pass webhook_url to receive a callback.

## Rate limits
- Generate endpoints: 10 requests/minute per user
- Read endpoints: 60 requests/minute per user`,
    contact: { name: 'agent-media', url: 'https://agent-media.ai' },
    license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    termsOfService: 'https://agent-media.ai/terms',
  },
  servers: [
    { url: 'https://api.agent-media.ai', description: 'Production' },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key (ma_xxx prefix) or Supabase JWT token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        description: 'Standard error response',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Machine-readable error code', example: 'VALIDATION_ERROR' },
              message: { type: 'string', description: 'Human-readable error message', example: 'script: String must contain at least 50 character(s)' },
              details: { type: 'array', items: { type: 'object' }, description: 'Detailed validation errors (Zod issues)' },
            },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
      InsufficientCredits: {
        type: 'object',
        description: 'Returned when user does not have enough credits',
        properties: {
          error: { type: 'string', example: 'insufficient_credits' },
          error_description: { type: 'string', example: 'UGC video (~10s) costs 300 credits, but you only have 50 credits available.' },
          credits_required: { type: 'integer', example: 300 },
          credits_available: { type: 'integer', example: 50 },
        },
        required: ['error', 'error_description', 'credits_required', 'credits_available'],
      },
      JobSubmitted: {
        type: 'object',
        description: 'Returned when a generation job is successfully submitted',
        properties: {
          job_id: { type: 'string', format: 'uuid', description: 'Unique job identifier. Use this to poll status.' },
          status: { type: 'string', enum: ['submitted'], description: 'Always "submitted" for new jobs.' },
          estimated_duration: { type: 'integer', description: 'Estimated video duration in seconds.' },
          credits_deducted: { type: 'integer', description: 'Credits charged for this job.' },
          selected_voice: { type: 'string', description: 'Voice ID used (auto-detected or explicit).' },
          voice_auto_detected: { type: 'boolean', description: 'True if voice was auto-detected from face photo.' },
          word_count: { type: 'integer', description: 'Number of words in the script.' },
          words_per_second: { type: 'number', description: 'Speaking pace (words/sec).' },
          max_words: { type: 'integer', description: 'Max recommended words for the target duration.' },
          pacing_warning: { type: ['string', 'null'], description: 'Warning if script was too long and duration was auto-upgraded.' },
        },
        required: ['job_id', 'status'],
      },
      JobStatus: {
        type: 'object',
        description: 'Video generation job status',
        properties: {
          job_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['submitted', 'processing', 'completed', 'failed'], description: 'Current job status.' },
          progress: { type: 'object', description: 'Progress details (provider-specific).' },
          video_url: { type: ['string', 'null'], format: 'uri', description: 'Download URL when status is "completed". Null otherwise.' },
          error_message: { type: ['string', 'null'], description: 'Error details when status is "failed". Null otherwise.' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['job_id', 'status'],
      },
      Actor: {
        type: 'object',
        description: 'A single AI actor record from the actor library.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string', description: 'Use this in actor_slug when generating videos.' },
          name: { type: 'string' },
          gender: { type: 'string', enum: ['female', 'male'] },
          age: { type: 'integer' },
          age_range: { type: 'string', enum: ['18-25', '26-35', '36-50', '51+'] },
          nationality: { type: 'string' },
          actor_type: { type: 'string', enum: ['Young Adult', 'Professional', 'Mom', 'Elder', 'Casual'] },
          style: { type: 'string', description: 'On-camera style descriptor.' },
          portrait_url: { type: 'string', format: 'uri' },
          green_screen_url: { type: 'string', format: 'uri', nullable: true },
          voice_id: { type: 'string', description: 'ElevenLabs voice id used by default for this actor.' },
          voice_gender: { type: 'string' },
          lip_sync_engine: { type: 'string' },
          preset: { type: 'string', nullable: true },
          presets: { type: 'array', items: { type: 'string' } },
          bio_occupation: { type: 'string' },
          bio_story: { type: 'string' },
          bio_hobbies: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['active'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'slug', 'name', 'portrait_url', 'gender'],
      },
      ActorList: {
        type: 'object',
        description: 'Paginated list of active actors. Returned when slug is omitted.',
        properties: {
          actors: { type: 'array', items: { $ref: '#/components/schemas/Actor' } },
          total: { type: 'integer', description: 'Total matching actors.' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
        required: ['actors', 'total', 'limit', 'offset'],
      },
      ActorSingle: {
        type: 'object',
        description: 'Single-actor response shape. Returned when slug is provided.',
        properties: { actor: { $ref: '#/components/schemas/Actor' } },
        required: ['actor'],
      },
    },
  },
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
console.log(`Generated: ${outputPath}`);
console.log(`Endpoints: ${Object.keys(paths).length}`);
console.log(`Generators: ${Object.values(GENERATORS).filter((gen) => !(gen as { legacy?: boolean }).legacy).length}`);
