// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The public shape of a catalog model — what GET /v1/models returns and
 * what the website's docs render. Pure (no supabase), so the site-data
 * generator and the route share one definition.
 */

import {
  V2_DEFAULT_MODEL,
  AUTO_MAX_FAIL_RATE,
  AUTO_MAX_PRICE_RATIO,
  AUTO_MIN_GAIN,
  AUTO_MIN_SCORED,
  type ModelRecentStats,
  type ModelStatsMap,
  type V2ModelRecord,
} from '@agentmedia/schema/v2';

const PUBLIC_DOCS_BASE =
  process.env.PUBLIC_DOCS_BASE ?? 'https://github.com/gitroomhq/agent-media-app/blob/main';

/** The `recent` block an agent sees. Rounded so it reads as a fact, not a spreadsheet. */
export function recentView(s: ModelRecentStats | undefined) {
  if (!s || s.runs === 0) return null;
  return {
    window_days: 30,
    runs: s.runs,
    fail_rate: s.runs ? Number((s.failed / s.runs).toFixed(2)) : null,
    auto_score: s.avg_auto_score === null ? null : Number(s.avg_auto_score.toFixed(2)),
    scored: s.scored,
    user_score: s.avg_user_score === null ? null : Number(s.avg_user_score.toFixed(1)),
    rated: s.rated,
    p50_seconds: s.p50_seconds === null ? null : Math.round(s.p50_seconds),
  };
}

/** The auto policy, printed once so an agent can reason about it. */
export const AUTO_POLICY =
  `model:"auto" starts from the kind's default (${Object.entries(V2_DEFAULT_MODEL).map(([k, v]) => `${k}: ${v}`).join(', ')}); ` +
  `switches only when the default failed >${Math.round(AUTO_MAX_FAIL_RATE * 100)}% of >=${AUTO_MIN_SCORED} runs and another live model is healthy, ` +
  `or when a live model within ${AUTO_MAX_PRICE_RATIO}x the default's price beats its auto score by >=${AUTO_MIN_GAIN} over >=${AUTO_MIN_SCORED} judged runs. ` +
  'Scores come from an auto-judge that grades every loose-surface job (3 frames or the image against the realism rubric, prompt adherence, identity match) plus rate_run.';


export function publicView(m: V2ModelRecord, stats: ModelStatsMap) {
  return {
    recent: recentView(stats[m.id]),
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
    // How to select it. Every live model is selectable by id as `model` on
    // the loose surface (generate_<kind> over MCP, POST /v2/generate/<kind>).
    // Live VIDEO models are additionally the `engine` of the fixed video
    // skills (selfie, crazy_look) on REST and the CLI. make_ugc takes no
    // engine. Say exactly where, or an agent passes a field that is
    // silently ignored.
    select_with:
      m.status === 'live'
        ? {
            field: 'model',
            value: m.id,
            on: [
              `generate_${m.kind} (MCP)`,
              `POST /v2/generate/${m.kind}`,
              ...(m.kind === 'video'
                ? ['as `engine` on: agent-media selfie --engine', 'agent-media crazy-look --engine', 'POST /v2/selfie', 'POST /v2/crazy-look']
                : []),
            ],
            not_on: m.kind === 'video' ? ['make_ugc (always seedance-2.0)'] : [],
          }
        : null,
  };
}

