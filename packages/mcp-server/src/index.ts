#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * agent-media MCP Server
 *
 * Exposes agent-media video generation to Claude Code, Cursor, Windsurf,
 * and any MCP-compatible client.
 *
 * Tools:
 *   - create_video: Generate a UGC video from a script
 *   - list_actors: Browse available AI actors
 *   - get_video_status: Check generation job status
 *
 * Auth: Set AGENT_MEDIA_API_KEY env var (ma_xxx format).
 * API URL: Defaults to api-v2. Override with AGENT_MEDIA_API_URL.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GENERATORS,
  CreateVideoSchema,
  ShowYourAppSchema,
  ProductActingSchema,
  LaptopUgcSchema,
  CharacterSheetSchema,
  CharacterStoryboardSchema,
  StoryboardSuggestSchema,
  CharacterVideoSchema,
  TextToVideoSchema,
} from '@agentmedia/schema';
// v2 registry — drives the generic v2 tool loop below. The legacy tools
// (10 of them) stay hand-registered; v2 tools self-register from the
// V2_GENERATORS record, so adding the next v2 product (Product-in-hands)
// is zero MCP edits.
import { V2_GENERATORS, type V2GeneratorRecord } from '@agentmedia/schema/v2';

const API_URL = process.env.AGENT_MEDIA_API_URL || 'https://api.agent-media.ai';
const API_KEY = process.env.AGENT_MEDIA_API_KEY || '';

if (!API_KEY) {
  console.error('AGENT_MEDIA_API_KEY is required. Set it to your ma_xxx API key.');
  process.exit(1);
}

// ── API client ───────────────────────────────────────────────────────────────

