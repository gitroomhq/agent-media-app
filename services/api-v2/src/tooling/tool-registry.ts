// Copyright 2026 agent-media contributors. Apache-2.0 license.

import {
  ActorRefToolInputSchema as ActorRefToolInputSchemaFromSchema,
  ElevenLabsAudioInputSchema as ElevenLabsAudioInputSchemaFromSchema,
  PortraitGpt2ToolInputSchema as PortraitGpt2ToolInputSchemaFromSchema,
  PortraitGpt2ToolOutputSchema as PortraitGpt2ToolOutputSchemaFromSchema,
  SceneContinuityInputSchema as SceneContinuityInputSchemaFromSchema,
  SelfieToolInputSchema as SelfieToolInputSchemaFromSchema,
  SubtitleToolInputSchema as SubtitleToolInputSchemaFromSchema,
} from '@agentmedia/schema';
import { z } from 'zod';
import type { RuntimeExecutionContext, RuntimeToolRunner } from './runtime-graph.js';

const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE ?? 'https://api.agent-media.ai';
const ELEVENLABS_API_BASE = process.env.ELEVENLABS_API_BASE ?? 'https://api.elevenlabs.io/v1';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';

function primitiveWorkerConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.VNEXT_PRIMITIVE_WORKER_URL?.replace(/\/+$/, '');
  const secret = process.env.VNEXT_PRIMITIVE_WORKER_SECRET ?? '';
  return baseUrl && secret ? { baseUrl, secret } : null;
}

function isPublicHttpsUrl(value: string): boolean {
  const url = new URL(value);
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return !(
    host === 'localhost' ||
    host === '::1' ||
    host.includes(':') ||
    host.startsWith('[') ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('169.254.') ||
    /^::ffff:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(host) ||
    /^0:0:0:0:0:ffff:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(host) ||
    host.startsWith('fe80:')
  );
}

// Backward-safe fallback: if api-v2 runs against an older schema build
// that doesn't yet export the tooling contracts, keep runtime validation alive.
const ActorRefToolInputSchema = ActorRefToolInputSchemaFromSchema ?? z.object({
  mode: z.enum(['use_existing', 'create_new']),
  character_id: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  photo_url: z.string().url().optional(),
});

const SceneContinuityInputSchema = SceneContinuityInputSchemaFromSchema ?? z.object({
  previous_job_id: z.string().uuid().optional(),
  explicit_last_frame_url: z.string().url().optional(),
  scene_notes: z.string().optional(),
});

const ElevenLabsAudioInputSchema = ElevenLabsAudioInputSchemaFromSchema ?? z.object({
  voice_id: z.string().min(1),
  script: z.string().min(1),
  model_id: z.string().default('eleven_multilingual_v2'),
});

const PortraitGpt2ToolInputSchema = PortraitGpt2ToolInputSchemaFromSchema ?? z.object({
  description: z.string().min(8).max(400),
  reference_photo_url: z.string().url().regex(/^https:\/\//, 'reference_photo_url must use https').refine(isPublicHttpsUrl, {
    message: 'reference_photo_url must use https and must not target private/internal addresses',
  }).optional(),
  setting: z.string().min(1).max(200).optional(),
  aspect_ratio: z.enum(['1:1', '9:16']).default('1:1'),
  realism_target: z.enum(['natural', 'commercial', 'raw_iphone']).default('natural'),
});

const PortraitGpt2ToolOutputSchema = PortraitGpt2ToolOutputSchemaFromSchema ?? z.object({
  job_id: z.string().uuid(),
  status: z.literal('submitted'),
  portrait_url: z.string().url().nullable(),
  provider: z.literal('gpt-image-2'),
  credits_deducted: z.number().int().nonnegative(),
});

const SelfieToolInputSchema = SelfieToolInputSchemaFromSchema ?? z.object({
  character_id: z.string().optional(),
  photo_url: z.string().url().optional(),
  description: z.string().optional(),
  script: z.string().optional(),
  scene_action: z.string().optional(),
  duration: z.number().int().optional(),
  subtitles: z.boolean().optional(),
});

const SubtitleToolInputSchema = SubtitleToolInputSchemaFromSchema ?? z.object({
  video_url: z.string().url(),
  style: z.string().optional(),
  transcript: z.string().optional(),
  language: z.string().optional(),
});

