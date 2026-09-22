// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * @agentmedia/sdk/v2 — TypeScript SDK for the v2 product surface.
 *
 *   import { AgentMedia } from '@agentmedia/sdk';
 *   const client = new AgentMedia({ apiKey: 'ma_xxx' });
 *
 *   const character = await client.v2.createCharacter({
 *     photo_url: 'https://...',
 *     display_name: 'sofia',
 *     description: '25, asian, long wavy dark hair',
 *   });
 *
 *   const video = await client.v2.selfie({
 *     character_id: character.character_id,
 *     script: '...',
 *   });
 *
 * Each method is a thin wrapper over an api-v2 REST route from the
 * V2_GENERATORS registry. Method names and input shapes derive from
 * `@agentmedia/schema/v2`. When we add op #3+ we'll either keep adding
 * thin wrappers or codegen the whole surface from V2_GENERATORS — the
 * external method names are stable either way.
 */

import type { SelfieInput, CharacterCreateInput } from '@agentmedia/schema/v2';

// The loose surface (POST /v2/generate/{kind}). Mirrors the zod schemas in
// @agentmedia/schema/v2 (GenerateVideoSchema, GenerateImageSchema,
// GenerateAudioSchema); the API validates every field and answers 400 with
// the allowed values, so these types stay deliberately light.
export interface GenerateVideoInput {
  /** The shot as a director would say it; quoted words are spoken. */
  prompt: string;
  /** A live video model id from list_models, or "auto". Omit for the default. */
  model?: string;
  /** Image-to-video: an https image that becomes frame one. */
  first_frame?: string;
  /** Optional with first_frame: the image the clip ends on. */
  last_frame?: string;
  /** Reference-to-video: image references, addressed as @image1... in the prompt. */
  refs?: string[];
  /** Reference clips (https mp4/mov), addressed as @video1... Billed like output seconds. */
  video_refs?: string[];
  /** Reference audio (https wav/mp3), addressed as @audio1... */
  audio_refs?: string[];
  /** Clip length in seconds (seedance: 4 to 15). Default 5. */
  seconds?: number;
  /** 9:16, 16:9, 1:1, 4:3, 3:4, 21:9 or adaptive. */
  aspect?: string;
  /** 480p, 720p (default) or 1080p; sets the per-second price. */
  quality?: string;
  /** Render native audio. Default true. */
  audio?: boolean;
}

export interface GenerateImageInput {
  prompt: string;
  model?: string;
  /** Reference images (https URLs, up to 4) for an edit. */
  refs?: string[];
  /** 1024x1536 (default), 1024x1024 or 1536x1024. */
  size?: string;
}

export interface GenerateAudioInput {
  text: string;
  model?: string;
  /** A voice name (jessica, sarah, liam, chris, lily, bill, matilda) or a raw ElevenLabs voice id. */
  voice?: string;
  /** energetic | calm | confident | dramatic */
  tone?: string;
}

// Public shapes — mirror api-v2 responses.
export interface V2JobSubmitted {
  job_id: string;
  status: 'submitted';
  credits_deducted: number;
  generator: string;
}

export interface V2JobStatus {
  job_id: string;
  operation: string;
  status: 'submitted' | 'processing' | 'completed' | 'failed';
  progress?: Record<string, unknown>;
  video_url?: string | null;
  result_url?: string | null;
  character_id?: string | null;
  character_sheet_url?: string | null;
  storyboard_url?: string | null;
  reference_image_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

/** Response of the loose surface (POST /v2/generate/{kind}). */
export interface V2LooseSubmitted {
  job_id: string;
  status: 'submitted';
  kind: 'video' | 'image' | 'audio';
  model: string;
  mode?: string;
  quality?: string;
  credits_deducted: number;
  breakdown?: string;
  auto?: { model: string; reason: string };
  status_url: string;
}

/** Response of POST /v2/quote/{kind}. */
export interface V2Quote {
  credits: number;
  usd: number;
  model: string;
  mode?: string;
  quality?: string;
  breakdown: string;
  auto?: { model: string; reason: string };
}

export interface V2Config {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

async function call<T>(
  cfg: V2Config,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = cfg.baseUrl ?? 'https://api.agent-media.ai';
  const fetchFn = cfg.fetchImpl ?? fetch;
  const resp = await fetchFn(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await resp.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`v2 SDK: non-JSON response from ${path} (HTTP ${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    const code = data?.error?.code ?? `HTTP_${resp.status}`;
    const message = data?.error?.message ?? `Request failed (HTTP ${resp.status})`;
    const err = new Error(message) as Error & { code: string; status: number; details?: unknown };
    err.code = code;
    err.status = resp.status;
    err.details = data?.error?.issues ?? data?.error?.details;
    throw err;
  }
  return data as T;
}

/**
 * The v2 surface. Bound to an AgentMedia instance — never instantiated
 * directly by SDK users.
 */
export class AgentMediaV2 {
  constructor(private cfg: V2Config) {}

  /** Submit a v2 Selfie job. Returns the job id; use {@link status} to poll. */
  selfie(input: SelfieInput): Promise<V2JobSubmitted> {
    return call(this.cfg, 'POST', '/v2/selfie', input);
  }

  /** Create + persist a v2 character. Returns the job id; status() will surface the character_id when completed. */
  createCharacter(input: CharacterCreateInput): Promise<V2JobSubmitted> {
    return call(this.cfg, 'POST', '/v2/characters', input);
  }

  /**
   * The loose surface: one clip from a prompt (text, image-to-video via
   * first_frame, or reference via refs/video_refs/audio_refs). Pass `model`
   * to pick a catalog model; omit it for the default. Billed per output
   * second at the model's rate for the chosen quality.
   */
  generateVideo(input: GenerateVideoInput): Promise<V2LooseSubmitted> {
    return call(this.cfg, 'POST', '/v2/generate/video', input);
  }

  /** One image from a prompt (optionally editing `image_urls`). 20 credits on the default model. */
  generateImage(input: GenerateImageInput): Promise<V2LooseSubmitted> {
    return call(this.cfg, 'POST', '/v2/generate/image', input);
  }

  /** Text to speech in a named voice. 1 credit per 100 characters on the default model. */
  generateAudio(input: GenerateAudioInput): Promise<V2LooseSubmitted> {
    return call(this.cfg, 'POST', '/v2/generate/audio', input);
  }

  /** Price a generate call without running it. Free. */
  quote(kind: 'video' | 'image' | 'audio', input: Record<string, unknown>): Promise<V2Quote> {
    return call(this.cfg, 'POST', `/v2/quote/${kind}`, input);
  }

  /** Get the status of any v2 job (selfie, character, loose generate). */
  status(jobId: string): Promise<V2JobStatus> {
    return call(this.cfg, 'GET', `/v1/videos/${jobId}`);
  }

  /**
   * Convenience: submit a job + poll until it lands in a terminal
   * state (completed | failed). Returns the final status row.
   */
  async runUntilDone(
    submission: Promise<V2JobSubmitted>,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<V2JobStatus> {
    const { intervalMs = 5_000, timeoutMs = 600_000 } = opts;
    const { job_id } = await submission;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await this.status(job_id);
      if (s.status === 'completed' || s.status === 'failed') return s;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`v2 SDK: job ${job_id} did not complete within ${timeoutMs}ms`);
  }
}
