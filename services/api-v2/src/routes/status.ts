// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /v1/videos/:jobId
 *
 * Returns the status of a generation job.
 */

import type { Request, Response } from 'express';
import { supabase } from '../server.js';

// A job id is an opaque well-formed UUID. Validate the 8-4-4-4-12 hex shape
// only (a cheap gate against malformed input before the DB query) — do NOT
// enforce the RFC version/variant nibbles: the nil UUID (all zeros) and max
// UUID are valid per RFC 9562, and the OpenAPI contract documents jobId as
// `format: uuid` with a 404 (not 400) for a well-formed-but-missing id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JobStatusView {
  job_id: string;
  operation: string;
  status: string;
  progress: unknown;
  video_url: string | null;
  result_url: string | null;
  character_sheet_url: string | null;
  storyboard_url: string | null;
  reference_image_url: string | null;
  portrait_url: string | null;
  sheet_url: string | null;
  wireframe_url: string | null;
  seedance_prompt: string | null;
  seedance_full_prompt: string | null;
  character_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function sanitizeErrorMessage(message: string | null): string | null {
  if (!message) return message;
  let safe = message;
  if (safe.length > 200) {
    safe = `${safe.substring(0, 200)}...`;
  }
  return safe.replace(/\/tmp\/[^\s]+/g, '[temp]').replace(/at\s+\S+\s+\([^)]+\)/g, '');
}

export async function fetchUserJobStatus(jobId: string, userId: string): Promise<JobStatusView | null> {
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('id, operation, status, progress_detail, input_params, output_media_url, error_message, created_at, updated_at, character_id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const safeError = sanitizeErrorMessage(data.error_message);
  const input = (data.input_params ?? {}) as Record<string, unknown>;
  const portraitUrl = typeof input.portrait_url === 'string' ? input.portrait_url : null;
  const characterSheetUrl = typeof input.character_sheet_url === 'string' ? input.character_sheet_url : null;
  const storyboardUrl = typeof input.storyboard_url === 'string' ? input.storyboard_url : null;
  const wireframeUrl = typeof input.wireframe_url === 'string' ? input.wireframe_url : null;
  const referenceImageUrl = typeof input.reference_image_url === 'string' ? input.reference_image_url : null;
  const seedancePrompt = typeof input.seedance_prompt === 'string' ? input.seedance_prompt : null;
  const seedanceFullPrompt = typeof input.seedance_full_prompt === 'string' ? input.seedance_full_prompt : null;

  let v2CharacterId: string | null = null;
  if (data.character_id) {
    const { data: ch } = await supabase
      .from('user_characters')
      .select('public_id')
      .eq('id', data.character_id)
      .maybeSingle();
    v2CharacterId = (ch?.public_id as string | undefined) ?? null;
  }

  return {
    job_id: data.id,
    operation: data.operation,
    status: data.status,
    progress: data.progress_detail,
    video_url: data.output_media_url,
    result_url: data.output_media_url,
    character_sheet_url: characterSheetUrl,
    storyboard_url: storyboardUrl,
    reference_image_url: referenceImageUrl,
    portrait_url: portraitUrl,
    sheet_url: characterSheetUrl,
    wireframe_url: wireframeUrl,
    seedance_prompt: seedancePrompt,
    seedance_full_prompt: seedanceFullPrompt,
    character_id: v2CharacterId,
    error_message: safeError,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function statusRoute(req: Request, res: Response): Promise<void> {
  const rawJobId = req.params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const userId = (req as any).userId as string;
  if (!jobId) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Missing jobId path parameter' },
    });
    return;
  }
  if (!UUID_RE.test(jobId)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid jobId format' },
    });
    return;
  }

  try {
    const data = await fetchUserJobStatus(jobId, userId);
    if (!data) {
      res.status(404).json({
        error: { code: 'VIDEO_NOT_FOUND', message: `Job "${jobId}" not found` },
      });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error('[status] query failed:', err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch job status' },
    });
  }
}
