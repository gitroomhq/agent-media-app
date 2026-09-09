// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Generic generate pipelines (the loose surface).
 *
 * Three functions, one provider call each, no recipe:
 *   processGenerateImage  prompt (+refs) → gpt-image-2 → R2 png
 *   processGenerateVideo  prompt (+frames | +refs) → Seedance → R2 mp4
 *   processGenerateAudio  text → ElevenLabs → R2 mp3
 *
 * No realism rubric is injected, no polish pass, no persona brief: the
 * agent asked for exactly this, and gets exactly this.
 *
 * VIDEO ROUTING IS DATA FROM THE PROVIDER SPECS. api-v2 validated the
 * request against the catalog (@agentmedia/schema/v2 V2_MODELS) and sent
 * the resolved cell: `provider_model` and `mode` (text | image |
 * reference). This file turns that into the exact request body the
 * EvoLink spec for that provider model id defines:
 *
 *   text       {prompt, duration, aspect_ratio, quality, generate_audio}
 *   image      + image_urls: [first_frame, last_frame?]           (1 to 2)
 *   reference  + image_urls / video_urls / audio_urls  (omitted when empty:
 *                the 2.5 spec has minItems 1, an empty array is a 400)
 *
 * Never sent: `seed` (no Seedance spec has it), `content_filter` (false
 * bills +10%), `model_params.web_search` (per-search fee). A mode the
 * catalog does not list for the model is refused here too, so an
 * unexpected envelope never reaches the provider.
 *
 * After the render the EvoLink task's `usage` (what the provider billed)
 * is returned to server-routes, which records it on the job and in
 * generation_quality: the price list is checked against real bills.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateImageFromText, generateImageEdit } from '../openai-image-client.js';
import { resolveImageModel } from '../image-models.js';
import { runGenerationDetailed } from '../evolink-client.js';
import { r2Upload } from '../r2.js';
import { generateElevenLabsTTS } from '../elevenlabs-tts.js';
import { fetchToBuffer } from './http.js';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const R2_BUCKET = 'generation-outputs';
const DEFAULT_VIDEO_TIMEOUT_MIN = 30;
const DEFAULT_QUALITY = '720p';

/**
 * Provider model id per (catalog model, mode). Mirrors V2_MODELS[id].video.modes
 * in @agentmedia/schema/v2 (the source of truth, from the EvoLink specs);
 * kept here so the worker can refuse an envelope that names a cell it
 * does not know. A test asserts the two tables agree.
 */
export const SEEDANCE_MODES = {
  'seedance-2.0': {
    text: 'seedance-2.0-text-to-video',
    image: 'seedance-2.0-image-to-video',
    reference: 'seedance-2.0-reference-to-video',
  },
  'seedance-2.5': {
    text: 'seedance-2.5-text-to-video',
    image: 'seedance-2.5-image-to-video',
    reference: 'seedance-2.5-reference-to-video',
  },
};

const VIDEO_TIMEOUT_MIN = { 'seedance-2.0': 30, 'seedance-2.5': 90 };

// Friendly voice names → ElevenLabs pre-made ids. Mirrors V2_VOICES in
// @agentmedia/schema/v2 (generate.ts); a raw id passes through.
const VOICES = {
  jessica: 'cgSgspJ2msm6clMCkdW9',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  chris: 'iP95p4xoKVk53GoZ742B',
  lily: 'pFZP5JQG7iQjIQuC4Bku',
  bill: 'pqHfZKP75CvOlQylNhV4',
  matilda: 'XrExE9yKIg1WjnnlVkGX',
};

function requireJob(params, name) {
  const { job_id, user_id } = params ?? {};
  if (!job_id || !user_id) throw new Error(`${name}: job_id and user_id are required`);
  return { job_id, user_id };
}

/** Which mode a video request is: the same rule as deriveVideoMode() in the schema. */
export function deriveVideoMode(p) {
  if (p.first_frame) return 'image';
  if (p.refs?.length || p.video_refs?.length || p.audio_refs?.length) return 'reference';
  return 'text';
}

/**
 * Pick the provider model id for a video request. Exported for tests.
 * @param {string} [model]  catalog id (default seedance-2.0)
 * @param {'text'|'image'|'reference'} mode
 */
export function resolveVideoModel(model, mode) {
  const m = SEEDANCE_MODES[model ?? 'seedance-2.0'];
  if (!m) throw new Error(`generate_video: unknown model "${model}"`);
  const id = m[mode];
  if (!id) throw new Error(`generate_video: ${model} has no ${mode} mode`);
  return id;
}

/**
 * The exact EvoLink request body for one resolved video request.
 * Pure. Exported for tests: every field here is a field in the spec of
 * the provider model id it targets.
 */
