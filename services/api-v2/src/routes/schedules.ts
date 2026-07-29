// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /v1/schedules — CRUD for video_schedules.
 *
 *   GET    /v1/schedules             list user's schedules
 *   POST   /v1/schedules             create
 *   PATCH  /v1/schedules/:id         update enabled / cadence_hours / job_params / etc.
 *   DELETE /v1/schedules/:id         soft-delete (sets archived_at)
 *
 * Tier limits (max active schedules + min cadence) are enforced by
 * the BEFORE INSERT/UPDATE trigger video_schedules_check_tier in the
 * 20260510160000_schedules.sql migration. We surface those raise()
 * messages back to the caller as 400 / 402 errors.
 *
 * v1 supports generator_id='character_video' only. Validation here.
 */

import type { Request, Response } from 'express';
import { supabase } from '../server.js';

const SUPPORTED_GENERATORS = new Set(['character_video', 'text_to_video']);

interface ScheduleBody {
  name?: string;
  generator_id?: string;
  job_params?: Record<string, unknown>;
  caption_template?: string | null;
  cadence_hours?: number;
  postiz_integration_ids?: string[];
  enabled?: boolean;

  // Wizard-shape extras. When present, the server resolves character_source
  // into job_params.character_sheet_url and stuffs brief/caption fields
  // into job_params before the trigger runs.
  character_source?: {
    mode: 'actor' | 'upload' | 'describe' | 'random';
    actor_slug?: string | null;
    reference_image_url?: string | null;
    description?: string;
    random_vibe?: string;
  };
  brief?: string;
  caption_mode?: 'ai' | 'static';
  caption_guidance?: string;

  // Optional reference asset the character holds / displays. When set
  // it becomes a second image_url passed to Seedance 2.0 alongside the
  // character sheet, and the AI prompt / storyboard are told what kind
  // of asset it is so they can pose the character around it.
  asset_type?: 'product' | 'saas_capture' | 'app_screenshot';
  asset_url?: string;

  /** Batch-row mode: a list of per-tick prompts. Each cron tick consumes
   *  one row as that run's brief; the schedule archives itself after the
   *  last row. When omitted the schedule fires recurrently on a single
   *  brief, the way it always has. */
  prompt_rows?: string[];
}

const SUPPORTED_ASSET_TYPES = new Set(['product', 'saas_capture', 'app_screenshot']);

