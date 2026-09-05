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
import { V2_MODELS, liveModels, type V2ModelRecord } from '@agentmedia/schema/v2';

const PUBLIC_DOCS_BASE =
  process.env.PUBLIC_DOCS_BASE ?? 'https://github.com/gitroomhq/agent-media-app/blob/main';

function publicView(m: V2ModelRecord) {
  return {
    id: m.id,
    kind: m.kind,
    tier: m.tier,
    status: m.status,
    provider: m.provider,
    modes: m.modes,
    features: m.features,
    limits: m.limits,
    // What the user pays. Absent on candidates on purpose.
    credits: m.credits ?? null,
    quality: m.quality,
    speed: m.speed,
    best_for: m.bestFor,
    avoid_for: m.avoidFor,
    docs_url: `${PUBLIC_DOCS_BASE}/${m.docs}`,
    verified: m.verified ?? null,
    // How to select it today. Video engines are selectable on the v2
    // generators (selfie, crazy_look) via `engine`, on the CLI via --engine,
    // and on REST /v2/*. make_ugc does NOT take an engine yet (P2). Say so,
    // or an agent will pass a field that is silently ignored.
    select_with:
      m.kind === 'video' && m.status === 'live'
        ? {
            field: 'engine',
            value: m.id,
            on: ['agent-media selfie --engine', 'agent-media crazy-look --engine', 'POST /v2/selfie', 'POST /v2/crazy-look'],
            not_on: ['make_ugc, and therefore the hosted MCP connector, until P2 (always seedance-2.0)'],
          }
        : null,
  };
}

export function listModelsRoute(req: Request, res: Response): void {
  const include = String((req.query as { include?: string }).include ?? '');
  const withCandidates = include.split(',').map((s) => s.trim()).includes('candidates');
  const models = withCandidates
    ? Object.values(V2_MODELS).filter((m) => m.status !== 'retired')
    : liveModels();
  res.status(200).json({
    models: models.map(publicView),
    count: models.length,
    default_video_model: 'seedance-2.0',
    note: 'Credits: 1 credit = $0.01. Video models bill per second of output. Candidates have no price and cannot be selected.',
  });
}