async function apiCall(
  ctx: RuntimeExecutionContext,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const resp = await fetch(`${PUBLIC_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.authToken}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: resp.status, data };
}

async function runActorRefs(input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
  const parsed = ActorRefToolInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`actor_refs input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const data = parsed.data;
  if (data.mode === 'use_existing') {
    if (data.character_id) {
      return { character_id: data.character_id, source: 'existing' as const };
    }
    const listed = await apiCall(ctx, 'GET', '/v2/characters');
    if (listed.status !== 200 || !Array.isArray(listed.data?.characters)) {
      throw new Error(`failed to list characters (HTTP ${listed.status})`);
    }
    const picked = data.display_name
      ? listed.data.characters.find((c: any) => c.display_name?.toLowerCase() === data.display_name?.toLowerCase())
      : listed.data.characters[0];
    if (!picked?.character_id) throw new Error('no existing character available to reuse');
    return { character_id: picked.character_id, source: 'existing' as const };
  }

  const created = await apiCall(ctx, 'POST', '/v2/characters', {
    display_name: data.display_name ?? 'auto-character',
    description: data.description,
    photo_url: data.photo_url,
  });
  if (created.status !== 201) {
    throw new Error(created.data?.error?.message ?? `character create failed (${created.status})`);
  }
  const characterId = typeof created.data?.character_id === 'string' ? created.data.character_id : null;
  const jobId = typeof created.data?.job_id === 'string' ? created.data.job_id : undefined;
  if (!characterId && !jobId) {
    throw new Error('character create returned neither character_id nor job_id');
  }
  return {
    character_id: characterId,
    source: 'created' as const,
    job_id: jobId,
  };
}

async function runSceneContinuity(input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
  const parsed = SceneContinuityInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`scene_continuity input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const data = parsed.data;
  if (data.explicit_last_frame_url) {
    return {
      last_frame_reference_url: data.explicit_last_frame_url,
      continuity_prompt_suffix: `Maintain continuity from last frame: ${data.explicit_last_frame_url}. ${data.scene_notes ?? ''}`.trim(),
      source: 'explicit' as const,
    };
  }
  if (data.previous_job_id) {
    const status = await apiCall(ctx, 'GET', `/v1/videos/${data.previous_job_id}`);
    if (status.status === 200) {
      const wireframe = status.data?.wireframe_url ?? null;
      return {
        last_frame_reference_url: wireframe,
        continuity_prompt_suffix: wireframe
          ? `Match scene continuity, framing, and wardrobe from ${wireframe}. ${data.scene_notes ?? ''}`.trim()
          : `Continue prior scene naturally. ${data.scene_notes ?? ''}`.trim(),
        source: wireframe ? ('job_wireframe' as const) : ('none' as const),
      };
    }
  }
  return {
    last_frame_reference_url: null,
    continuity_prompt_suffix: `No previous frame reference available. ${data.scene_notes ?? ''}`.trim(),
    source: 'none' as const,
  };
}

async function runElevenLabsAudio(input: Record<string, unknown>): Promise<unknown> {
  const parsed = ElevenLabsAudioInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`elevenlabs_audio input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const data = parsed.data;
  if (!ELEVENLABS_API_KEY) {
    return {
      integration_enabled: false,
      request_payload: null,
      preview_url: null,
    };
  }

  const previewResp = await fetch(`${ELEVENLABS_API_BASE}/voices/${encodeURIComponent(data.voice_id)}`, {
    method: 'GET',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (!previewResp.ok) {
    throw new Error(`elevenlabs voice lookup failed (${previewResp.status})`);
  }

  return {
    integration_enabled: true,
    request_payload: {
      path: `/text-to-speech/${data.voice_id}`,
      payload: {
        text: data.script,
        model_id: data.model_id,
      },
    },
    preview_url: null,
  };
}

async function runPortraitGpt2(input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
  const parsed = PortraitGpt2ToolInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`portrait_gpt2 input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const config = primitiveWorkerConfig();
  if (!config) {
    throw new Error('portrait_gpt2 primitive worker is not configured');
  }
  const resp = await fetch(`${config.baseUrl}/v1/primitives/portrait_gpt2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Primitive-Worker-Secret': config.secret,
      'X-Tooling-Run-Id': ctx.runId,
      'X-Tooling-User-Id': ctx.userId,
    },
    body: JSON.stringify(parsed.data),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(data?.error?.message ?? `portrait_gpt2 submit failed (${resp.status})`);
  }
  const output = PortraitGpt2ToolOutputSchema.safeParse(data);
  if (!output.success) {
    throw new Error(`portrait_gpt2 output invalid: ${output.error.issues[0]?.message ?? 'invalid'}`);
  }
  return output.data;
}

async function runSelfie(input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
  const parsed = SelfieToolInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`selfie input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const sub = await apiCall(ctx, 'POST', '/v2/selfie', parsed.data);
  if (sub.status !== 201) throw new Error(sub.data?.error?.message ?? `selfie submit failed (${sub.status})`);
  return {
    job_id: sub.data.job_id,
    status: sub.data.status ?? 'submitted',
    credits_deducted: sub.data.credits_deducted ?? 0,
  };
}

async function runSubtitles(input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
  const parsed = SubtitleToolInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`subtitles input invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  const sub = await apiCall(ctx, 'POST', '/v2/subtitle', parsed.data);
  if (sub.status !== 201) throw new Error(sub.data?.error?.message ?? `subtitle submit failed (${sub.status})`);
  return {
    job_id: sub.data.job_id,
    status: sub.data.status ?? 'submitted',
    credits_deducted: sub.data.credits_deducted ?? 0,
  };
}

export const mandatoryToolRunner: RuntimeToolRunner = {
  async run(toolId: string, input: Record<string, unknown>, ctx: RuntimeExecutionContext): Promise<unknown> {
    if (toolId === 'actor_refs') return runActorRefs(input, ctx);
    if (toolId === 'scene_continuity') return runSceneContinuity(input, ctx);
    if (toolId === 'elevenlabs_audio') return runElevenLabsAudio(input);
    if (toolId === 'portrait_gpt2') return runPortraitGpt2(input, ctx);
    if (toolId === 'selfie') return runSelfie(input, ctx);
    if (toolId === 'subtitles') return runSubtitles(input, ctx);
    throw new Error(`Unknown toolId "${toolId}"`);
  },
};