function validateBody(body: ScheduleBody, partial = false): string | null {
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 80) {
      return 'name must be 1–80 characters';
    }
  }
  if (!partial || body.generator_id !== undefined) {
    if (typeof body.generator_id !== 'string' || !SUPPORTED_GENERATORS.has(body.generator_id)) {
      return `generator_id must be one of: ${Array.from(SUPPORTED_GENERATORS).join(', ')}`;
    }
  }
  if (!partial || body.job_params !== undefined) {
    if (!body.job_params || typeof body.job_params !== 'object' || Array.isArray(body.job_params)) {
      return 'job_params must be an object';
    }
    const params = body.job_params as Record<string, unknown>;
    // The schedule must carry a character_sheet_url for character_video.
    // text_to_video schedules skip this entirely — the row IS the prompt.
    //
    // ⚠ Only enforce this on CREATE. PATCH bodies don't include
    // generator_id so we can't tell here whether the schedule is
    // text_to_video — and the row already exists with a valid sheet
    // (or is text_to_video and intentionally has none). Enforcing on
    // PATCH would block every edit of a text_to_video schedule.
    const isTextToVideo = body.generator_id === 'text_to_video';
    if (!partial && !isTextToVideo && !body.character_source) {
      const sheet = params.character_sheet_url;
      if (typeof sheet !== 'string' || !sheet.startsWith('https://')) {
        return 'job_params.character_sheet_url required (https://…) or pass character_source';
      }
    }
    // storyboard_url is optional: when present the runner uses it as a
    // staging reference; when absent the runner uses brief / action_prompt
    // as the Seedance text prompt.
    const storyboard = params.storyboard_url;
    if (storyboard !== undefined && (typeof storyboard !== 'string' || !storyboard.startsWith('https://'))) {
      return 'job_params.storyboard_url, when set, must be an https URL';
    }
    if (params.duration !== undefined && ![5, 10, 15].includes(params.duration as number)) {
      return 'job_params.duration must be 5, 10, or 15';
    }
    if (params.aspect_ratio !== undefined &&
      params.aspect_ratio !== '9:16' && params.aspect_ratio !== '16:9' && params.aspect_ratio !== '1:1') {
      return 'job_params.aspect_ratio must be 9:16 | 16:9 | 1:1';
    }
  }
  if (body.character_source !== undefined) {
    const cs = body.character_source;
    if (!cs || typeof cs !== 'object') return 'character_source must be an object';
    if (!['actor', 'upload', 'describe', 'random'].includes(cs.mode as string)) {
      return 'character_source.mode must be actor | upload | describe | random';
    }
    if (cs.mode === 'actor' && !cs.actor_slug) return 'character_source.actor_slug required for actor mode';
    if (cs.mode === 'upload' && (typeof cs.reference_image_url !== 'string' || !cs.reference_image_url.startsWith('https://'))) {
      return 'character_source.reference_image_url must be an https URL for upload mode';
    }
    if (cs.mode === 'describe' && (typeof cs.description !== 'string' || cs.description.trim().length < 3)) {
      return 'character_source.description required (>=3 chars) for describe mode';
    }
    if (cs.mode === 'random' && (typeof cs.random_vibe !== 'string' || cs.random_vibe.trim().length < 1)) {
      return 'character_source.random_vibe required for random mode';
    }
  }
  if (body.brief !== undefined) {
    if (typeof body.brief !== 'string' || body.brief.trim().length < 20 || body.brief.length > 1000) {
      return 'brief must be 20–1000 characters';
    }
  }
  if (body.prompt_rows !== undefined) {
    if (!Array.isArray(body.prompt_rows)) return 'prompt_rows must be an array of strings';
    if (body.prompt_rows.length === 0) return 'prompt_rows must contain at least one row';
    if (body.prompt_rows.length > 500) return 'prompt_rows capped at 500 entries (tier limit enforced server-side)';
    for (let i = 0; i < body.prompt_rows.length; i++) {
      const r = body.prompt_rows[i];
      if (typeof r !== 'string' || r.trim().length < 20 || r.length > 1000) {
        return `prompt_rows[${i}] must be 20–1000 characters`;
      }
    }
  }
  if (body.generator_id === 'text_to_video') {
    if (!Array.isArray(body.prompt_rows) || body.prompt_rows.length === 0) {
      return 'text_to_video schedules require prompt_rows';
    }
  }
  if (body.caption_mode !== undefined && !['ai', 'static'].includes(body.caption_mode)) {
    return 'caption_mode must be ai | static';
  }
  // Asset is optional, but if asset_type is set, asset_url must be a
  // valid https URL (and vice versa).
  const hasAssetType = body.asset_type !== undefined;
  const hasAssetUrl = body.asset_url !== undefined;
  if (hasAssetType !== hasAssetUrl) {
    return 'asset_type and asset_url must be set together';
  }
  if (hasAssetType) {
    if (typeof body.asset_type !== 'string' || !SUPPORTED_ASSET_TYPES.has(body.asset_type)) {
      return `asset_type must be one of: ${Array.from(SUPPORTED_ASSET_TYPES).join(', ')}`;
    }
    if (typeof body.asset_url !== 'string' || !body.asset_url.startsWith('https://')) {
      return 'asset_url must be an https URL';
    }
  }
  if (!partial || body.cadence_hours !== undefined) {
    if (!Number.isInteger(body.cadence_hours) || (body.cadence_hours as number) < 1 || (body.cadence_hours as number) > 168) {
      return 'cadence_hours must be an integer between 1 and 168';
    }
  }
  if (body.postiz_integration_ids !== undefined && !Array.isArray(body.postiz_integration_ids)) {
    return 'postiz_integration_ids must be an array of strings';
  }
  if (body.caption_template !== undefined && body.caption_template !== null && typeof body.caption_template !== 'string') {
    return 'caption_template must be a string or null';
  }
  return null;
}

/**
 * Resolve a wizard-shape character_source to a sheet URL.
 *
 * v1 only handles actor (looks up actor.portrait_url) and upload
 * (uses reference_image_url verbatim). Describe / random modes
 * generate a brand new portrait + sheet, which takes ~2 minutes —
 * those are out of scope for the synchronous create-schedule
 * endpoint and reject with a helpful message.
 */