export function buildVideoBody(p) {
  const mode = p.mode ?? deriveVideoMode(p);
  const body = {
    prompt: String(p.prompt ?? '').trim(),
    duration: Number(p.seconds ?? 5),
    aspect_ratio: p.aspect ?? (mode === 'image' ? 'adaptive' : '9:16'),
    quality: p.quality ?? DEFAULT_QUALITY,
    generate_audio: p.audio !== false,
  };
  if (mode === 'image') {
    body.image_urls = [p.first_frame, ...(p.last_frame ? [p.last_frame] : [])];
  } else if (mode === 'reference') {
    if (p.refs?.length) body.image_urls = [...p.refs];
    if (p.video_refs?.length) body.video_urls = [...p.video_refs];
    if (p.audio_refs?.length) body.audio_urls = [...p.audio_refs];
  }
  return body;
}

/**
 * Every reference image must actually decode before we spend a provider
 * render on it.
 *
 * A corrupt or truncated image is not a provider problem, but it looks like
 * one: EvoLink accepts the job, runs for a minute or four, then fails with
 * "Invalid parameters" or "Image processing failed", which names nothing
 * the agent can act on. Measured on a real customer session: three of four
 * uploaded product photos were broken mid-stream, and those three failed
 * every single render (11 jobs) while the one intact photo succeeded.
 *
 * So we decode them ourselves first: one fetch plus a 64px decode per
 * image, a few hundred milliseconds, and the job fails at submit with a
 * sentence that says which URL is broken and what to do.
 *
 * Exported for tests.
 */
export async function assertRefsDecodable(urls, fetcher = fetchToBuffer) {
  const broken = [];
  for (const url of urls) {
    try {
      const buf = await fetcher(url);
      await sharp(buf).resize(64, 64, { fit: 'inside' }).raw().toBuffer();
    } catch (err) {
      broken.push(`${url} (${err?.message ?? err})`);
    }
  }
  if (broken.length) {
    const e = new Error(
      `reference image is corrupt or unreadable, so the render was not started: ${broken.join('; ')}. ` +
        'Re-upload the ORIGINAL file with upload_image (file_bytes), which streams it whole; a truncated base64 upload produces exactly this.',
    );
    e.code = 'INVALID_REFERENCE_IMAGE';
    throw e;
  }
}

/** Friendly voice name or raw id → ElevenLabs voice id. Exported for tests. */
export function resolveVoice(voice) {
  if (!voice) return VOICES.sarah;
  return VOICES[String(voice).toLowerCase()] ?? voice;
}

/**
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} params.prompt
 * @param {string} [params.model]        catalog id (gpt-image-2.5 | gpt-image-2.5-flare | gpt-image-2)
 * @param {string[]} [params.refs]       https reference images
 * @param {string} [params.size]         '1024x1536' | '1024x1024' | '1536x1024'
 * @param {(stage: string, meta?: object) => void} [params.onProgress]
 * @returns {Promise<{ imageUrl: string, outputUrl: string }>}
 */
export async function processGenerateImage(params) {
  const { job_id, user_id } = requireJob(params, 'generate_image');
  const { prompt, refs = [], size = '1024x1536', onProgress } = params;
  if (!prompt || !String(prompt).trim()) throw new Error('generate_image: prompt is required');

  const refBuffers = [];
  if (refs.length) {
    onProgress?.('fetching_refs', { count: refs.length });
    for (const url of refs) refBuffers.push(await fetchToBuffer(url));
  }

  // The agent picked a catalog id (api-v2 validated it); this is the only
  // place that turns it into a provider id and the quality tier it is
  // priced at.
  const { providerModel, quality } = resolveImageModel(params.model);
  onProgress?.('rendering', { model: providerModel, size, refs: refBuffers.length });
  const buf = refBuffers.length
    ? await generateImageEdit({ prompt, imageBuffers: refBuffers, size, quality, model: providerModel })
    : await generateImageFromText({ prompt, size, quality, model: providerModel });
  const key = `${user_id}/${job_id}/image.png`;
  const imageUrl = await r2Upload(R2_BUCKET, key, buf, 'image/png');
  console.log(`[v2:generate-image:${job_id}] → ${imageUrl}`);
  return { imageUrl, outputUrl: imageUrl, providerModel };
}

/**
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} params.prompt
 * @param {string} [params.model]           catalog id (seedance-2.0 | seedance-2.5)
 * @param {'text'|'image'|'reference'} [params.mode]  resolved by api-v2; derived here when absent
 * @param {string} [params.provider_model]  resolved by api-v2; must match the catalog cell
 * @param {string} [params.first_frame]     image mode
 * @param {string} [params.last_frame]      image mode
 * @param {string[]} [params.refs]          reference mode: images
 * @param {string[]} [params.video_refs]    reference mode: clips
 * @param {string[]} [params.audio_refs]    reference mode: audio
 * @param {number} [params.seconds]
 * @param {string} [params.aspect]
 * @param {string} [params.quality]         '480p' | '720p' | '1080p'
 * @param {boolean} [params.audio]
 * @param {number} [params.timeout_minutes]
 * @returns {Promise<{ videoUrl: string, outputUrl: string, providerModel: string, mode: string, providerUsage: object|null }>}
 */
