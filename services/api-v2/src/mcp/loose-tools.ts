// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Tool definitions for the hosted MCP connector, the shared read tools and
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
  V2_MODELS,
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
 * user's photo has one obvious move, inline the base64 into these arguments
 *, and the client then renders that multi-megabyte string in the chat, once
 * per attempt. upload_image makes the bytes cross the wire a single time.
 */
export const IMAGE_URL_HINT =
  '\n\nIMAGES: pass an https URL. If you only have raw bytes or a data: URL, call `upload_image` FIRST and pass the URL it returns. Never paste base64 into these arguments, the client prints tool arguments in the conversation, so a base64 image becomes a wall of text for the user and is re-sent on every retry.';

// Read-only tool (no generation, no credits): list the user's saved
// characters with their reuse URLs. Forwards to GET /v1/characters.
export const listCharactersTool = {
  name: 'list_characters',
  description:
    "List the authenticated user's saved, reusable characters. Each has a character_id (char_…) and a character_sheet_url, pass the character_sheet_url (and/or portrait URL) in `refs` of generate_video / generate_image to reuse that exact identity, or EITHER to make_ugc's `character` prop on the fixed surface. Plus a portrait/thumbnail URL for display.",
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
 * submitted a job and then went permanently blind, it could not tell
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
    'Check a generation you already submitted, and get its output URL (video, image or audio) when it is done. Pass the id ANY agent-media tool returned (run id, skill run id, or job id), this resolves all of them. Set wait:true to block until the job reaches a terminal state (up to ~45 seconds per call; if it is still running, just call again: seedance-2.0 needs about 3 minutes for a 5 s clip, seedance-2.5 12 to 25 minutes, so keep calling until it is done). ALWAYS call this after submitting: without it you cannot tell whether the video succeeded, and cannot give the user a link.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'The run_id / skill_run_id / job_id returned when you submitted.' },
      wait: { type: 'boolean', description: 'Block until the run finishes or ~45 seconds elapse (default false). A video needs several such calls; just call again.' },
    },
    required: ['run_id'],
    additionalProperties: false,
  },
  annotations: readOnlyAnnotations('Get Run Status'),
};

/**
 * Bytes in, URL out. The one tool that stops an agent from pasting a
 * base64 image into a generation call, and therefore into the user's
 * chat transcript, where a real session dumped a megabyte of it as raw
 * text and then re-sent the whole thing on every retry.
 *
 * Not read-only (it writes an object to storage) but it spends no credits
 * and starts no job, so it is safe to call speculatively.
 */
