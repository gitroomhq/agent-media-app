// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /v1/me/gallery — merged "Recent generations" feed for the
 * authenticated user. Combines legacy `generation_jobs` and vNext
 * `primitive_runs` + `primitive_artifacts` into one date-sorted list.
 *
 * Each row has a stable shape regardless of source so the frontend can
 * render a single grid.
 */

import type { Request, Response } from 'express';
import { supabase } from '../../server.js';

interface GalleryItem {
  id: string;
  source: 'legacy' | 'vnext_primitive' | 'vnext_skill';
  primitive: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  prompt: string | null;
  credits_deducted: number;
}

export async function getMyGalleryRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? '40'), 10) || 40, 1),
    100,
  );
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
  const filter = String(req.query.filter ?? 'all').toLowerCase();
  const primitiveFilter = req.query.primitive ? String(req.query.primitive) : null;
  const skillFilter = req.query.skill ? String(req.query.skill) : null;
  // We fetch limit+offset from each source so we have enough rows to
  // merge, sort, and slice the requested page.
  const fetchCap = Math.min(limit + offset, 200);

  // ── Legacy generation_jobs (completed only, videos preferred)
  const { data: legacy, error: legacyErr } = await supabase
    .from('generation_jobs')
    .select(
      'id, model_slug, operation, status, prompt, output_media_url, output_thumbnail_url, duration_seconds, created_at, credit_cost',
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(fetchCap);
  // 42P01 = table missing → tolerate.
  if (legacyErr && legacyErr.code !== '42P01') {
    res.status(500).json({ error: 'legacy_lookup_failed', detail: legacyErr.message });
    return;
  }

  // ── vNext: skill_runs + their joined primitive_runs/artifacts
  const { data: skillRuns, error: skillErr } = await supabase
    .from('skill_runs')
    .select(
      'id, skill_slug, skill_version, status, current_step, started_at, finished_at, created_at, final_output, credits_deducted_total:primitive_runs(credits_deducted)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(fetchCap);
  if (skillErr && skillErr.code !== '42P01') {
    res.status(500).json({ error: 'skill_runs_lookup_failed', detail: skillErr.message });
    return;
  }

  // ── vNext: standalone primitive_runs (no skill_run_id)
  const { data: primitiveRuns, error: primErr } = await supabase
    .from('primitive_runs')
    .select(
      'id, primitive_id, status, started_at, finished_at, created_at, credits_deducted, input, primitive_artifacts(url, kind, mime, bytes)',
    )
    .eq('user_id', userId)
    .is('skill_run_id', null)
    .order('created_at', { ascending: false })
    .limit(fetchCap);
  if (primErr && primErr.code !== '42P01') {
    res.status(500).json({ error: 'primitive_runs_lookup_failed', detail: primErr.message });
    return;
  }

  const items: GalleryItem[] = [];

  for (const row of legacy ?? []) {
    items.push({
      id: row.id as string,
      source: 'legacy',
      primitive: (row.operation as string | null) ?? null,
      status: (row.status as string) ?? 'unknown',
      created_at: row.created_at as string,
      finished_at: null,
      media_url: (row.output_media_url as string | null) ?? null,
      thumbnail_url: (row.output_thumbnail_url as string | null) ?? null,
      duration_seconds: (row.duration_seconds as number | null) ?? null,
      prompt: (row.prompt as string | null) ?? null,
      credits_deducted: Number(row.credit_cost ?? 0),
    });
  }

  for (const row of skillRuns ?? []) {
    const out = (row.final_output as any) || {};
    const totalCredits = ((row.credits_deducted_total as any) || []).reduce(
      (s: number, c: any) => s + Number(c?.credits_deducted ?? 0),
      0,
    );
    items.push({
      id: row.id as string,
      source: 'vnext_skill',
      primitive: (row.skill_slug as string) ?? null,
      status: (row.status as string) ?? 'unknown',
      created_at: row.created_at as string,
      finished_at: (row.finished_at as string | null) ?? null,
      media_url: out.video_url ?? out.character_sheet_url ?? out.portrait_url ?? null,
      thumbnail_url: out.character_sheet_url ?? out.portrait_url ?? null,
      duration_seconds: (out.duration_seconds as number | null) ?? null,
      prompt: null,
      credits_deducted: totalCredits,
    });
  }

  for (const row of primitiveRuns ?? []) {
    const artifacts = (row.primitive_artifacts as Array<{ url: string; kind: string; mime: string | null }> | null) ?? [];
    const main = artifacts[0];
    items.push({
      id: row.id as string,
      source: 'vnext_primitive',
      primitive: (row.primitive_id as string) ?? null,
      status: (row.status as string) ?? 'unknown',
      created_at: row.created_at as string,
      finished_at: (row.finished_at as string | null) ?? null,
      media_url: main?.url ?? null,
      thumbnail_url: main?.kind === 'selfie_video' ? null : (main?.url ?? null),
      duration_seconds: (row.input as any)?.duration ?? null,
      prompt:
        (row.input as any)?.description ??
        (row.input as any)?.script ??
        null,
      credits_deducted: Number(row.credits_deducted ?? 0),
    });
  }

  // Filter by tab — "selfies" keeps only video-output sources.
  let filtered = items;
  if (filter === 'selfies') {
    filtered = items.filter(
      (it) =>
        it.primitive === 'selfie' ||
        it.primitive === 'simple_selfie' ||
        it.primitive === 'make_ugc_video',
    );
  }
  if (primitiveFilter) {
    filtered = filtered.filter((it) => it.primitive === primitiveFilter);
  }
  if (skillFilter) {
    filtered = filtered.filter((it) => it.primitive === skillFilter);
  }

  filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  res.status(200).json({ items: page, offset, limit, returned: page.length, has_more: total > offset + limit });
}