async function apiCall(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const resp = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function pollUntilDone(jobId: string, maxWait = 600_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const { data } = await apiCall('GET', `/v1/videos/${jobId}`);
    if (data.status === 'completed' || data.status === 'failed') return data;
    await new Promise(r => setTimeout(r, 5_000));
  }
  return { status: 'timeout', error_message: 'Polling timed out after 10 minutes' };
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const createVideoSchema = zodToJsonSchema(CreateVideoSchema as any, {
  name: 'create_video_input',
  $refStrategy: 'none',
});
const createVideoInputSchema = (createVideoSchema as any).definitions?.create_video_input ?? createVideoSchema;

const showYourAppSchema = zodToJsonSchema(ShowYourAppSchema as any, {
  name: 'show_your_app_input',
  $refStrategy: 'none',
});
const showYourAppInputSchema = (showYourAppSchema as any).definitions?.show_your_app_input ?? showYourAppSchema;

const productActingSchema = zodToJsonSchema(ProductActingSchema as any, {
  name: 'product_acting_ugc_input',
  $refStrategy: 'none',
});
const productActingInputSchema = (productActingSchema as any).definitions?.product_acting_ugc_input ?? productActingSchema;

const laptopUgcSchema = zodToJsonSchema(LaptopUgcSchema as any, {
  name: 'laptop_ugc_input',
  $refStrategy: 'none',
});
const laptopUgcInputSchema = (laptopUgcSchema as any).definitions?.laptop_ugc_input ?? laptopUgcSchema;

const characterSheetSchema = zodToJsonSchema(CharacterSheetSchema as any, {
  name: 'character_sheet_input',
  $refStrategy: 'none',
});
const characterSheetInputSchema = (characterSheetSchema as any).definitions?.character_sheet_input ?? characterSheetSchema;

const characterStoryboardSchema = zodToJsonSchema(CharacterStoryboardSchema as any, {
  name: 'character_storyboard_input',
  $refStrategy: 'none',
});
const characterStoryboardInputSchema = (characterStoryboardSchema as any).definitions?.character_storyboard_input ?? characterStoryboardSchema;

const storyboardSuggestSchema = zodToJsonSchema(StoryboardSuggestSchema as any, {
  name: 'storyboard_suggest_input',
  $refStrategy: 'none',
});
const storyboardSuggestInputSchema = (storyboardSuggestSchema as any).definitions?.storyboard_suggest_input ?? storyboardSuggestSchema;

const characterVideoSchema = zodToJsonSchema(CharacterVideoSchema as any, {
  name: 'character_video_input',
  $refStrategy: 'none',
});
const characterVideoInputSchema = (characterVideoSchema as any).definitions?.character_video_input ?? characterVideoSchema;

const textToVideoSchema = zodToJsonSchema(TextToVideoSchema as any, {
  name: 'text_to_video_input',
  $refStrategy: 'none',
});
const textToVideoInputSchema = (textToVideoSchema as any).definitions?.text_to_video_input ?? textToVideoSchema;

const tools = [
  {
    name: 'create_video',
    description: GENERATORS.ugc_video.description + '. Submits the job and polls until complete. Returns the video URL.',
    inputSchema: createVideoInputSchema,
  },
  {
    name: 'show_your_app',
    description: 'Generate a video of an AI actor holding a phone that shows your app screenshot, with Hormozi-style word-by-word subtitles burned in. The app_screenshot_url MUST be vertical (portrait) — PNG, JPEG, or WebP. If actor_slug is omitted, a random actor from the show_your_app pool is selected. Script is capped at 3 words/second × duration. Submits the job and polls until complete. Returns the video URL.',
    inputSchema: showYourAppInputSchema,
  },
  {
    name: 'product_acting_ugc',
    description: 'Generate Product Acting UGC: an AI creator presents or reacts to a product image in a real-world UGC scenario. Requires product_image_url and actor_slug. Provide script for exact words, or product_description so the API can generate a short script. Submits the job and polls until complete. Returns the video URL.',
    inputSchema: productActingInputSchema,
  },
  {
    name: 'laptop_ugc',
    description: 'Generate a 3-scene Laptop UGC ad: actor holds laptop showing your app, scrolling B-roll, then a face-only selfie close. Native lip-synced audio + Hormozi-style subtitles. Provide EITHER app_screen_recording_url (mp4/mov, max 10 MB, 10s) OR app_screen_image_url (png/jpeg/webp, max 5 MB), not both. Script auto-splits at sentence boundary between two face shots. Duration is 15 or 20 seconds. If actor_slug is omitted, a random actor is selected. Submits the job and polls until complete. Returns the video URL.',
    inputSchema: laptopUgcInputSchema,
  },
  {
    name: 'create_character_sheet',
    description: 'Step 1 of the Content Machine pipeline. Generates a multi-angle character reference sheet (front / 3-quarter / profile / back + facial expressions) via gpt-image-2 in 3:2 landscape. Provide a description, an actor_slug from the library, OR a reference_image_url — at least one. Async: returns 202 + job_id; poll GET /v1/videos/{id} until status="completed". Cost: 20 credits ($0.20) for actor/reference, 35 credits ($0.35) for description-only (paints portrait first). Returns the character_sheet_url to feed into create_storyboard.',
    inputSchema: characterSheetInputSchema,
  },
  {
    name: 'suggest_storyboard',
    description: 'Optional helper before create_storyboard. Calls Claude Opus 4.7 to return 3 distinct beat-sequence options for the character (different vibes / scenarios). No credits. Sync — returns immediately. Pick one option\'s `beats` array and pass it to create_storyboard.',
    inputSchema: storyboardSuggestInputSchema,
  },
  {
    name: 'create_storyboard',
    description: 'Step 2 of the Content Machine pipeline. Paints a storyboard panel grid for the character via gpt-image-2 in 9:16 / 16:9 / 1:1. Provide character_sheet_url (from create_character_sheet) plus EITHER `beats` (3-10 short strings) OR `script` (free-text up to 1500 chars; the model splits it into 4-6 panels itself). Async: returns 202 + job_id; poll GET /v1/videos/{id}. Cost: 20 credits ($0.20). Returns storyboard_url to feed into create_character_video.',
    inputSchema: characterStoryboardInputSchema,
  },
  {
    name: 'create_character_video',
    description: 'Step 3 of the Content Machine pipeline. Renders a Seedance 2.0 720p reference-to-video clip from the character sheet + storyboard. Provide character_sheet_url and storyboard_url (URLs from steps 1+2 — may also be your own public PNGs). Pass action_prompt with the scene/location/dialogue OR include session_id (the same UUID used for steps 1+2) so api-v2 backstops it from your storyboard\'s script/beats. Async: returns 202 + job_id; poll GET /v1/videos/{id} (typical render 90-180s). Cost: 350 credits ($3.50) for 5s, 700 credits ($7.00) for 10s.',
    inputSchema: characterVideoInputSchema,
  },
  {
    name: 'text_to_video',
    description: 'Pure-prompt text-to-video via Seedance 2.0 at 720p. No character sheet, no storyboard, no actor — the prompt IS the whole creative direction (style, subject, mood, composition, lighting, motion all baked in). Best for stylistic / scene-driven content. Submits the job and polls until complete; returns the video URL. Cost: 350 cr ($3.50) for 5s, 700 cr ($7.00) for 10s, 1050 cr ($10.50) for 15s. **Auto-publish:** pass `postiz_integration_ids: ["id1", "id2"]` and either `caption: "..."` (static) or `caption_mode: "ai"` + optional `caption_guidance: "..."` to fan the rendered video out to X / LinkedIn / etc. on completion. The IDs come from listing Postiz integrations.',
    inputSchema: textToVideoInputSchema,
  },
  {
    name: 'list_actors',
    description: 'List available AI actors for talking head videos. Returns slugs, names, and demographics. Use the slug in create_video\'s actor_slug field.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max actors to return (default 20, max 200)', default: 20 },
        offset: { type: 'number', description: 'Pagination offset', default: 0 },
      },
    },
  },
  {
    name: 'get_video_status',
    description: 'Check the status of a video generation job. Returns status, video URL (when completed), and error message (when failed).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        job_id: { type: 'string', description: 'Job ID from create_video' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'list_characters',
    description: 'List the user\'s saved, reusable characters. Returns each character\'s name + character_sheet_url (pass that back into a video tool to reuse the same identity) + a portrait/thumbnail URL. Use when the user wants to see or reuse one of their saved characters.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max characters to return (default 50, max 100)', default: 50 },
      },
    },
  },
  // ── Publish-to-social — post a generated video to TikTok / Instagram / X ──
  {
    name: 'social_channels',
    description: 'List the user\'s connected social channels (TikTok / Instagram / X). Returns [{ id, name, provider, profile }]. Use the id in social_publish.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'social_connect',
    description: 'Start connecting a social network. Returns an OAuth url the HUMAN must open to authorize — an agent cannot OAuth on their behalf. After they authorize, call social_channels to get the channel id.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        provider: { type: 'string', description: 'tiktok | instagram | instagram-standalone | x', enum: ['tiktok', 'instagram', 'instagram-standalone', 'x'] },
      },
      required: ['provider'],
    },
  },
  {
    name: 'social_publish',
    description: 'Publish (or schedule) an agent-media R2-hosted video to one or more connected channels. video_url must be an agent-media output URL; channel_ids come from social_channels. Returns { success, post_ids }.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        video_url: { type: 'string', description: 'R2-hosted video URL (a video skill output)' },
        channel_ids: { type: 'array', items: { type: 'string' }, description: 'Channel ids from social_channels' },
        caption: { type: 'string', description: 'Post caption', default: '' },
        type: { type: 'string', enum: ['now', 'schedule'], description: 'Post now or schedule', default: 'now' },
        date: { type: 'string', description: 'ISO-8601 time, required when type=schedule' },
      },
      required: ['video_url', 'channel_ids'],
    },
  },
];

