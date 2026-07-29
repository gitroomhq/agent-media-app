// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * @agent-media/sdk — TypeScript SDK for agent-media video generation.
 *
 * Usage:
 *   import { AgentMedia } from '@agent-media/sdk';
 *   const client = new AgentMedia({ apiKey: 'ma_xxx' });
 *   const video = await client.createVideo({ script: '...', actor_slug: 'sofia' });
 *   console.log(video.video_url);
 */

import type {
  CreateVideoInput, SubtitleInput, SaasReviewInput, ProductReviewInput,
  ShowYourAppInput, ProductActingInput, LaptopUgcInput,
  CharacterSheetInput, CharacterStoryboardInput,
  StoryboardSuggestInput, CharacterVideoInput, TextToVideoInput,
} from '@agentmedia/schema';

export interface AgentMediaConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface JobSubmitted {
  job_id: string;
  status: 'submitted';
  estimated_duration: number;
  credits_deducted: number;
  selected_voice?: string;
  voice_auto_detected?: boolean;
  word_count?: number;
  pacing_warning?: string | null;
}

export interface JobStatus {
  job_id: string;
  status: 'submitted' | 'processing' | 'completed' | 'failed';
  progress?: Record<string, unknown>;
  video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Actor {
  id: string;
  slug: string;
  name: string;
  portrait_url?: string;
  age?: number;
  gender?: string;
  nationality?: string;
}

export interface ActorList {
  actors: Actor[];
  total: number;
  limit: number;
  offset: number;
}

export interface VideoResult {
  job_id: string;
  video_url: string;
  credits_deducted: number;
  duration: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown[];
}

export class AgentMediaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown[];

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'AgentMediaError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

// v2 namespace — imported here so `client.v2.selfie(...)` works without
// a separate import. Lives in its own subpath (@agentmedia/sdk/v2) too
// for users who want only the v2 surface and tree-shake the legacy class.
import { AgentMediaV2 } from './v2/index.js';
export { AgentMediaV2 } from './v2/index.js';
export type { V2JobSubmitted, V2JobStatus, V2Config } from './v2/index.js';

export class AgentMedia {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  /** v2 product surface — Selfie, character_create, future v2 ops. */
  readonly v2: AgentMediaV2;

  constructor(config: AgentMediaConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.agent-media.ai';
    this.v2 = new AgentMediaV2({ apiKey: this.apiKey, baseUrl: this.baseUrl });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const error = data.error ?? { code: 'UNKNOWN', message: 'Request failed' };
      throw new AgentMediaError(resp.status, error);
    }

    return data as T;
  }

