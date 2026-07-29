// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * schedule-runner edge function — pg_cron's "tick" target.
 *
 * Runs every 5 minutes (registered in 20260510160000_schedules.sql).
 * Picks up due schedules (enabled, archived_at NULL, next_run_at <= now())
 * and creates a generation_jobs row + dispatches to the worker queue
 * for each one. Bumps next_run_at += cadence_hours after success.
 *
 * The job's input_params carry schedule_id + postiz_integration_ids so:
 *   - the /jobs dashboard finds them (filters by input_params.schedule_id)
 *   - the webhook-provider edge function fans out to the right Postiz
 *     integrations on completion (uses input_params.postiz_integration_ids
 *     when present, else falls back to profiles.postiz_default_integrations).
 *
 * v1 supports character_video only. Other generator_ids are rejected
 * at the schedule level (validation in api-v2 + runner skip here).
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureEdgeError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SUPPORTED_GENERATORS = new Set(['character_video', 'text_to_video']);

interface ScheduleRow {
  id: string;
  user_id: string;
  name: string;
  generator_id: string;
  job_params: Record<string, unknown>;
  caption_template: string | null;
  cadence_hours: number;
  postiz_integration_ids: string[];
  enabled: boolean;
  next_run_at: string;
  failure_count: number;
  /** When non-null, schedule consumes one row per tick. Each row becomes
   *  the brief for that run; cursor advances on success; schedule auto-
   *  archives when cursor reaches length. */
  prompt_rows: string[] | null;
  prompt_cursor: number;
}

const FAILURE_AUTO_DISABLE_THRESHOLD = 5;

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function creditCostFor(generatorId: string, params: Record<string, unknown>): number {
  // Same cost basis for both character_video and text_to_video — both
  // are EvoLink Seedance 2.0 at 720p ($0.199/sec, 72% margin).
  if (generatorId === 'character_video' || generatorId === 'text_to_video') {
    const duration = Number(params.duration ?? 10);
    if (duration === 5) return 350;
    if (duration === 15) return 1050;
    return 700;
  }
  throw new Error(`unsupported generator_id: ${generatorId}`);
}

function dispatchTargetFor(generatorId: string): string {
  if (generatorId === 'character_video') return 'character-video';
  if (generatorId === 'text_to_video') return 'text-to-video';
  throw new Error(`unsupported generator_id: ${generatorId}`);
}