async function resolveCharacterSource(
  source: NonNullable<ScheduleBody['character_source']>,
): Promise<{ url: string } | { error: { status: number; code: string; message: string } }> {
  if (source.mode === 'upload') {
    if (typeof source.reference_image_url !== 'string') {
      return { error: { status: 400, code: 'VALIDATION_ERROR', message: 'reference_image_url required' } };
    }
    return { url: source.reference_image_url };
  }
  if (source.mode === 'actor') {
    const slug = source.actor_slug;
    if (typeof slug !== 'string' || slug.length === 0) {
      return { error: { status: 400, code: 'VALIDATION_ERROR', message: 'actor_slug required' } };
    }
    const { data, error } = await supabase
      .from('actors')
      .select('portrait_url')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      return { error: { status: 500, code: 'DATABASE_ERROR', message: error.message } };
    }
    if (!data || typeof data.portrait_url !== 'string') {
      return { error: { status: 404, code: 'ACTOR_NOT_FOUND', message: `Actor "${slug}" not found or has no portrait` } };
    }
    return { url: data.portrait_url };
  }
  // describe / random — paint a portrait then build a sheet. Both
  // gpt-image-2 calls take ~2 min each; can't fit in a sync HTTP
  // round-trip. Telling the user where to go for now.
  return {
    error: {
      status: 400,
      code: 'CHARACTER_SOURCE_UNSUPPORTED',
      message: 'Describe / random character modes will be supported once we wire deferred sheet generation. For now, pick an actor or upload a portrait URL.',
    },
  };
}

function tierError(msg: string): { status: number; code: string; clean: string } {
  // The trigger raises messages like "TIER_SCHEDULES_LIMIT: tier "starter" allows max 1 ..."
  if (msg.startsWith('TIER_SCHEDULES_LIMIT:')) {
    return { status: 402, code: 'TIER_SCHEDULES_LIMIT', clean: msg.replace(/^TIER_SCHEDULES_LIMIT:\s*/, '') };
  }
  if (msg.startsWith('TIER_CADENCE_LIMIT:')) {
    return { status: 402, code: 'TIER_CADENCE_LIMIT', clean: msg.replace(/^TIER_CADENCE_LIMIT:\s*/, '') };
  }
  if (msg.startsWith('TIER_ROWS_LIMIT:')) {
    return { status: 402, code: 'TIER_ROWS_LIMIT', clean: msg.replace(/^TIER_ROWS_LIMIT:\s*/, '') };
  }
  return { status: 500, code: 'DATABASE_ERROR', clean: msg };
}

export async function listSchedulesRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }); return; }

  const { data, error } = await supabase
    .from('video_schedules')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: { code: 'DATABASE_ERROR', message: error.message } }); return; }
  res.status(200).json({ schedules: data ?? [] });
}

export async function createScheduleRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }); return; }

  const body = (req.body ?? {}) as ScheduleBody;
  const validationErr = validateBody(body, false);
  if (validationErr) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationErr } });
    return;
  }

  // Build the final job_params: caller's existing fields + resolved
  // character source + brief / caption fields from the wizard shape.
  // text_to_video schedules skip character resolution entirely.
  const jobParams: Record<string, unknown> = { ...(body.job_params as Record<string, unknown>) };
  if (body.character_source && body.generator_id !== 'text_to_video') {
    const resolved = await resolveCharacterSource(body.character_source);
    if ('error' in resolved) {
      res.status(resolved.error.status).json({ error: { code: resolved.error.code, message: resolved.error.message } });
      return;
    }
    jobParams.character_sheet_url = resolved.url;
    jobParams.character_source = body.character_source; // retained for audit / future deferred sheet gen
  }
  if (typeof body.brief === 'string') jobParams.brief = body.brief.trim();
  if (typeof body.caption_mode === 'string') jobParams.caption_mode = body.caption_mode;
  if (typeof body.caption_guidance === 'string') jobParams.caption_guidance = body.caption_guidance.trim();
  if (body.asset_type && body.asset_url) {
    jobParams.asset_type = body.asset_type;
    jobParams.asset_url = body.asset_url;
  }

  // Trim + drop empty rows so the insert + tier-check trigger see
  // exactly what will fire.
  const cleanRows = Array.isArray(body.prompt_rows)
    ? body.prompt_rows.map((r) => r.trim()).filter((r) => r.length > 0)
    : null;

  const { data, error } = await supabase
    .from('video_schedules')
    .insert({
      user_id: userId,
      name: body.name!.trim(),
      generator_id: body.generator_id!,
      job_params: jobParams,
      caption_template: body.caption_template ?? null,
      cadence_hours: body.cadence_hours!,
      postiz_integration_ids: body.postiz_integration_ids ?? [],
      enabled: body.enabled ?? true,
      next_run_at: new Date().toISOString(), // first fire on the next cron tick
      ...(cleanRows && cleanRows.length > 0
        ? { prompt_rows: cleanRows, prompt_cursor: 0 }
        : {}),
    })
    .select('*')
    .single();
  if (error) {
    const t = tierError(error.message);
    res.status(t.status).json({ error: { code: t.code, message: t.clean } });
    return;
  }
  res.status(201).json({ schedule: data });
}

