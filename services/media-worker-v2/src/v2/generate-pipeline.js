// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · Generic generate pipelines (the loose surface).
 *
 * Three functions, one provider call each, no recipe:
 *   processGenerateImage  prompt (+refs) → gpt-image-2 → R2 png
 *   processGenerateVideo  prompt (+refs) → Seedance → R2 mp4
 *   processGenerateAudio  text → ElevenLabs → R2 mp3
 *
 * They reuse the exact provider calls the fixed pipelines make
 * (crazy-look-pipeline.js, text-to-video-pipeline.js, tts.js) so a
 * clip rendered here is the same clip the fixed skill would have
 * rendered — only the prompt is the agent's own. No realism rubric is
 * injected, no polish pass, no persona brief: the agent asked for
 * exactly this, and gets exactly this.
 *
 * Model routing is data: api-v2 validated `model` against the live
 * catalog (@agentmedia/schema/v2 V2_MODELS) before dispatch; this file
 * maps that catalog id to the provider's id and nothing else.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateImageFromText, generateImageEdit } from '../openai-image-client.js';
import { runGeneration } from '../evolink-client.js';
import { r2Upload } from '../r2.js';
import { generateElevenLabsTTS } from '../elevenlabs-tts.js';
import { fetchToBuffer } from './http.js';

const R2_BUCKET = 'generation-outputs';
const VIDEO_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_QUALITY = '720p';

// Seedance model ids per catalog id and input shape. With reference
// images the reference-to-video variant is used (identity is kept);
// without, text-to-video. The 2.0 ids and 2.5-reference-to-video are the
// ones the fixed pipelines already run; seedance-2.5-text-to-video is
// the same naming pattern and is verified by a live run after deploy
// (see docs/models/seedance-2.5.md, "verified").
const SEEDANCE = {
  'seedance-2.0': { refs: 'seedance-2.0-reference-to-video', text: 'seedance-2.0-text-to-video' },
  'seedance-2.5': { refs: 'seedance-2.5-reference-to-video', text: 'seedance-2.5-text-to-video' },
};

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

/** Pick the provider model id for a video request. Exported for tests. */
export function resolveVideoModel(model, hasRefs) {
  const m = SEEDANCE[model ?? 'seedance-2.0'];
  if (!m) throw new Error(`generate_video: unknown model "${model}"`);
  if (process.env.SEEDANCE_V2_MODEL && hasRefs) return process.env.SEEDANCE_V2_MODEL;
  return hasRefs ? m.refs : m.text;
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
 * @param {string} [params.model]        catalog id (gpt-image-2)
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

  onProgress?.('rendering', { model: 'gpt-image-2', size, refs: refBuffers.length });
  const buf = refBuffers.length
    ? await generateImageEdit({ prompt, imageBuffers: refBuffers, size, quality: 'medium' })
    : await generateImageFromText({ prompt, size, quality: 'medium' });
  const key = `${user_id}/${job_id}/image.png`;
  const imageUrl = await r2Upload(R2_BUCKET, key, buf, 'image/png');
  console.log(`[v2:generate-image:${job_id}] → ${imageUrl}`);
  return { imageUrl, outputUrl: imageUrl };
}

/**
 * @param {object} params
 * @param {string} params.job_id
 * @param {string} params.user_id
 * @param {string} params.prompt
 * @param {string} [params.model]        catalog id (seedance-2.0 | seedance-2.5)
 * @param {string[]} [params.refs]       https reference images (portrait, sheet, product)
 * @param {number} [params.seconds]
 * @param {string} [params.aspect]       '9:16' | '1:1'
 * @param {boolean} [params.audio]
 * @param {number} [params.seed]
 * @returns {Promise<{ videoUrl: string, seed?: number, providerModel: string }>}
 */
export async function processGenerateVideo(params) {
  const { job_id, user_id } = requireJob(params, 'generate_video');
  const { prompt, model, refs = [], seconds = 5, aspect = '9:16', audio = true, seed, onProgress } = params;
  if (!prompt || !String(prompt).trim()) throw new Error('generate_video: prompt is required');

  const providerModel = resolveVideoModel(model, refs.length > 0);
  onProgress?.('rendering', { model: providerModel, seconds });
  console.log(`[v2:generate-video:${job_id}] ${providerModel} ${seconds}s ${aspect} refs=${refs.length}`);

  const providerUrl = await runGeneration(
    providerModel,
    {
      prompt: String(prompt).trim(),
      ...(refs.length ? { image_urls: refs } : {}),
      duration: seconds,
      aspect_ratio: aspect,
      generate_audio: audio !== false,
      quality: DEFAULT_QUALITY,
      ...(seed !== undefined ? { seed } : {}),
    },
    { timeoutMs: VIDEO_TIMEOUT_MS },
  );

  onProgress?.('storing');
  const buf = await fetchToBuffer(providerUrl);
  const key = `${user_id}/${job_id}/video.mp4`;
  const videoUrl = await r2Upload(R2_BUCKET, key, buf, 'video/mp4');
  console.log(`[v2:generate-video:${job_id}] → ${videoUrl}`);
  return { videoUrl, outputUrl: videoUrl, seed, providerModel };
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
    const out = join(workDir, 'speech.mp3');
    onProgress?.('rendering', { voice: voiceId });
    await generateElevenLabsTTS(text, voiceId, out, {}, tone ?? null, isCloned);
    const buf = await readFile(out);
    const key = `${user_id}/${job_id}/audio.mp3`;
    const audioUrl = await r2Upload(R2_BUCKET, key, buf, 'audio/mpeg');
    console.log(`[v2:generate-audio:${job_id}] → ${audioUrl}`);
    return { audioUrl, outputUrl: audioUrl };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