export const uploadImageTool = {
  name: 'upload_image',
  description:
    'Store an image and get back a stable https URL you can pass to any agent-media tool. Costs NO credits. THREE ways in, in this order:\n' +
    '1. FILE ON DISK (best, and the only one that keeps full resolution): call upload_image with `file_bytes` set to the exact byte size of the file (`wc -c < photo.png`) and `file_name`. You get back a `put_url`; run the printed curl to stream the file straight to storage, then call upload_image again with the `upload_key` you were given to get the URL. The bytes never pass through this conversation, so there is NO reason to resize, crop or re-encode the user\u2019s photo first. Do not: a downscaled product photo is what the video model will show. Up to 25 MB.\n' +
    '2. A URL you already have: pass `image_url` to re-host it.\n' +
    '3. Raw bytes with no shell available: pass `image_base64` (PNG or JPEG, 10 MB max after decoding). Only when 1 and 2 are impossible, and even then upload the original, never a shrunken copy.\n' +
    'Then pass the returned URL everywhere. Do NOT paste base64 into other tool arguments or into the conversation: the client displays tool arguments to the user, so a base64 image becomes a wall of unreadable text, and every retry re-sends it.',
  inputSchema: {
    type: 'object',
    properties: {
      file_bytes: {
        type: 'integer',
        description: 'Step 1 of the file path: the exact size of the file in bytes (`wc -c < photo.png`). Returns a put_url and an upload_key. Full resolution, up to 25 MB.',
      },
      file_name: {
        type: 'string',
        description: 'Optional with file_bytes: the file name, so the content type is right (.png or .jpg).',
      },
      upload_key: {
        type: 'string',
        description: 'Step 2 of the file path: the upload_key you were given, after the curl PUT finished. Returns the image_url.',
      },
      image_base64: {
        type: 'string',
        description: 'The image bytes, base64-encoded. A `data:image/png;base64,...` prefix is accepted and stripped. Last resort: use file_bytes when you can run a shell.',
      },
      image_url: {
        type: 'string',
        description: 'An https URL to fetch and re-host instead.',
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
    `List the generation models agent-media can use: for each, its MODES (video: text, image-to-video via first_frame, reference via refs / video_refs / audio_refs) with the exact inputs, limits, aspects, qualities and credits per second of every mode, a "pick when" line, prompting tips, expected latency, how to select it, plus \`recent\`: the last 30 days of real runs per model (fail rate, auto-judge score, user ratings, median render time). Read this BEFORE choosing a model or a mode for generate_video / generate_image / generate_audio: the default ${V2_DEFAULT_MODEL.video} is right for most jobs. Pass the id as \`model\`, or \`model:"auto"\` and the printed policy picks from the stats. Costs NO credits. Set include_candidates:true to also see planned models that cannot be selected yet.`,
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
 * rubric, the fixed skills exist on REST for the dashboard; here the
 * agent is the director. `quote` prices a call without running it.
 */
export function looseSchema(schema: unknown, name: string) {
  const js = zodToJsonSchema(schema as any, { name, $refStrategy: 'none' });
  return (js as any).definitions?.[name] ?? js;
}
const liveVideo = liveModelIds('video').join(', ');
const liveImage = liveModelIds('image').join(', ');
const liveAudio = liveModelIds('audio').join(', ');
const audioRate = (() => {
  const m = V2_MODELS[V2_DEFAULT_MODEL.audio];
  return m?.credits ? `${m.credits.perUnit * 100} credit per 100 characters` : 'per character';
})();
const videoPriceLine = (() => {
  const m = V2_MODELS[V2_DEFAULT_MODEL.video];
  const c = m?.video?.creditsPerSecond;
  return c ? `${V2_DEFAULT_MODEL.video}: ${Object.entries(c).map(([q, n]) => `${n} credits/s at ${q}`).join(', ')}` : '';
})();

export const generateVideoTool = {
  name: 'generate_video',
  description:
    `Render a video clip from YOUR prompt on the model YOU choose, in one of three MODES that follow from the fields you pass: TEXT (prompt only), IMAGE-TO-VIDEO (\`first_frame\`: an https still that becomes frame one, optionally \`last_frame\` to end on; the clip animates the still) or REFERENCE (\`refs\`: https images such as a portrait, a character sheet from list_characters or a product photo whose identity/look is kept; \`video_refs\`: clips whose motion or framing is followed; \`audio_refs\`: a voice or sound to carry; address them in the prompt as @image1, @video1, @audio1). Frames and refs cannot be mixed. Write the shot like a director: who is in frame, where, what happens, camera, and the exact spoken words in quotes if anyone talks. Models: ${liveVideo} (default ${V2_DEFAULT_MODEL.video}; call list_models for each model's modes, limits, prices and recent results; or pass model:"auto"). Aspect: 9:16 default, also 16:9, 1:1, 4:3, 3:4, 21:9, adaptive. Quality: 480p, 720p (default), 1080p; the price per second follows the quality (${videoPriceLine}). Reference clip seconds are billed like output seconds. Call \`quote\` first if the user cares about cost. Returns a job id, then call get_run_status until it is done and hand the user the URL.` +
    IMAGE_URL_HINT,
  inputSchema: looseSchema(GenerateVideoSchema, 'generate_video_input'),
  annotations: generationAnnotations('Generate Video'),
};
export const generateImageTool = {
  name: 'generate_image',
  description:
    `Render one image from YOUR prompt. Without refs it paints from the prompt; with refs (https URLs) it edits/composes from them, a portrait to re-light, a product to place in a hand, a character sheet to pose. Use it to build the reference a video needs (portrait first, then generate_video with that URL in refs). Models: ${liveImage} (default ${V2_DEFAULT_MODEL.image}). Spends credits per image (see list_models). Returns a job id, poll get_run_status for the image URL.` +
    IMAGE_URL_HINT,
  inputSchema: looseSchema(GenerateImageSchema, 'generate_image_input'),
  annotations: generationAnnotations('Generate Image'),
};
export const generateAudioTool = {
  name: 'generate_audio',
  description:
    `Speak text in a named voice (jessica, sarah, liam, chris, lily, bill, matilda, or a raw ElevenLabs voice id). Emotion tags like [excited] or [whispers] are honoured. For a talking-head clip you usually do NOT need this: generate_video renders native speech when the words are in the prompt. Use it for voiceover over b-roll or a standalone audio file. Models: ${liveAudio}. Spends ${audioRate}, rounded up. Returns a job id, poll get_run_status for the mp3 URL. The mp3 URL can be passed as an audio_ref to generate_video.`,
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

/**
 * The human half of the quality loop. Every loose-surface job is scored by
 * an auto-judge; this lets the agent (or the user through it) record what
 * it actually thought, which feeds model_stats, list_models and model:"auto".
 */
export const rateRunTool = {
  name: 'rate_run',
  description:
    'Rate a finished generate_video / generate_image / generate_audio run 1 to 5, with an optional note (what was wrong or right). Costs nothing. Do this when the user reacts to an output, "perfect", "her face changed", "too slow", or when you can see a defect yourself. Ratings feed the per-model stats in list_models and the model:"auto" choice, so an honest 2 helps more than a polite 4.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'The job id the generate tool returned.' },
      score: { type: 'integer', minimum: 1, maximum: 5, description: '1 = unusable, 3 = usable with edits, 5 = shipped as-is.' },
      note: { type: 'string', maxLength: 1000, description: 'One line on why (optional).' },
    },
    required: ['run_id', 'score'],
    additionalProperties: false,
  },
  annotations: { title: 'Rate Run', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
  rateRunTool,
];
