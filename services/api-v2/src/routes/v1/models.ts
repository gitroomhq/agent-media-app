// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /v1/models — the model catalog, as an agent should read it.
 *
 * Returns live models by default: the ones selectable in the API today,
 * each with what it costs the user, what it is good and bad at, its
 * limits, and whether a real run has verified it. `?include=candidates`
 * adds the planned models (no user price, not selectable) so a client can
 * show the roadmap without ever letting an agent pick one.
 *
 * Read-only, no credits. The numbers come from packages/schema so they
 * cannot drift from the debit; a test in the schema package enforces it.
 */

import type { Request, Response } from 'express';
import { V2_MODELS, V2_DEFAULT_MODEL, liveModels, type ModelStatsMap } from '@agentmedia/schema/v2';
import { supabase } from '../../server.js';
import { AUTO_POLICY, publicView } from '../../lib/model-view.js';

/**
 * The last 30 days per model, from public.model_stats (P3). Cached for a
 * minute: the route is public and the view scans a month of jobs. A
 * failed read yields an empty map — the catalog must never 500 because
 * the stats did.
 */
const STATS_TTL_MS = 60_000;
let statsCache: { at: number; map: ModelStatsMap } | null = null;

export async function loadModelStats(): Promise<ModelStatsMap> {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.map;
  const map: ModelStatsMap = {};
  try {
    const { data, error } = await supabase.from('model_stats').select('*');
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      map[String(r.model_slug)] = {
        runs: Number(r.runs ?? 0),
        failed: Number(r.failed ?? 0),
        avg_auto_score: num(r.avg_auto_score),
        scored: Number(r.scored ?? 0),
        avg_user_score: num(r.avg_user_score),
        rated: Number(r.rated ?? 0),
        p50_seconds: num(r.p50_seconds),
        avg_credits: num(r.avg_credits),
      };
    }
    statsCache = { at: Date.now(), map };
  } catch (err) {
    console.warn(`[models] model_stats unavailable: ${(err as Error).message}`);
  }
  return map;
}

export async function listModelsRoute(req: Request, res: Response): Promise<void> {
  const include = String((req.query as { include?: string }).include ?? '');
  const withCandidates = include.split(',').map((s) => s.trim()).includes('candidates');
  const models = withCandidates
    ? Object.values(V2_MODELS).filter((m) => m.status !== 'retired')
    : liveModels();
  const stats = await loadModelStats();
  res.status(200).json({
    models: models.map((m) => publicView(m, stats)),
    count: models.length,
    default_video_model: V2_DEFAULT_MODEL.video,
    defaults: V2_DEFAULT_MODEL,
    auto_policy: AUTO_POLICY,
    note: 'Credits: 1 credit = $0.01. Video models bill per second of output. Candidates have no price and cannot be selected. `recent` is the last 30 days of loose-surface jobs; null until a model has run.',
  });
}