  /** List available AI actors. */
  async listActors(options?: { limit?: number; offset?: number }): Promise<ActorList> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return this.request<ActorList>('GET', `/v1/actors?limit=${limit}&offset=${offset}`);
  }

  /** Get video generation job status. */
  async getVideoStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>('GET', `/v1/videos/${jobId}`);
  }

  /** Submit a UGC video generation job. Returns immediately with job ID. */
  async submitVideo(input: CreateVideoInput): Promise<JobSubmitted> {
    return this.request<JobSubmitted>('POST', '/v1/generate/ugc_video', input);
  }

  /** Submit a subtitle job. */
  async submitSubtitle(input: SubtitleInput): Promise<JobSubmitted> {
    return this.request<JobSubmitted>('POST', '/v1/generate/subtitle', input);
  }

  /** Submit a SaaS Review job. */
  async submitSaasReview(input: SaasReviewInput): Promise<JobSubmitted> {
    return this.request<JobSubmitted>('POST', '/v1/generate/saas_review', input);
  }

  /**
   * Submit a SaaS Review job.
   * @deprecated Use submitSaasReview. The product_review endpoint remains accepted as a legacy alias for one release.
   */
  async submitProductReview(input: ProductReviewInput): Promise<JobSubmitted> {
    return this.submitSaasReview(input);
  }

  /**
   * Submit a Show Your App job — an AI actor holding a phone that displays your
   * app screenshot, with Hormozi-style word-by-word subtitles burned in.
   *
   * The app screenshot MUST be vertical (portrait). If `actor_slug` is omitted,
   * a random actor from the show_your_app pool is chosen. Script length is
   * capped at 3 words/sec × duration (e.g. 15 words @ 5s).
   */
  async submitShowYourApp(input: ShowYourAppInput): Promise<JobSubmitted & { actor_slug: string; actor_random: boolean; subtitle_style: string }> {
    return this.request('POST', '/v1/generate/show_your_app', input);
  }

  /**
   * Submit a Product Acting UGC job — an AI creator presents or reacts to a
   * product image in a real-world UGC scenario.
   *
   * If `script` is omitted, provide `product_description` and the API will
   * generate a short script. Script length is capped at 3 words/sec × duration.
   */
  async submitProductActing(input: ProductActingInput): Promise<JobSubmitted & { actor_slug: string; script: string; subtitles: boolean; subtitle_style: string }> {
    return this.request('POST', '/v1/generate/product_acting_ugc', input);
  }

  /**
   * Generate a Product Acting UGC video and wait for completion.
   * Polls every 5 seconds until done or timeout (default 10 minutes).
   */
  async createProductActing(input: ProductActingInput, options?: { timeoutMs?: number }): Promise<VideoResult & { actor_slug: string }> {
    const job = await this.submitProductActing(input);
    const timeout = options?.timeoutMs ?? 600_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.getVideoStatus(job.job_id);
      if (status.status === 'completed' && status.video_url) {
        return {
          job_id: job.job_id,
          video_url: status.video_url,
          credits_deducted: job.credits_deducted,
          duration: input.duration ?? job.estimated_duration,
          actor_slug: job.actor_slug,
        };
      }
      if (status.status === 'failed') {
        throw new AgentMediaError(500, {
          code: 'GENERATION_FAILED',
          message: status.error_message ?? 'Product Acting UGC generation failed',
        });
      }
      await new Promise(r => setTimeout(r, 5_000));
    }

    throw new AgentMediaError(408, {
      code: 'TIMEOUT',
      message: `Product Acting UGC timed out after ${timeout / 1000}s. Job ID: ${job.job_id}`,
    });
  }

  /**
   * Submit a Laptop UGC job — a 3-scene ad: actor holds laptop showing your
   * app, scrolling B-roll, then a face-only selfie close. Native lip-synced
   * audio. Provide either app_screen_recording_url (mp4/mov, max 10 MB, 10s)
   * OR app_screen_image_url (png/jpeg/webp, max 5 MB), not both.
   */
  async submitLaptopUgc(input: LaptopUgcInput): Promise<JobSubmitted & { actor_slug: string; actor_random: boolean; subtitle_style: string }> {
    return this.request('POST', '/v1/generate/laptop_ugc', input);
  }

  /**
   * Generate a Laptop UGC video and wait for completion.
   * Polls every 5 seconds until done or timeout (default 15 minutes — first-job
   * per actor adds ~3min for pose pre-generation).
   */
  async createLaptopUgc(input: LaptopUgcInput, options?: { timeoutMs?: number }): Promise<VideoResult & { actor_slug: string }> {
    const job = await this.submitLaptopUgc(input);
    const timeout = options?.timeoutMs ?? 900_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.getVideoStatus(job.job_id);
      if (status.status === 'completed' && status.video_url) {
        return {
          job_id: job.job_id,
          video_url: status.video_url,
          credits_deducted: job.credits_deducted,
          duration: input.duration ?? 20,
          actor_slug: job.actor_slug,
        };
      }
      if (status.status === 'failed') {
        throw new AgentMediaError(500, {
          code: 'GENERATION_FAILED',
          message: status.error_message ?? 'Laptop UGC generation failed',
        });
      }
      await new Promise(r => setTimeout(r, 5_000));
    }

    throw new AgentMediaError(408, {
      code: 'TIMEOUT',
      message: `Laptop UGC timed out after ${timeout / 1000}s. Job ID: ${job.job_id}`,
    });
  }

  /**
   * Generate a Show Your App video and wait for completion.
   * Polls every 5 seconds until done or timeout (default 10 minutes).
   */
  async createShowYourApp(input: ShowYourAppInput, options?: { timeoutMs?: number }): Promise<VideoResult & { actor_slug: string }> {
    const job = await this.submitShowYourApp(input);
    const timeout = options?.timeoutMs ?? 600_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.getVideoStatus(job.job_id);
      if (status.status === 'completed' && status.video_url) {
        return {
          job_id: job.job_id,
          video_url: status.video_url,
          credits_deducted: job.credits_deducted,
          duration: input.duration ?? 5,
          actor_slug: job.actor_slug,
        };
      }
      if (status.status === 'failed') {
        throw new AgentMediaError(500, {
          code: 'GENERATION_FAILED',
          message: status.error_message ?? 'Show Your App generation failed',
        });
      }
      await new Promise(r => setTimeout(r, 5_000));
    }

    throw new AgentMediaError(408, {
      code: 'TIMEOUT',
      message: `Show Your App timed out after ${timeout / 1000}s. Job ID: ${job.job_id}`,
    });
  }

  // ── Content Machine (3-step character video pipeline) ────────────────────
  // Each step (sheet / storyboard / video) is async — the route returns
  // 202 + job_id, and clients poll GET /v1/videos/{id} until completed.
  // storyboard-suggest is sync (no credits, returns 3 beat options).

  /** Step 1 — generate a multi-angle character reference sheet (gpt-image-2). Returns 202 + job_id. */
  async submitCharacterSheet(input: CharacterSheetInput): Promise<JobSubmitted & {
    operation: 'character_sheet';
    poll_url: string;
    expected_seconds: number;
    source?: 'actor' | 'reference' | 'description';
    actor_slug?: string;
    actor_name?: string;
    reference_image_url?: string;
    description?: string;
  }> {
    return this.request('POST', '/v1/character/sheet-generate', input);
  }

  /** Step 1.5 (optional) — get 3 distinct AI-suggested beat sequences for the storyboard. Sync, no credits. */
  async suggestStoryboard(input: StoryboardSuggestInput): Promise<{
    options: Array<{ title: string; beats: string[] }>;
  }> {
    return this.request('POST', '/v1/character/storyboard-suggest', input);
  }

  /** Step 2 — paint a numbered storyboard panel grid. Pass `beats` OR `script`. Returns 202 + job_id. */
  async submitCharacterStoryboard(input: CharacterStoryboardInput): Promise<JobSubmitted & {
    operation: 'character_storyboard';
    poll_url: string;
    expected_seconds: number;
  }> {
    return this.request('POST', '/v1/character/storyboard-generate', input);
  }

  /** Step 3 — render the final 720p Seedance video from the sheet + storyboard. Returns 202 + job_id. */
  async submitCharacterVideo(input: CharacterVideoInput): Promise<JobSubmitted & {
    duration: number;
    aspect_ratio: string;
  }> {
    return this.request('POST', '/v1/generate/character_video', input);
  }

  // ── Text-to-Video (pure prompt, no character) ──────────────────────────
  //
  // One-shot generator: prompt → Seedance 2.0 text-to-video at 720p. No
  // character sheet, no storyboard. The prompt IS the entire creative
  // direction (style + subject + mood + composition). Same cost basis as
  // character_video: 350 / 700 / 1050 credits for 5 / 10 / 15s.

  /** Submit a one-shot text-to-video job. Returns 201 + job_id; poll via getJob. */
  async submitTextToVideo(input: TextToVideoInput): Promise<JobSubmitted & {
    duration: number;
    aspect_ratio: string;
  }> {
    return this.request('POST', '/v1/generate/text_to_video', input);
  }

  /**
   * Submit + wait for completion in one call. Polls every 5s until the
   * job completes or the timeout fires. Returns the public R2 URL.
   */
  async createTextToVideo(input: TextToVideoInput, opts: { timeoutMs?: number } = {}): Promise<{
    job_id: string;
    video_url: string;
    duration: number;
    aspect_ratio: string;
  }> {
    const timeout = opts.timeoutMs ?? 30 * 60 * 1000;
    const submit = await this.submitTextToVideo(input);
    const job = await this.pollUntilDone(submit.job_id, 'text-to-video', timeout);
    if (!job.video_url) {
      throw new AgentMediaError(500, { code: 'GENERATION_FAILED', message: `text-to-video completed without an output URL (job ${submit.job_id})` });
    }
    return {
      job_id: submit.job_id,
      video_url: job.video_url,
      duration: submit.duration,
      aspect_ratio: submit.aspect_ratio,
    };
  }

  /**
   * Run the full 3-step Content Machine pipeline end-to-end and return the
   * sheet/storyboard/video URLs together. Mints a session_id once and
   * threads it through so api-v2 backstops the scene prompt from the
   * storyboard step.
   *
   * Polls each step every 5 seconds. Default timeout is 30 min total
   * (sheet ~3 min + storyboard ~3 min + video ~3 min, plus headroom).
   */
  async createCharacterVideo(input: {
    /** Character source — exactly one of these must be provided. */
    description?: string;
    actor_slug?: string;
    reference_image_url?: string;
    /** Storyboard source — exactly one of these must be provided. */
    beats?: string[];
    script?: string;
    /** Final video options. */
    duration?: 5 | 10;
    aspect_ratio?: '9:16' | '16:9' | '1:1';
    generate_audio?: boolean;
    action_prompt?: string;
    webhook_url?: string;
  }, options?: { timeoutMs?: number; sessionId?: string }): Promise<{
    session_id: string;
    character_sheet_url: string;
    storyboard_url: string;
    video_url: string;
    video_job_id: string;
    credits_deducted: number;
  }> {
    const sources = [input.description, input.actor_slug, input.reference_image_url].filter(Boolean).length;
    if (sources === 0) {
      throw new AgentMediaError(400, { code: 'VALIDATION_ERROR', message: 'Provide one of description, actor_slug, or reference_image_url' });
    }
    if (input.actor_slug && input.reference_image_url) {
      throw new AgentMediaError(400, { code: 'VALIDATION_ERROR', message: 'actor_slug and reference_image_url are mutually exclusive' });
    }
    if (Boolean(input.beats) === Boolean(input.script)) {
      throw new AgentMediaError(400, { code: 'VALIDATION_ERROR', message: 'Provide exactly one of beats or script' });
    }

    const sessionId = options?.sessionId ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`);
    const totalTimeout = options?.timeoutMs ?? 30 * 60 * 1000;
    const stepStart = Date.now();
    const remaining = () => Math.max(60_000, totalTimeout - (Date.now() - stepStart));
    const aspect = input.aspect_ratio ?? '9:16';

    // ── Step 1 — sheet ───────────────────────────────────────────────────
    const sheetSubmit = await this.submitCharacterSheet({
      ...(input.description ? { description: input.description } : {}),
      ...(input.actor_slug ? { actor_slug: input.actor_slug } : {}),
      ...(input.reference_image_url ? { reference_image_url: input.reference_image_url } : {}),
      session_id: sessionId,
    } as CharacterSheetInput);
    const sheetJob = await this.pollUntilDone(sheetSubmit.job_id, 'character sheet', remaining());
    if (!sheetJob.video_url) {
      throw new AgentMediaError(500, { code: 'GENERATION_FAILED', message: `character sheet completed without an output URL (job ${sheetSubmit.job_id})` });
    }
    const characterSheetUrl = sheetJob.video_url;

    // ── Step 2 — storyboard ──────────────────────────────────────────────
    const sbSubmit = await this.submitCharacterStoryboard({
      character_sheet_url: characterSheetUrl,
      ...(input.beats ? { beats: input.beats } : {}),
      ...(input.script ? { script: input.script } : {}),
      ratio: aspect,
      session_id: sessionId,
    } as CharacterStoryboardInput);
    const sbJob = await this.pollUntilDone(sbSubmit.job_id, 'storyboard', remaining());
    if (!sbJob.video_url) {
      throw new AgentMediaError(500, { code: 'GENERATION_FAILED', message: `storyboard completed without an output URL (job ${sbSubmit.job_id})` });
    }
    const storyboardUrl = sbJob.video_url;

    // ── Step 3 — video ───────────────────────────────────────────────────
    const videoSubmit = await this.submitCharacterVideo({
      character_sheet_url: characterSheetUrl,
      storyboard_url: storyboardUrl,
      ...(input.action_prompt ? { action_prompt: input.action_prompt } : {}),
      duration: input.duration ?? 10,
      aspect_ratio: aspect,
      generate_audio: input.generate_audio ?? true,
      session_id: sessionId,
      ...(input.webhook_url ? { webhook_url: input.webhook_url } : {}),
    } as CharacterVideoInput);
    const videoJob = await this.pollUntilDone(videoSubmit.job_id, 'character video', remaining());
    if (!videoJob.video_url) {
      throw new AgentMediaError(500, { code: 'GENERATION_FAILED', message: `character video completed without an output URL (job ${videoSubmit.job_id})` });
    }

    return {
      session_id: sessionId,
      character_sheet_url: characterSheetUrl,
      storyboard_url: storyboardUrl,
      video_url: videoJob.video_url,
      video_job_id: videoSubmit.job_id,
      credits_deducted: videoSubmit.credits_deducted,
    };
  }

  /** Internal: poll GET /v1/videos/{jobId} every 5s until terminal or timeout. */
  private async pollUntilDone(jobId: string, label: string, timeoutMs: number): Promise<JobStatus> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.getVideoStatus(jobId);
      if (status.status === 'completed') return status;
      if (status.status === 'failed') {
        throw new AgentMediaError(500, {
          code: 'GENERATION_FAILED',
          message: status.error_message ?? `${label} generation failed`,
        });
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    throw new AgentMediaError(408, {
      code: 'TIMEOUT',
      message: `${label} timed out after ${Math.round(timeoutMs / 1000)}s. Job ID: ${jobId}`,
    });
  }

  /**
   * Generate a video and wait for completion.
   * Polls every 5 seconds until done or timeout (default 10 minutes).
   */
  async createVideo(input: CreateVideoInput, options?: { timeoutMs?: number }): Promise<VideoResult> {
    const job = await this.submitVideo(input);
    const timeout = options?.timeoutMs ?? 600_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.getVideoStatus(job.job_id);

      if (status.status === 'completed' && status.video_url) {
        return {
          job_id: job.job_id,
          video_url: status.video_url,
          credits_deducted: job.credits_deducted,
          duration: job.estimated_duration,
        };
      }

      if (status.status === 'failed') {
        throw new AgentMediaError(500, {
          code: 'GENERATION_FAILED',
          message: status.error_message ?? 'Video generation failed',
        });
      }

      await new Promise(r => setTimeout(r, 5_000));
    }

    throw new AgentMediaError(408, {
      code: 'TIMEOUT',
      message: `Video generation timed out after ${timeout / 1000}s. Job ID: ${job.job_id}`,
    });
  }
}

// Re-export schema types for convenience
export type {
  CreateVideoInput, SubtitleInput, SaasReviewInput, ProductReviewInput,
  ShowYourAppInput, ProductActingInput, LaptopUgcInput,
  CharacterSheetInput, CharacterStoryboardInput,
  StoryboardSuggestInput, CharacterVideoInput, TextToVideoInput,
} from '@agentmedia/schema';