async function processOne(db: SupabaseClient, sched: ScheduleRow): Promise<{ ok: boolean; reason?: string }> {
  if (!SUPPORTED_GENERATORS.has(sched.generator_id)) {
    return { ok: false, reason: `unsupported generator: ${sched.generator_id}` };
  }
  // Batch-row mode: this tick's brief comes from prompt_rows[cursor],
  // overriding job_params.brief. If the cursor is already past the end,
  // we exit cleanly so bumpSuccess can archive without dispatching a job.
  const baseParams = sched.job_params ?? {};
  const params: Record<string, unknown> = (() => {
    const rows = sched.prompt_rows;
    if (!Array.isArray(rows) || rows.length === 0) return baseParams;
    const row = rows[sched.prompt_cursor];
    if (typeof row !== 'string' || !row.trim()) return baseParams;
    return { ...baseParams, brief: row, action_prompt: row };
  })();

  // For character_video the schedule must carry a sheet URL. Storyboard
  // is optional now: when absent, the worker uses brief / action_prompt
  // as the Seedance text prompt with no staging-grid reference. AI
  // per-run storyboard regeneration lands in a follow-up.
  const characterSheetUrl = params['character_sheet_url'];
  const storyboardUrl = params['storyboard_url'];
  const assetUrl = params['asset_url'];
  const assetType = params['asset_type'];
  if (sched.generator_id === 'character_video') {
    if (typeof characterSheetUrl !== 'string' || !characterSheetUrl.startsWith('https://')) {
      return { ok: false, reason: 'character_sheet_url missing or not https' };
    }
    if (storyboardUrl !== undefined && (typeof storyboardUrl !== 'string' || !storyboardUrl.startsWith('https://'))) {
      return { ok: false, reason: 'storyboard_url, when set, must be an https URL' };
    }
    if (assetUrl !== undefined && (typeof assetUrl !== 'string' || !assetUrl.startsWith('https://'))) {
      return { ok: false, reason: 'asset_url, when set, must be an https URL' };
    }
  }

  let cost: number;
  try {
    cost = creditCostFor(sched.generator_id, params);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  // Pull the last 10 topics this schedule has already posted so the
  // worker's script-generation step can avoid repeating itself.
  const { data: recentRows } = await db
    .from('generation_jobs')
    .select('input_params')
    .eq('input_params->>schedule_id', sched.id)
    .order('created_at', { ascending: false })
    .limit(10);
  const recentTopics: string[] = (recentRows ?? [])
    .map((r) => (r.input_params as Record<string, unknown> | null)?.run_topic)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  const jobId = crypto.randomUUID();
  const inputParams: Record<string, unknown> = {
    ...params,
    // Tags so /jobs filters this in and webhook-provider can route the
    // Postiz fanout to the schedule's chosen integrations.
    schedule_id: sched.id,
    schedule_run_at: new Date().toISOString(),
    ...(sched.postiz_integration_ids.length > 0
      ? { postiz_integration_ids: sched.postiz_integration_ids }
      : {}),
    ...(sched.caption_template ? { caption: sched.caption_template } : {}),
  };

  // 1. Insert generation_jobs row in 'submitted' state.
  const promptText = (sched.caption_template
    ?? (typeof params['action_prompt'] === 'string' ? params['action_prompt'] : '')
    ?? '').toString().slice(0, 500) || `[schedule: ${sched.name}]`;

  const { error: insertErr } = await db.from('generation_jobs').insert({
    id: jobId,
    user_id: sched.user_id,
    model_slug:
      sched.generator_id === 'character_video' ? 'character-video' :
      sched.generator_id === 'text_to_video' ? 'text-to-video' :
      sched.generator_id,
    operation: sched.generator_id,
    status: 'submitted',
    prompt: promptText,
    credit_cost: cost,
    provider_slug: 'railway',
    provider_job_id: jobId,
    input_params: inputParams,
  });
  if (insertErr) {
    return { ok: false, reason: `insert generation_jobs failed: ${insertErr.message}` };
  }

  // 2. Deduct credits.
  const { error: deductErr } = await db.rpc('deduct_credits', {
    p_user_id: sched.user_id,
    p_amount: cost,
    p_job_id: jobId,
    p_description: `Schedule "${sched.name}"`,
  });
  if (deductErr) {
    // Roll back the job row so we don't leave an orphan.
    await db.from('generation_jobs').delete().eq('id', jobId);
    return { ok: false, reason: `deduct_credits failed: ${deductErr.message}` };
  }

  // 3. Dispatch via pgmq. Body shape depends on the pipeline:
  //   - text_to_video: just the prompt + Seedance params (no image refs)
  //   - character_video: sheet + optional storyboard + asset + brief
  const commonBody = {
    job_id: jobId,
    user_id: sched.user_id,
    duration: Number(params['duration'] ?? 10),
    aspect_ratio: typeof params['aspect_ratio'] === 'string' ? params['aspect_ratio'] : '9:16',
    generate_audio: params['generate_audio'] !== false,
    callback_url: `${SUPABASE_URL}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`,
  };

  const body = sched.generator_id === 'text_to_video'
    ? {
        ...commonBody,
        // The row is the entire prompt — feed it verbatim. brief and
        // action_prompt both point at it (rows mode set both above).
        prompt:
          (typeof params['brief'] === 'string' && params['brief']) ||
          (typeof params['action_prompt'] === 'string' && params['action_prompt']) ||
          '',
      }
    : {
        ...commonBody,
        character_sheet_url: characterSheetUrl,
        ...(typeof storyboardUrl === 'string' ? { storyboard_url: storyboardUrl } : {}),
        ...(typeof assetUrl === 'string' ? { asset_image_url: assetUrl } : {}),
        ...(typeof assetType === 'string' ? { asset_type: assetType } : {}),
        ...(params['character_source'] && typeof params['character_source'] === 'object'
          ? { character_source: params['character_source'] }
          : {}),
        ...(typeof params['brief'] === 'string' ? { brief: params['brief'] } : {}),
        ...(recentTopics.length > 0 ? { recent_topics: recentTopics } : {}),
        ...(typeof params['action_prompt'] === 'string'
          ? { action_prompt: params['action_prompt'] }
          : typeof params['brief'] === 'string'
            ? { action_prompt: params['brief'] }
            : {}),
      };

  const dispatchPayload = {
    job_id: jobId,
    target: dispatchTargetFor(sched.generator_id),
    generator_id: sched.generator_id,
    body,
    enqueued_at: new Date().toISOString(),
  };

  const { error: enqueueErr } = await db.rpc('pgmq_dispatch_send', { payload: dispatchPayload });
  if (enqueueErr) {
    // Refund and mark failed — worker will never see it.
    await db.rpc('refund_credits', { p_job_id: jobId }).then(() => {}, () => {});
    await db.from('generation_jobs').update({
      status: 'failed',
      error_message: `pgmq dispatch failed: ${enqueueErr.message}`,
      error_code: 'WORKER_DISPATCH_FAILED',
    }).eq('id', jobId);
    return { ok: false, reason: `pgmq_dispatch_send failed: ${enqueueErr.message}` };
  }

  return { ok: true };
}

async function bumpSuccess(db: SupabaseClient, sched: ScheduleRow, jobId: string | null): Promise<void> {
  const next = new Date(Date.now() + sched.cadence_hours * 60 * 60 * 1000).toISOString();
  const update: Record<string, unknown> = {
    next_run_at: next,
    last_run_at: new Date().toISOString(),
    last_run_job_id: jobId,
    failure_count: 0,
  };
  // Batch-row mode: advance cursor, archive when we've consumed every row.
  if (Array.isArray(sched.prompt_rows) && sched.prompt_rows.length > 0) {
    const nextCursor = sched.prompt_cursor + 1;
    update.prompt_cursor = nextCursor;
    if (nextCursor >= sched.prompt_rows.length) {
      update.archived_at = new Date().toISOString();
      update.enabled = false;
    }
  }
  await db.from('video_schedules').update(update).eq('id', sched.id);
}

async function bumpFailure(db: SupabaseClient, sched: ScheduleRow, reason: string): Promise<void> {
  const failures = sched.failure_count + 1;
  // Auto-disable after N consecutive failures so we don't keep burning
  // (and refunding) credits every 5 minutes.
  const update: Record<string, unknown> = {
    last_run_at: new Date().toISOString(),
    failure_count: failures,
  };
  if (failures >= FAILURE_AUTO_DISABLE_THRESHOLD) {
    update.enabled = false;
  } else {
    // Push the next attempt out by the cadence so we don't retry every
    // 5 min. We could implement exponential backoff later.
    update.next_run_at = new Date(Date.now() + sched.cadence_hours * 60 * 60 * 1000).toISOString();
  }
  console.warn(`schedule-runner: schedule ${sched.id} failure (${failures}): ${reason}`);
  await db.from('video_schedules').update(update).eq('id', sched.id);
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResp(500, { error: 'SUPABASE_URL or SERVICE_ROLE_KEY missing' });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResp(405, { error: 'Method not allowed' });
  }

  // FIX 5 (H1): permissive-until-configured inbound auth. With SCHEDULE_RUNNER_SECRET
  // unset this is a no-op (deploys without breaking callers); once the secret is set
  // and callers send the header, unauthenticated force-fire (forced spend on a
  // victim's schedule) is rejected.
  const RUNNER_SECRET = Deno.env.get('SCHEDULE_RUNNER_SECRET');
  if (RUNNER_SECRET && req.headers.get('x-schedule-runner-secret') !== RUNNER_SECRET) {
    return jsonResp(401, { error: 'unauthorized' });
  }

  // Force-fire mode: POST { schedule_id: '<uuid>' } picks that one schedule
  // regardless of next_run_at, so api-v2 can implement Trigger Now without
  // duplicating runner logic.
  let forceScheduleId: string | null = null;
  if (req.method === 'POST') {
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body === 'object' && typeof body.schedule_id === 'string') {
        forceScheduleId = body.schedule_id;
      }
    } catch { /* ignore — no body is fine */ }
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  const query = db
    .from('video_schedules')
    .select('id, user_id, name, generator_id, job_params, caption_template, cadence_hours, postiz_integration_ids, enabled, next_run_at, failure_count, prompt_rows, prompt_cursor')
    .is('archived_at', null);

  // Force-fire bypasses enabled + next_run_at filters; cron-tick path enforces them.
  const { data: due, error: queryErr } = forceScheduleId
    ? await query.eq('id', forceScheduleId).limit(1)
    : await query.eq('enabled', true).lte('next_run_at', new Date().toISOString()).order('next_run_at', { ascending: true }).limit(50);

  if (queryErr) {
    await captureEdgeError(new Error(queryErr.message), 'schedule-runner', { phase: 'query_due' });
    return jsonResp(500, { error: `query due schedules: ${queryErr.message}` });
  }
  if (forceScheduleId && (!due || due.length === 0)) {
    return jsonResp(404, { error: `schedule ${forceScheduleId} not found or archived` });
  }

  const results = {
    picked_up: due?.length ?? 0,
    fired: 0,
    skipped: 0,
    failures: [] as Array<{ schedule_id: string; reason: string }>,
    job_ids: [] as Array<{ schedule_id: string; job_id: string }>,
  };

  for (const s of (due ?? []) as ScheduleRow[]) {
    try {
      const out = await processOne(db, s);
      if (out.ok) {
        results.fired += 1;
        // We don't get the job_id back from processOne; fetch the most recent.
        // Cheap: same id was just minted but we didn't bubble it up. Rather
        // than refactor, query for the most recent schedule_id-tagged job.
        const { data: lastJob } = await db
          .from('generation_jobs')
          .select('id')
          .eq('input_params->>schedule_id', s.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const jobId = (lastJob?.id as string | undefined) ?? null;
        if (jobId) results.job_ids.push({ schedule_id: s.id, job_id: jobId });
        await bumpSuccess(db, s, jobId);
      } else {
        results.skipped += 1;
        results.failures.push({ schedule_id: s.id, reason: out.reason ?? 'unknown' });
        await bumpFailure(db, s, out.reason ?? 'unknown');
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.skipped += 1;
      results.failures.push({ schedule_id: s.id, reason });
      await bumpFailure(db, s, reason);
      // A scheduled video that silently fails to fire is a real user-facing
      // issue (their automation didn't run) — surface it.
      await captureEdgeError(err, 'schedule-runner', { schedule_id: s.id });
    }
  }

  return jsonResp(200, {
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    ...results,
  });
});
