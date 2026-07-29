// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * BytePlus ModelArk client for Seedance 2.0 (fast variant).
 *
 * TypeScript port of services/media-worker-v2/src/byteplus-client.js.
 * Used by the vNext simple_selfie primitive Activity.
 */

const BASE_URL =
  process.env.BYTEPLUS_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SubmitVideoParams {
  prompt: string;
  imageUrls: string[];
  duration: 5 | 10 | 15;
  ratio: '9:16' | '1:1' | '16:9';
  generateAudio: boolean;
}

interface ArkContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
  role?: 'reference_image';
}

function buildContent(prompt: string, imageUrls: string[]): ArkContentPart[] {
  const parts: ArkContentPart[] = [{ type: 'text', text: prompt }];
  for (const url of imageUrls) {
    if (!url) continue;
    parts.push({
      type: 'image_url',
      image_url: { url },
      role: 'reference_image',
    });
  }
  return parts;
}

export async function submitVideoTask(
  apiKey: string,
  model: string,
  params: SubmitVideoParams,
): Promise<{ id: string; raw: unknown }> {
  const body = {
    model,
    content: buildContent(params.prompt, params.imageUrls),
    generate_audio: params.generateAudio,
    ratio: params.ratio,
    duration: params.duration,
    watermark: false,
  };
  const resp = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`byteplus submit ${resp.status}: ${text.slice(0, 400)}`);
    (err as any).status = resp.status;
    throw err;
  }
  const json = (await resp.json()) as { id?: string };
  if (!json.id) throw new Error('byteplus submit returned no task id');
  return { id: json.id, raw: json };
}

export interface PollOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onPoll?: (status: string) => void;
}

export async function pollVideoTask(
  apiKey: string,
  taskId: string,
  options: PollOptions = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> | null = null;
  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE_URL}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      if (resp.status >= 500) {
        await sleep(pollMs);
        continue;
      }
      const text = await resp.text().catch(() => '');
      throw new Error(`byteplus poll ${resp.status}: ${text.slice(0, 400)}`);
    }
    const task = (await resp.json()) as Record<string, unknown>;
    last = task;
    const status = String(task.status ?? '').toLowerCase();
    if (options.onPoll) options.onPoll(status);
    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      return task;
    }
    if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
      const message =
        ((task.error as { message?: string } | undefined)?.message) ??
        (task.error_message as string | undefined) ??
        (task.failure_reason as string | undefined) ??
        JSON.stringify(task).slice(0, 400);
      throw new Error(`byteplus task ${taskId} ${status}: ${message}`);
    }
    await sleep(pollMs);
  }
  throw new Error(
    `byteplus task ${taskId} timed out after ${timeoutMs / 1000}s, last=${JSON.stringify(last).slice(0, 400)}`,
  );
}

export function extractVideoUrl(task: Record<string, unknown>): string | null {
  const direct =
    (task as any)?.content?.video_url ??
    (task as any)?.video_url ??
    (task as any)?.result?.video_url ??
    (task as any)?.output?.video_url ??
    (task as any)?.data?.video_url ??
    (task as any)?.results?.[0]?.video_url ??
    (task as any)?.results?.[0]?.url ??
    null;
  if (typeof direct === 'string' && direct.length > 0) return direct;
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

export async function generateSimpleSelfieVideo(
  apiKey: string,
  params: SubmitVideoParams,
): Promise<{ videoUrl: string; taskId: string; raw: Record<string, unknown> }> {
  const model = process.env.BYTEPLUS_SEEDANCE_MODEL || 'dreamina-seedance-2-0-fast-260128';
  const submit = await submitVideoTask(apiKey, model, params);
  const completed = await pollVideoTask(apiKey, submit.id);
  const videoUrl = extractVideoUrl(completed);
  if (!videoUrl) {
    throw new Error(`byteplus task ${submit.id} succeeded but no video URL`);
  }
  return { videoUrl, taskId: submit.id, raw: completed };
}
