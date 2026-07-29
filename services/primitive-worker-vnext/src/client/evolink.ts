// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * EvoLink client — Seedance 2.0 (and other models) via EvoLink proxy.
 * TS port of media-worker-v2/evolink-client.js (minimal surface).
 */

import { withEvolinkSlot } from './evolink-pool.js';

const BASE_URL = 'https://api.evolink.ai/v1';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
// Evolink task-creation is flaky under load: a 500 "internal_error / Failed to
// create video generation task" is usually a transient upstream (BytePlus) hiccup
// or brief concurrency pressure, and a 429 is a rate limit. Retry those a few
// times WITH BACKOFF inside submit — so a blip self-heals in seconds instead of
// failing the render (or forcing Temporal to re-run the whole credit-charged
// activity). Genuine 4xx (bad input / auth / moderation) still throw immediately.
const SUBMIT_RETRY_BACKOFF_MS = [1_500, 4_000, 10_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EvolinkVideoParams {
  prompt: string;
  imageUrls: string[];
  duration: 5 | 10 | 15;
  aspectRatio: '9:16' | '1:1' | '16:9';
  generateAudio: boolean;
  /** Reference audio tracks (Seedance 2.0). Up to 3; reference as @audio1.. in the prompt. */
  audioUrls?: string[];
  /** Reference video tracks (Seedance 2.0). Up to 3, total <=15s; reference as @video1.. in the prompt. Used for seamless continuation/extend. */
  videoUrls?: string[];
  quality?: '480p' | '720p' | '1080p';
  seed?: number;
}

export async function submitEvolinkVideo(
  apiKey: string,
  model: string,
  params: EvolinkVideoParams,
): Promise<{ id: string }> {
  const body = {
    model,
    prompt: params.prompt,
    image_urls: params.imageUrls,
    duration: params.duration,
    aspect_ratio: params.aspectRatio,
    generate_audio: params.generateAudio,
    quality: params.quality ?? '720p',
    ...(params.audioUrls && params.audioUrls.length > 0 ? { audio_urls: params.audioUrls } : {}),
    ...(params.videoUrls && params.videoUrls.length > 0 ? { video_urls: params.videoUrls } : {}),
    ...(params.seed != null ? { seed: params.seed } : {}),
  };
  for (let attempt = 0; ; attempt += 1) {
    const resp = await fetch(`${BASE_URL}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const json = (await resp.json()) as { id?: string };
      if (!json.id) throw new Error('evolink submit returned no task id');
      return { id: json.id };
    }
    const text = await resp.text().catch(() => '');
    const status = resp.status;
    // Transient (5xx internal_error / upstream hiccup, or 429 rate limit): back
    // off and retry a few times before surfacing the failure.
    const transient = status >= 500 || status === 429;
    if (transient && attempt < SUBMIT_RETRY_BACKOFF_MS.length) {
      await sleep(SUBMIT_RETRY_BACKOFF_MS[attempt]);
      continue;
    }
    const err = new Error(`evolink submit ${status}: ${text.slice(0, 400)}`);
    (err as any).status = status;
    throw err;
  }
}

export async function pollEvolinkTask(
  apiKey: string,
  taskId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> | null = null;
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      if (resp.status >= 500) {
        await sleep(pollMs);
        continue;
      }
      const text = await resp.text().catch(() => '');
      throw new Error(`evolink poll ${resp.status}: ${text.slice(0, 400)}`);
    }
    const task = (await resp.json()) as Record<string, unknown>;
    last = task;
    const status = String(task.status ?? '').toLowerCase();
    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      return task;
    }
    if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'error') {
      const message =
        ((task.error as { message?: string } | undefined)?.message) ??
        (task.error_message as string | undefined) ??
        (task.failure_reason as string | undefined) ??
        JSON.stringify(task).slice(0, 400);
      throw new Error(`evolink task ${taskId} ${status}: ${message}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`evolink task ${taskId} timed out, last=${JSON.stringify(last).slice(0, 400)}`);
}

export function extractEvolinkVideoUrl(task: Record<string, unknown>): string | null {
  const candidates: Array<unknown> = [
    (task as any)?.results?.[0],
    (task as any)?.image_url,
    (task as any)?.video_url,
    (task as any)?.result?.image_url,
    (task as any)?.result?.video_url,
    (task as any)?.output?.image_url,
    (task as any)?.output?.video_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  // fall back to a deep scan for any mp4
  const seen = new Set<object>();
  const queue: unknown[] = [task];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node as object)) continue;
    seen.add(node as object);
    for (const value of Object.values(node)) {
      if (typeof value === 'string' && /^https?:\/\//.test(value) && /\.mp4(\?|$)/i.test(value)) {
        return value;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return null;
}

export async function generateSimpleSelfieEvolink(
  params: EvolinkVideoParams,
): Promise<{ videoUrl: string; taskId: string; raw: Record<string, unknown> }> {
  const model = process.env.EVOLINK_SEEDANCE_MODEL || 'seedance-2.0-mini-reference-to-video';
  // Hold a pooled provider slot for the WHOLE job (submit → completion) so we
  // never exceed a key's concurrent-task ceiling — the source of the submit 500s.
  return withEvolinkSlot(async (apiKey) => {
    const submit = await submitEvolinkVideo(apiKey, model, params);
    const completed = await pollEvolinkTask(apiKey, submit.id);
    const videoUrl = extractEvolinkVideoUrl(completed);
    if (!videoUrl) {
      throw new Error(`evolink task ${submit.id} succeeded but no video URL`);
    }
    return { videoUrl, taskId: submit.id, raw: completed };
  });
}

/**
 * Lip-sync mode: drive the face in `imageUrl` to speak the speech in
 * `audioUrl` using Seedance 2.0's reference-audio input (@audio1). No TTS —
 * the provided recording IS the voice. generate_audio is false so the model
 * uses the supplied track rather than inventing one.
 */
export async function generateLipSyncEvolink(
  params: {
    imageUrl: string;
    audioUrl: string;
    aspectRatio: '9:16' | '1:1';
    duration?: 5 | 10 | 15;
  },
): Promise<{ videoUrl: string; taskId: string; raw: Record<string, unknown> }> {
  const model = process.env.EVOLINK_SEEDANCE_MODEL || 'seedance-2.0-mini-reference-to-video';
  const prompt =
    'The person in the reference image speaks directly to the camera, mouth lip-synced precisely to the speech in @audio1. Natural head movement and micro-expressions. Flat, soft, even everyday indoor light — no studio lighting, no glare, no glossy or shiny sheen on the skin, matte natural skin texture. Vertical close-up, candid phone-camera look.';
  return withEvolinkSlot(async (apiKey) => {
    const submit = await submitEvolinkVideo(apiKey, model, {
      prompt,
      imageUrls: [params.imageUrl],
      audioUrls: [params.audioUrl],
      duration: params.duration ?? 10,
      aspectRatio: params.aspectRatio === '1:1' ? '1:1' : '9:16',
      generateAudio: false,
      quality: '720p',
    });
    const completed = await pollEvolinkTask(apiKey, submit.id);
    const videoUrl = extractEvolinkVideoUrl(completed);
    if (!videoUrl) {
      throw new Error(`evolink lip-sync task ${submit.id} succeeded but no video URL`);
    }
    return { videoUrl, taskId: submit.id, raw: completed };
  });
}