// ── v2 tools — auto-generated from V2_GENERATORS ──────────────────────────
//
// Each v2 generator declares `mcp.toolName` and `rest.{method,path}` in the
// registry. The generic dispatcher below uses those to call api-v2; nothing
// per-tool is hand-written. Adding the next v2 product = add a row to
// V2_GENERATORS in @agentmedia/schema/v2.

const v2Tools = Object.values(V2_GENERATORS)
  .filter((def): def is V2GeneratorRecord => !!def.mcp)
  .map((def) => {
    const schema = zodToJsonSchema(def.inputSchema as any, {
      name: `${def.id}_input`,
      $refStrategy: 'none',
    });
    return {
      name: def.mcp!.toolName,
      description:
        (def.status === 'beta' ? '[beta] ' : '') +
        def.summary +
        '\n\n' +
        def.description,
      inputSchema:
        (schema as any).definitions?.[`${def.id}_input`] ?? schema,
    };
  });

tools.push(...v2Tools);

// Lookup table for the call handler.
const v2ByToolName: Record<string, V2GeneratorRecord> = Object.fromEntries(
  Object.values(V2_GENERATORS)
    .filter((def) => !!def.mcp)
    .map((def) => [def.mcp!.toolName, def]),
);

// ── vNext skills — pulled live from /v1/skills on startup ─────────────────
//
// The vNext skill registry is the source of truth, hosted by api-v2. We
// fetch it once at process start and surface every skill as an MCP tool.
// This keeps the stdio server automatically in sync with what users hit
// over HTTP MCP. If the fetch fails, the server still boots with the
// legacy tools.

