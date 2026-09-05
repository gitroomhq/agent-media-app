// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Tool definitions for the hosted MCP connector — the shared read tools and
 * the loose surface (generate_video / generate_image / generate_audio /
 * quote). Kept apart from routes/mcp.ts so the public skill pack generator
 * can render the SAME objects: what tools/list says and what the docs say
 * are one source.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GenerateAudioSchema,
  GenerateImageSchema,
  GenerateVideoSchema,
  V2_DEFAULT_MODEL,
  liveModelIds,
} from '@agentmedia/schema/v2';

export function readOnlyAnnotations(title: string) {
  return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
}
export function generationAnnotations(title: string) {
  return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
}

/**
 * Appended to every tool that takes an image. Without it an agent holding a
 * user's photo has one obvious move — inline the base64 into these arguments
 * — and the client then renders that multi-megabyte string in the chat, once
 * per attempt. upload_image makes the bytes cross the wire a single time.
 */
export const IMAGE_URL_HINT =
  '\n\nIMAGES: pass an https URL. If you only have raw bytes or a data: URL, call `upload_image` FIRST and pass the URL it returns. Never paste base64 into these arguments — the client prints tool arguments in the conversation, so a base64 image becomes a wall of text for the user and is re-sent on every retry.';

// Read-only tool (no generation, no credits): list the user's saved
// characters with their reuse URLs. Forwards to GET /v1/characters.
export const listCharactersTool = {
  name: 'list_characters',
  description:
    "List the authenticated user's saved, reusable characters. Each has a character_id (char_…) and a character_sheet_url — pass the character_sheet_url (and/or portrait URL) in `refs` of generate_video / generate_image to reuse that exact identity, or EITHER to make_ugc's `character` prop on the fixed surface. Plus a portrait/thumbnail URL for display.",
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max characters to return (default 50).' },
    },
    additionalProperties: false,
  },
  annotations: readOnlyAnnotations('List Characters'),
};

/**
 * Read-only status tool. Its absence was the single worst hole in this
 * connector: every generation tool returned "poll GET /v1/... for status"
 * to an agent that had NO tool able to make that call, so a Claude session
 * submitted a job and then went permanently blind — it could not tell
 * success from failure, and could not hand the user a video URL. (Observed
 * across a full external agent session, 2026.)
 *
 * One tool covers all three id shapes because an agent cannot be expected
 * to know which pipeline its skill ran on: composed skill runs, primitive
 * runs, and v2 generator jobs are probed in turn.
 */
export const getRunStatusTool = {
  name: 'get_run_status',
  description:
    'Check a generation you already submitted, and get its output URL (video, image or audio) when it is done. Pass the id ANY agent-media tool returned (run id, skill run id, or job id) — this resolves all of them. Set wait:true to block until the job reaches a terminal state (up to ~45 seconds per call; if it is still running, just call again — a video usually needs several such calls). ALWAYS call this after submitting: without it you cannot tell whether the video succeeded, and cannot give the user a link.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'The run_id / skill_run_id / job_id returned when you submitted.' },
      wait: { type: 'boolean', description: 'Block until the run finishes or ~2 minutes elapse (default false).' },
    },
    required: ['run_id'],
    additionalProperties: false,
  },
  annotations: readOnlyAnnotations('Get Run Status'),
};

/**
 * Bytes in, URL out. The one tool that stops an agent from pasting a
 * base64 image into a generation call — and therefore into the user's
 * chat transcript, where a real session dumped a megabyte of it as raw
 * text and then re-sent the whole thing on every retry.
 *
 * Not read-only (it writes an object to storage) but it spends no credits
 * and starts no job, so it is safe to call speculatively.
 */