export async function processGenerateVideo(params) {
  const { job_id, user_id } = requireJob(params, 'generate_video');
  const { prompt, model = 'seedance-2.0', onProgress } = params;
  if (!prompt || !String(prompt).trim()) throw new Error('generate_video: prompt is required');

  const mode = params.mode ?? deriveVideoMode(params);
  const providerModel = resolveVideoModel(model, mode);
  if (params.provider_model && params.provider_model !== providerModel) {
    throw new Error(`generate_video: envelope names ${params.provider_model} but ${model} ${mode} mode is ${providerModel}`);
  }
  const body = buildVideoBody({ ...params, mode });
  // Cheap, and it turns a four-minute provider failure into an instant,
  // actionable error.
  const imageRefs = [...(body.image_urls ?? [])];
  if (imageRefs.length) {
    onProgress?.('checking_refs', { count: imageRefs.length });
    await assertRefsDecodable(imageRefs);
  }
  const timeoutMs = (params.timeout_minutes ?? VIDEO_TIMEOUT_MIN[model] ?? DEFAULT_VIDEO_TIMEOUT_MIN) * 60_000;

  onProgress?.('rendering', { model: providerModel, mode, seconds: body.duration, quality: body.quality });
  console.log(`[v2:generate-video:${job_id}] ${providerModel} ${mode} ${body.duration}s ${body.aspect_ratio} ${body.quality} images=${body.image_urls?.length ?? 0} videos=${body.video_urls?.length ?? 0} audios=${body.audio_urls?.length ?? 0}`);

  const { url: providerUrl, task } = await runGenerationDetailed(providerModel, body, { timeoutMs, endpoint: 'videos' });
  const providerUsage = summarizeUsage(task);
  if (providerUsage) console.log(`[v2:generate-video:${job_id}] provider usage ${JSON.stringify(providerUsage)}`);

  onProgress?.('storing');
  const buf = await fetchToBuffer(providerUrl);
  const key = `${user_id}/${job_id}/video.mp4`;
  const videoUrl = await r2Upload(R2_BUCKET, key, buf, 'video/mp4');
  console.log(`[v2:generate-video:${job_id}] → ${videoUrl}`);
  return { videoUrl, outputUrl: videoUrl, providerModel, mode, providerUsage };
}

/**
 * The billing facts of a finished EvoLink task, as observed on real
 * responses (usage.cost.usd, usage.credits_used, task_info.video_duration).
 * Null when the task carries none. Exported for tests.
 */
export function summarizeUsage(task) {
  if (!task || typeof task !== 'object') return null;
  const usage = task.usage ?? {};
  const cost = usage.cost?.usd ?? usage.cost_usd ?? null;
  const out = {
    task_id: task.id ?? null,
    cost_usd: cost !== null && Number.isFinite(Number(cost)) ? Number(cost) : null,
    credits_used: usage.credits_used ?? usage.credits ?? null,
    billing_rule: usage.billing_rule ?? null,
    video_duration: task.task_info?.video_duration ?? null,
  };
  return out.cost_usd === null && out.credits_used === null ? null : out;
}

/**
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} params.text
 * @param {string} [params.voice]        friendly name or ElevenLabs id
 * @param {string} [params.tone]
 * @returns {Promise<{ audioUrl: string }>}
 */
export async function processGenerateAudio(params) {
  const { job_id, user_id } = requireJob(params, 'generate_audio');
  const { text, voice, tone, onProgress } = params;
  if (!text || !String(text).trim()) throw new Error('generate_audio: text is required');

  const voiceId = resolveVoice(voice);
  const isCloned = !Object.values(VOICES).includes(voiceId);
  const workDir = await mkdtemp(join(tmpdir(), `gen-audio-${job_id}-`));
  try {
    // generateElevenLabsTTS writes a WAV (it derives its temp mp3 name from a
    // .wav outputPath; anything else makes ffmpeg read and write the same
    // file; that was the first live failure, job f927dcad). Deliver mp3.
    const wav = join(workDir, 'speech.wav');
    const mp3 = join(workDir, 'speech.mp3');
    onProgress?.('rendering', { voice: voiceId });
    await generateElevenLabsTTS(text, voiceId, wav, {}, tone ?? null, isCloned);
    await execFileAsync('ffmpeg', ['-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3]);
    const buf = await readFile(mp3);
    const key = `${user_id}/${job_id}/audio.mp3`;
    const audioUrl = await r2Upload(R2_BUCKET, key, buf, 'audio/mpeg');
    console.log(`[v2:generate-audio:${job_id}] → ${audioUrl}`);
    return { audioUrl, outputUrl: audioUrl, providerModel: 'eleven_multilingual_v2' };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Duration in seconds of a remote media file, via ffprobe reading the URL
 * (only the container headers are fetched). Null when it cannot be read.
 * Used by /v2/probe so api-v2 can bill reference clips at submit.
 */
export async function probeDuration(url) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url], { timeout: 20_000 });
    const d = Number(String(stdout).trim());
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}