interface VnextSkillListEntry {
  slug: string;
  name: string;
  version: string;
  description: string;
  primitive: string;
  input_schema?: unknown;
}

const vnextBySlug: Record<string, VnextSkillListEntry> = {};

async function loadVnextSkills(): Promise<void> {
  try {
    const { status, data } = await apiCall('GET', '/v1/skills');
    if (status !== 200 || !Array.isArray(data?.skills)) {
      console.error(`[agent-media] vNext skills not loaded (status ${status})`);
      return;
    }
    for (const s of data.skills as VnextSkillListEntry[]) {
      vnextBySlug[s.slug] = s;
      tools.push({
        name: s.slug,
        description: `${s.name} (v${s.version}) — ${s.description}`,
        inputSchema: (s.input_schema as object) ?? { type: 'object', additionalProperties: true },
      });
    }
  } catch (err) {
    console.error('[agent-media] vNext skills fetch failed:', (err as Error).message);
  }
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'agent-media', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'create_video': {
      const { status, data } = await apiCall('POST', '/v1/generate/ugc_video', args);
      if (status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }

      // Poll until done
      const result = await pollUntilDone(data.job_id);

      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Video generated successfully!\n\nJob ID: ${data.job_id}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return {
          content: [{ type: 'text', text: `Video generation failed: ${result.error_message}` }],
          isError: true,
        };
      } else {
        return {
          content: [{ type: 'text', text: `Video generation timed out. Job ID: ${data.job_id} — check status later.` }],
        };
      }
    }

    case 'show_your_app': {
      const { status, data } = await apiCall('POST', '/v1/generate/show_your_app', args);
      if (status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }

      const result = await pollUntilDone(data.job_id);

      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Show Your App video generated!\n\nJob ID: ${data.job_id}\nActor: ${data.actor_slug}${data.actor_random ? ' (random)' : ''}\nSubtitles: ${data.subtitle_style}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return {
          content: [{ type: 'text', text: `Show Your App failed: ${result.error_message}` }],
          isError: true,
        };
      } else {
        return {
          content: [{ type: 'text', text: `Show Your App timed out. Job ID: ${data.job_id} — check status later.` }],
        };
      }
    }

    case 'product_acting_ugc': {
      const { status, data } = await apiCall('POST', '/v1/generate/product_acting_ugc', args);
      if (status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }

      const result = await pollUntilDone(data.job_id);

      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Product Acting UGC video generated!\n\nJob ID: ${data.job_id}\nActor: ${data.actor_slug}\nSubtitles: ${data.subtitle_style}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return {
          content: [{ type: 'text', text: `Product Acting UGC failed: ${result.error_message}` }],
          isError: true,
        };
      } else {
        return {
          content: [{ type: 'text', text: `Product Acting UGC timed out. Job ID: ${data.job_id} — check status later.` }],
        };
      }
    }

    case 'laptop_ugc': {
      const { status, data } = await apiCall('POST', '/v1/generate/laptop_ugc', args);
      if (status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }

      const result = await pollUntilDone(data.job_id);

      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Laptop UGC video generated!\n\nJob ID: ${data.job_id}\nActor: ${data.actor_slug}${data.actor_random ? ' (random)' : ''}\nSubtitles: ${data.subtitle_style}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return {
          content: [{ type: 'text', text: `Laptop UGC failed: ${result.error_message}` }],
          isError: true,
        };
      } else {
        return {
          content: [{ type: 'text', text: `Laptop UGC timed out. Job ID: ${data.job_id} — check status later.` }],
        };
      }
    }

    case 'create_character_sheet': {
      const { status, data } = await apiCall('POST', '/v1/character/sheet-generate', args);
      // sheet-generate returns 202 on accept (async)
      if (status !== 202) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }
      const result = await pollUntilDone(data.job_id);
      if (result.status === 'completed') {
        const sheetUrl = result.video_url ?? result.character_sheet_url ?? result.output_url;
        return {
          content: [{
            type: 'text',
            text: `Character sheet generated.\n\nJob ID: ${data.job_id}\nCredits: ${data.credits_deducted}\ncharacter_sheet_url: ${sheetUrl}\n\nNext: pass character_sheet_url to create_storyboard.`,
          }],
        };
      } else if (result.status === 'failed') {
        return { content: [{ type: 'text', text: `Character sheet failed: ${result.error_message}` }], isError: true };
      } else {
        return { content: [{ type: 'text', text: `Character sheet timed out. Job ID: ${data.job_id}` }] };
      }
    }

    case 'suggest_storyboard': {
      const { status, data } = await apiCall('POST', '/v1/character/storyboard-suggest', args);
      if (status !== 200) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }
      const options = Array.isArray(data.options) ? data.options : [];
      if (options.length === 0) {
        return { content: [{ type: 'text', text: 'No storyboard suggestions returned.' }], isError: true };
      }
      const formatted = options.map((opt: any, i: number) =>
        `### Option ${i + 1}: ${opt.title}\n${opt.beats.map((b: string, j: number) => `${j + 1}. ${b}`).join('\n')}`
      ).join('\n\n');
      return {
        content: [{ type: 'text', text: `Storyboard suggestions (pick a beats array and pass to create_storyboard):\n\n${formatted}` }],
      };
    }

    case 'create_storyboard': {
      const { status, data } = await apiCall('POST', '/v1/character/storyboard-generate', args);
      if (status !== 202) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }
      const result = await pollUntilDone(data.job_id);
      if (result.status === 'completed') {
        const sbUrl = result.video_url ?? result.storyboard_url ?? result.output_url;
        return {
          content: [{
            type: 'text',
            text: `Storyboard generated.\n\nJob ID: ${data.job_id}\nCredits: ${data.credits_deducted}\nstoryboard_url: ${sbUrl}\n\nNext: pass storyboard_url + character_sheet_url to create_character_video.`,
          }],
        };
      } else if (result.status === 'failed') {
        return { content: [{ type: 'text', text: `Storyboard failed: ${result.error_message}` }], isError: true };
      } else {
        return { content: [{ type: 'text', text: `Storyboard timed out. Job ID: ${data.job_id}` }] };
      }
    }

    case 'create_character_video': {
      const { status, data } = await apiCall('POST', '/v1/generate/character_video', args);
      if (status !== 202 && status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }
      const result = await pollUntilDone(data.job_id);
      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Character video generated.\n\nJob ID: ${data.job_id}\nDuration: ${data.duration}s\nAspect ratio: ${data.aspect_ratio}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return { content: [{ type: 'text', text: `Character video failed: ${result.error_message}` }], isError: true };
      } else {
        return { content: [{ type: 'text', text: `Character video timed out. Job ID: ${data.job_id} — check status later.` }] };
      }
    }

    case 'text_to_video': {
      const { status, data } = await apiCall('POST', '/v1/generate/text_to_video', args);
      if (status !== 202 && status !== 201) {
        return {
          content: [{ type: 'text', text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}` }],
          isError: true,
        };
      }
      const result = await pollUntilDone(data.job_id);
      if (result.status === 'completed') {
        return {
          content: [{
            type: 'text',
            text: `Text-to-video generated.\n\nJob ID: ${data.job_id}\nDuration: ${data.duration}s\nAspect ratio: ${data.aspect_ratio}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
          }],
        };
      } else if (result.status === 'failed') {
        return { content: [{ type: 'text', text: `Text-to-video failed: ${result.error_message}` }], isError: true };
      } else {
        return { content: [{ type: 'text', text: `Text-to-video timed out. Job ID: ${data.job_id} — check status later.` }] };
      }
    }

    case 'list_actors': {
      const limit = (args as any)?.limit ?? 20;
      const offset = (args as any)?.offset ?? 0;
      const { status, data } = await apiCall('GET', `/v1/actors?limit=${limit}&offset=${offset}`);

      if (status !== 200) {
        return {
          content: [{ type: 'text', text: `Error: ${data.error?.message ?? 'Failed to fetch actors'}` }],
          isError: true,
        };
      }

      const actorList = data.actors.map((a: any) =>
        `${a.slug} — ${a.name} (${a.gender}, ${a.age}, ${a.nationality})`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `${data.total} actors available (showing ${data.actors.length}):\n\n${actorList}`,
        }],
      };
    }

    case 'get_video_status': {
      const jobId = (args as any)?.job_id;
      if (!jobId) {
        return { content: [{ type: 'text', text: 'job_id is required' }], isError: true };
      }

      const { status, data } = await apiCall('GET', `/v1/videos/${jobId}`);
      if (status === 404) {
        return { content: [{ type: 'text', text: `Job ${jobId} not found` }], isError: true };
      }

      return {
        content: [{
          type: 'text',
          text: `Job: ${data.job_id}\nStatus: ${data.status}\n${data.video_url ? `Video URL: ${data.video_url}` : ''}${data.error_message ? `Error: ${data.error_message}` : ''}`,
        }],
      };
    }

    case 'list_characters': {
      const limit = Math.min(Math.max(Number((args as any)?.limit) || 50, 1), 100);
      const { status, data } = await apiCall('GET', `/v1/characters?limit=${limit}`);
      if (status !== 200) {
        return { content: [{ type: 'text', text: `Error (${status}): ${data?.error?.message ?? data?.detail ?? JSON.stringify(data).slice(0, 300)}` }], isError: true };
      }
      const chars = (data?.characters ?? []) as Array<{ name?: string; character_sheet_url?: string }>;
      if (chars.length === 0) {
        return { content: [{ type: 'text', text: 'No saved characters yet.' }] };
      }
      const list = chars.map((c) => `- ${c.name}: ${c.character_sheet_url}`).join('\n');
      return { content: [{ type: 'text', text: `${chars.length} saved character(s):\n${list}` }] };
    }

    case 'social_channels': {
      const { status, data } = await apiCall('GET', '/v1/social/channels');
      if (status !== 200) {
        return { content: [{ type: 'text', text: `Error (${status}): ${data?.detail ?? data?.error ?? JSON.stringify(data).slice(0, 300)}` }], isError: true };
      }
      const channels = (data?.channels ?? []) as Array<Record<string, unknown>>;
      if (channels.length === 0) {
        return { content: [{ type: 'text', text: 'No connected channels. Use social_connect to add one (the user must authorize via OAuth).' }] };
      }
      const list = channels.map((c) => `${c.id} — ${c.name} (${c.provider}${c.profile ? ` @${c.profile}` : ''})`).join('\n');
      return { content: [{ type: 'text', text: `Connected channels:\n${list}` }] };
    }

    case 'social_connect': {
      const provider = (args as any)?.provider;
      if (!provider) return { content: [{ type: 'text', text: 'provider is required' }], isError: true };
      const { status, data } = await apiCall('POST', '/v1/social/connect', { provider });
      if (status !== 200 || !data?.url) {
        return { content: [{ type: 'text', text: `Error (${status}): ${data?.detail ?? data?.error ?? JSON.stringify(data).slice(0, 300)}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Ask the user to open this URL to authorize ${provider} (an agent cannot OAuth for them):\n${data.url}\n\nAfter they authorize, call social_channels to get the channel id.` }] };
    }

    case 'social_publish': {
      const { status, data } = await apiCall('POST', '/v1/social/publish', args);
      if (status !== 200 || !data?.success || !(data?.post_ids?.length)) {
        return { content: [{ type: 'text', text: `Publish failed (${status}): ${data?.detail ?? data?.error ?? 'no post was created'}` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Published to ${data.post_ids.length} channel(s). Post ids: ${data.post_ids.join(', ')}` }] };
    }

    default: {
      // vNext skills (live-loaded from /v1/skills on startup) — dispatch
      // via POST /v1/skills/<slug>/run, return the run id so the caller
      // can poll. We deliberately don't block on completion here because
      // skill runs can take minutes; the agent polls instead.
      if (vnextBySlug[name]) {
        const { status, data } = await apiCall('POST', `/v1/skills/${encodeURIComponent(name)}/run`, args);
        if (status !== 202 && status !== 200) {
          return {
            content: [
              { type: 'text', text: `Error (${status}): ${data?.error?.message ?? data?.error ?? JSON.stringify(data).slice(0, 400)}` },
            ],
            isError: true,
          };
        }
        const runId = (data?.skill_run_id ?? data?.run_id) as string | undefined;
        const isComposed = Boolean(data?.skill_run_id);
        const pollPath = isComposed
          ? `/v1/skills/runs/${runId}`
          : `/v1/primitives/runs/${runId}`;
        return {
          content: [
            {
              type: 'text',
              text: [
                `Skill submitted: ${name}`,
                runId ? `Run id: ${runId}` : null,
                `Poll: GET ${pollPath}`,
              ].filter(Boolean).join('\n'),
            },
          ],
        };
      }

      // v2 generic dispatch — any tool registered from V2_GENERATORS
      // lands here. Submits via the declared rest path, polls until
      // done (when the generator returns a video) or returns the
      // character_id immediately for one-shot generators.
      const v2 = v2ByToolName[name];
      if (v2 && v2.rest) {
        const { status, data } = await apiCall(
          v2.rest.method,
          v2.rest.path,
          args,
        );
        if (status !== 201) {
          return {
            content: [
              {
                type: 'text',
                text: `Error (${status}): ${data.error?.message ?? JSON.stringify(data)}`,
              },
            ],
            isError: true,
          };
        }

        if (v2.output === 'video_url') {
          const result = await pollUntilDone(data.job_id);
          if (result.status === 'completed') {
            return {
              content: [
                {
                  type: 'text',
                  text: `Video generated successfully!\n\nJob ID: ${data.job_id}\nCredits: ${data.credits_deducted}\nVideo URL: ${result.video_url}`,
                },
              ],
            };
          }
          if (result.status === 'failed') {
            return {
              content: [
                {
                  type: 'text',
                  text: `Generation failed: ${result.error_message}`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: `Timed out polling job ${data.job_id} — check status later via get_video_status.`,
              },
            ],
          };
        }

        // character_id (or any non-video) generators: poll until the
        // job lands `completed` so we can return the surfaced
        // character_id from the status route.
        const final = await pollUntilDone(data.job_id);
        if (final.status === 'failed') {
          return {
            content: [
              {
                type: 'text',
                text: `Character creation failed: ${final.error_message}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text:
                `Character created!\n` +
                `Job ID: ${data.job_id}\n` +
                `Credits: ${data.credits_deducted}\n` +
                (final.character_id
                  ? `Character ID: ${final.character_id}\n`
                  : '') +
                `Use this character_id in any v2 tool (e.g. create_selfie).`,
            },
          ],
        };
      }
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  await loadVnextSkills();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('agent-media MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