export const uploadImageTool = {
  name: 'upload_image',
  description:
    'Store an image and get back a stable https URL you can pass to any agent-media tool. Costs NO credits. Use this whenever you hold image bytes (a photo the user attached, a data: URL, a generated image): call upload_image ONCE, then pass the returned URL everywhere. Do NOT paste base64 into other tool arguments or into the conversation — the client displays tool arguments to the user, so a base64 image becomes a wall of unreadable text, and every retry re-sends it. You may also pass image_url to re-host an image that lives on someone else\u2019s domain. PNG or JPEG, 10 MB max.',
  inputSchema: {
    type: 'object',
    properties: {
      image_base64: {
        type: 'string',
        description: 'The image bytes, base64-encoded. A `data:image/png;base64,...` prefix is accepted and stripped.',
      },
      image_url: {
        type: 'string',
        description: 'An https URL to fetch and re-host instead. Use this OR image_base64, not both.',
      },
    },
    additionalProperties: false,
  },
  annotations: {
    title: 'Upload Image',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

/**
 * The model catalog, for choosing. An agent that cannot read cost, limits
 * and best-for picks the premium model for everything; this is the menu
 * with the prices on it. Read-only, no credits.
 */
export const listModelsTool = {
  name: 'list_models',
  description:
    'List the generation models agent-media can use, with what each costs the user (credits per second), its limits, what it is good and bad at, and how to select it. Read this BEFORE choosing a model for generate_video / generate_image / generate_audio: the default seedance-2.0 is right for most jobs; seedance-2.5 is about 3x the credits and only worth it for a hero clip. Pass the id as `model`. Costs NO credits. Set include_candidates:true to also see planned models that cannot be selected yet.',
  inputSchema: {
    type: 'object',
    properties: {
      include_candidates: { type: 'boolean', description: 'Also return planned models (no price, not selectable). Default false.' },
    },
    additionalProperties: false,
  },
  annotations: readOnlyAnnotations('List Models'),
};

/**
 * The loose surface. Three primitives that say what they are: the agent
 * writes the prompt, picks the model (or takes the catalog default), and
 * passes reference images by URL. No recipe, no persona brief, no
 * rubric — the fixed skills exist on REST for the dashboard; here the
 * agent is the director. `quote` prices a call without running it.
 */
export function looseSchema(schema: unknown, name: string) {
  const js = zodToJsonSchema(schema as any, { name, $refStrategy: 'none' });
  return (js as any).definitions?.[name] ?? js;
}
const liveVideo = liveModelIds('video').join(', ');
const liveImage = liveModelIds('image').join(', ');
const liveAudio = liveModelIds('audio').join(', ');

export const generateVideoTool = {
  name: 'generate_video',
  description:
    `Render a video clip from YOUR prompt on the model YOU choose. Write the shot like a director: who is in frame, where, what happens, camera, and the exact spoken words in quotes if anyone talks. Pass reference images (a portrait, a character sheet from list_characters, a product photo) as https URLs in \`refs\` and the model keeps that identity/look. Models: ${liveVideo} (default ${V2_DEFAULT_MODEL.video}; call list_models for what each is good for and the price per second — seedance-2.5 is ~3x the credits and only worth it for a hero clip). Spends credits (seconds x the model's per-second rate; call \`quote\` first if the user cares about cost). Returns a job id — then call get_run_status until it is done and hand the user the URL.` +
    IMAGE_URL_HINT,
  inputSchema: looseSchema(GenerateVideoSchema, 'generate_video_input'),
  annotations: generationAnnotations('Generate Video'),
};
export const generateImageTool = {
  name: 'generate_image',
  description:
    `Render one image from YOUR prompt. Without refs it paints from the prompt; with refs (https URLs) it edits/composes from them — a portrait to re-light, a product to place in a hand, a character sheet to pose. Use it to build the reference a video needs (portrait first, then generate_video with that URL in refs). Models: ${liveImage} (default ${V2_DEFAULT_MODEL.image}). Spends credits per image (see list_models). Returns a job id — poll get_run_status for the image URL.` +
    IMAGE_URL_HINT,
  inputSchema: looseSchema(GenerateImageSchema, 'generate_image_input'),
  annotations: generationAnnotations('Generate Image'),
};
export const generateAudioTool = {
  name: 'generate_audio',
  description:
    `Speak text in a named voice (jessica, sarah, liam, chris, lily, bill, matilda — or a raw ElevenLabs voice id). Emotion tags like [excited] or [whispers] are honoured. For a talking-head clip you usually do NOT need this: generate_video renders native speech when the words are in the prompt. Use it for voiceover over b-roll or a standalone audio file. Models: ${liveAudio}. Spends 1 credit per 100 characters. Returns a job id — poll get_run_status for the mp3 URL.`,
  inputSchema: looseSchema(GenerateAudioSchema, 'generate_audio_input'),
  annotations: generationAnnotations('Generate Audio'),
};
export const quoteTool = {
  name: 'quote',
  description:
    'Price a generate_image / generate_video / generate_audio call WITHOUT running it. Pass the same `input` you would pass to the tool. Returns credits (1 credit = $0.01), the model that would run, and the breakdown. Costs nothing. Use it before spending when the user asked about cost, when choosing between models, or before a clip longer than a few seconds.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['image', 'video', 'audio'] },
      input: { type: 'object', description: 'The exact arguments you would pass to generate_<kind>.' },
    },
    required: ['kind', 'input'],
    additionalProperties: false,
  },
  annotations: readOnlyAnnotations('Quote'),
};

/** tools/list on the loose surface, in the order the connector lists them. */
export const LOOSE_SURFACE_TOOLS = [
  generateVideoTool,
  generateImageTool,
  generateAudioTool,
  quoteTool,
  listCharactersTool,
  getRunStatusTool,
  uploadImageTool,
  listModelsTool,
];