export async function updateScheduleRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }); return; }
  const id = req.params.id;

  const body = (req.body ?? {}) as ScheduleBody;
  const validationErr = validateBody(body, true);
  if (validationErr) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationErr } });
    return;
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined)            update.name = body.name.trim();
  if (body.job_params !== undefined)      update.job_params = body.job_params;
  if (body.caption_template !== undefined) update.caption_template = body.caption_template;
  if (body.cadence_hours !== undefined)   update.cadence_hours = body.cadence_hours;
  if (body.postiz_integration_ids !== undefined) update.postiz_integration_ids = body.postiz_integration_ids;
  if (body.enabled !== undefined)         update.enabled = body.enabled;
  if (body.prompt_rows !== undefined) {
    // Trim + drop empty rows so the trigger's row-count check sees the
    // same shape that will be consumed at fire time. Reset cursor to 0
    // — if the user edited the row list we should not skip past new
    // entries by carrying the old position.
    const clean = body.prompt_rows.map((r) => r.trim()).filter((r) => r.length > 0);
    update.prompt_rows = clean.length > 0 ? clean : null;
    update.prompt_cursor = 0;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'no fields to update' } });
    return;
  }

  const { data, error } = await supabase
    .from('video_schedules')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId) // belt-and-braces: RLS already enforces this
    .is('archived_at', null)
    .select('*')
    .single();
  if (error) {
    const t = tierError(error.message);
    res.status(t.status).json({ error: { code: t.code, message: t.clean } });
    return;
  }
  if (!data) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    return;
  }
  res.status(200).json({ schedule: data });
}

/**
 * POST /v1/schedules/:id/trigger
 *
 * Force-fires a schedule immediately by calling the schedule-runner
 * edge function with { schedule_id }. Returns the created job_id so
 * the UI can link the user straight to /jobs.
 *
 * Bypasses next_run_at and enabled filters at the runner level, but
 * we still check ownership here.
 */
export async function triggerScheduleRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }); return; }
  const id = req.params.id;

  // Ownership + existence check.
  const { data: sched, error: lookupErr } = await supabase
    .from('video_schedules')
    .select('id, user_id, archived_at')
    .eq('id', id)
    .eq('user_id', userId)
    .is('archived_at', null)
    .maybeSingle();
  if (lookupErr) { res.status(500).json({ error: { code: 'DATABASE_ERROR', message: lookupErr.message } }); return; }
  if (!sched) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } }); return; }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: { code: 'SERVER_MISCONFIGURED', message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' } });
    return;
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/schedule-runner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ schedule_id: id }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await upstream.text();
    let data: { ok?: boolean; fired?: number; failures?: Array<{ reason?: string }>; job_ids?: Array<{ job_id: string }> } | null = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!upstream.ok || !data) {
      const msg = (data && typeof (data as { error?: unknown }).error === 'string') ? (data as { error: string }).error : `schedule-runner HTTP ${upstream.status}`;
      res.status(502).json({ error: { code: 'TRIGGER_FAILED', message: msg } });
      return;
    }
    if ((data.fired ?? 0) === 0) {
      const reason = data.failures?.[0]?.reason ?? 'no job created';
      res.status(409).json({ error: { code: 'TRIGGER_SKIPPED', message: reason } });
      return;
    }
    const jobId = data.job_ids?.[0]?.job_id ?? null;
    res.status(202).json({ ok: true, job_id: jobId });
  } catch (err) {
    res.status(502).json({ error: { code: 'UPSTREAM_UNREACHABLE', message: (err as Error).message } });
  }
}

export async function deleteScheduleRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as unknown as { userId?: string }).userId;
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }); return; }
  const id = req.params.id;

  const { error } = await supabase
    .from('video_schedules')
    .update({ archived_at: new Date().toISOString(), enabled: false })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: error.message } });
    return;
  }
  res.status(204).send();
}
