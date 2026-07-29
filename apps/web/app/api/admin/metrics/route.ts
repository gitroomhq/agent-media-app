// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isAdminEmail } from '@/lib/admin-allowlist';


const WORKER_V2_URL = process.env.WORKER_V2_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

interface JobRow {
  id: string;
  user_id: string;
  status: string;
  operation: string | null;
  model_slug: string | null;
  prompt: string | null;
  created_at: string;
  completed_at: string | null;
  credit_cost: number | null;
  provider_cost_usd: number | null;
  error_code: string | null;
  error_message: string | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function durationSeconds(job: JobRow): number | null {
  if (!job.completed_at) return null;
  const start = Date.parse(job.created_at);
  const end = Date.parse(job.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / 1000;
}

/** Best-effort fetch of worker /health — surfaces per-key limiter status. */
async function fetchWorkerHealth(): Promise<unknown> {
  if (!WORKER_V2_URL) return { error: 'WORKER_V2_URL not configured' };
  try {
    const resp = await fetch(`${WORKER_V2_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
      headers: WORKER_SECRET ? { 'X-Worker-Secret': WORKER_SECRET } : {},
    });
    if (!resp.ok) return { error: `worker /health returned ${resp.status}` };
    return await resp.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'worker /health unreachable' };
  }
}

/** Bucket jobs into per-hour buckets for the last 24h. */
function bucketByHour(rows: JobRow[]): { hour: string; total: number; completed: number; failed: number }[] {
  const buckets = new Map<string, { total: number; completed: number; failed: number }>();
  // Pre-fill last 24 hours so empty hours show as zero
  const now = new Date();
  for (let i = 23; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    buckets.set(d.toISOString(), { total: 0, completed: 0, failed: 0 });
  }
  for (const j of rows) {
    const d = new Date(j.created_at);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    if (j.status === 'completed') b.completed += 1;
    if (j.status === 'failed') b.failed += 1;
  }
  return [...buckets.entries()].map(([hour, c]) => ({ hour, ...c }));
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = Date.now();
  const last1h = new Date(now - 60 * 60 * 1000).toISOString();
  const last24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [
    queueDepthRes,
    queueStatusRes,
    rows7dRes,
    recentJobsRes,
    recentErrorsRes,
    workerHealth,
  ] = await Promise.all([
    admin
      .from('generation_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'submitted', 'generating']),
    admin
      .from('generation_dispatch_status')
      .select('depth, oldest_age_seconds, newest_age_seconds')
      .maybeSingle(),
    admin
      .from('generation_jobs')
      .select('id, user_id, status, operation, model_slug, prompt, created_at, completed_at, credit_cost, provider_cost_usd, error_code, error_message')
      .gte('created_at', last7d)
      .order('created_at', { ascending: false }),
    admin
      .from('generation_jobs')
      .select('id, user_id, status, operation, model_slug, prompt, created_at, completed_at, credit_cost, provider_cost_usd, error_code, error_message')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('generation_jobs')
      .select('id, user_id, status, operation, model_slug, prompt, created_at, completed_at, credit_cost, provider_cost_usd, error_code, error_message')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(30),
    fetchWorkerHealth(),
  ]);

  // ── Growth funnel: signups → onboarding → subscription ────────────────────
  // profiles has exactly one row per signup (auto-created on auth.users INSERT),
  // so it's the canonical signup count. onboarded_at NULL = not yet onboarded;
  // onboarding_step is the resume label for users mid-flow. subscriptions holds
  // plan/status. All counts use head:true so we never pull rows for the totals.
  const ACTIVE_SUB_STATUSES = ['active', 'trialing'];
  const headCount = (q: { count: number | null }) => q.count ?? 0;
  const [
    signupsTotalRes,
    signups7dRes,
    signups24hRes,
    onboardedRes,
    inProgressRes,
    inProgressStepsRes,
    subsRes,
  ] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', last7d),
    admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', last24h),
    // Onboarded = finished the flow.
    admin.from('profiles').select('id', { count: 'exact', head: true }).not('onboarded_at', 'is', null),
    // In progress = not finished but has taken at least one step.
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('onboarded_at', null)
      .not('onboarding_step', 'is', null),
    // Which step in-progress users are sitting on (small set; cap to be safe).
    admin
      .from('profiles')
      .select('onboarding_step')
      .is('onboarded_at', null)
      .not('onboarding_step', 'is', null)
      .limit(5000),
    // All subscription rows are few (tens–hundreds); pull plan+status to group.
    admin.from('subscriptions').select('plan_slug, status').limit(5000),
  ]);

  const signupsTotal = headCount(signupsTotalRes);
  const onboarded = headCount(onboardedRes);
  const inProgress = headCount(inProgressRes);
  const notStarted = Math.max(0, signupsTotal - onboarded - inProgress);

  const onboardingByStep: Record<string, number> = {};
  for (const row of (inProgressStepsRes.data ?? []) as { onboarding_step: string | null }[]) {
    const step = row.onboarding_step ?? 'unknown';
    onboardingByStep[step] = (onboardingByStep[step] ?? 0) + 1;
  }

  const subRows = (subsRes.data ?? []) as { plan_slug: string | null; status: string | null }[];
  const subsByPlan: Record<string, number> = {};
  let activeSubs = 0;
  for (const s of subRows) {
    if (s.status && ACTIVE_SUB_STATUSES.includes(s.status)) {
      activeSubs += 1;
      const plan = s.plan_slug ?? 'unknown';
      subsByPlan[plan] = (subsByPlan[plan] ?? 0) + 1;
    }
  }

  // ── Step-by-step onboarding funnel ────────────────────────────────────────
  // Scoped to the onboarding_events cohort (the table only exists from when we
  // shipped tracking — May 2026 — so everyone in it actually could start). We
  // count DISTINCT users who 'entered' each step, walked in canonical order, so
  // the funnel reflects real reach + per-step drop. Events are pulled in pages
  // (PostgREST caps a single response at ~1000 rows).
  const ONBOARDING_STEP_ORDER = [
    'welcome', 'showcase', 'product', 'source', 'goal', 'tool', 'preparing', 'completed',
  ];
  const reachedByStep = new Map<string, Set<string>>();
  let from = 0;
  const PAGE = 1000;
  // Hard cap so a runaway table can never hang the admin request.
  for (let guard = 0; guard < 100; guard += 1) {
    const { data: evRows, error: evErr } = await admin
      .from('onboarding_events')
      .select('user_id, step, event')
      .eq('event', 'entered')
      .range(from, from + PAGE - 1);
    if (evErr || !evRows || evRows.length === 0) break;
    for (const r of evRows as { user_id: string; step: string }[]) {
      let set = reachedByStep.get(r.step);
      if (!set) { set = new Set(); reachedByStep.set(r.step, set); }
      set.add(r.user_id);
    }
    if (evRows.length < PAGE) break;
    from += PAGE;
  }
  // Order: canonical steps that have data first, then any unknown steps after.
  const orderedSteps = [
    ...ONBOARDING_STEP_ORDER.filter((s) => reachedByStep.has(s)),
    ...[...reachedByStep.keys()].filter((s) => !ONBOARDING_STEP_ORDER.includes(s)),
  ];
  const funnelStart = orderedSteps.length ? (reachedByStep.get(orderedSteps[0])?.size ?? 0) : 0;
  let prevReached = funnelStart;
  const funnel = orderedSteps.map((step) => {
    const reached = reachedByStep.get(step)?.size ?? 0;
    const row = {
      step,
      reached,
      pct_of_start: funnelStart ? reached / funnelStart : 0,
      drop_from_prev: prevReached - reached,
      drop_pct: prevReached ? (prevReached - reached) / prevReached : 0,
    };
    prevReached = reached;
    return row;
  });

  const growth = {
    signups: {
      total: signupsTotal,
      last_7d: headCount(signups7dRes),
      last_24h: headCount(signups24hRes),
    },
    onboarding: {
      onboarded,
      in_progress: inProgress,
      not_started: notStarted,
      completion_rate: signupsTotal ? onboarded / signupsTotal : 0,
      by_step: onboardingByStep,
      // Step-by-step funnel among users who actually started (event-log cohort).
      funnel,
      funnel_started: funnelStart,
    },
    subscriptions: {
      active_total: activeSubs,
      by_plan: subsByPlan,
      // Conversion = active paying users / everyone who ever signed up.
      conversion_rate: signupsTotal ? activeSubs / signupsTotal : 0,
      // Conversion among people who actually finished onboarding.
      conversion_rate_of_onboarded: onboarded ? activeSubs / onboarded : 0,
    },
  };

  const queueDepth = queueDepthRes.count ?? 0;
  const queueStatus = queueStatusRes.data ?? { depth: 0, oldest_age_seconds: 0, newest_age_seconds: 0 };
  const all7d: JobRow[] = (rows7dRes.data ?? []) as JobRow[];
  const recentJobs: JobRow[] = (recentJobsRes.data ?? []) as JobRow[];
  const recentErrors: JobRow[] = (recentErrorsRes.data ?? []) as JobRow[];

  const last24Rows = all7d.filter((j) => j.created_at >= last24h);
  const last1hRows = all7d.filter((j) => j.created_at >= last1h);

  // ── Status counts (24h) ───────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const j of last24Rows) statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;

  // ── Latency per generator (24h, completed) ────────────────────────────────
  const latencyBuckets: Record<string, number[]> = {};
  for (const j of last24Rows) {
    if (j.status !== 'completed') continue;
    const d = durationSeconds(j);
    if (d == null) continue;
    const op = j.operation ?? 'unknown';
    (latencyBuckets[op] ??= []).push(d);
  }
  const latencyByGen: Record<string, { p50: number | null; p95: number | null; p99: number | null; n: number }> = {};
  for (const [op, arr] of Object.entries(latencyBuckets)) {
    const sorted = arr.slice().sort((a, b) => a - b);
    latencyByGen[op] = {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      n: sorted.length,
    };
  }

  // ── Error rate per generator (1h) ─────────────────────────────────────────
  const totalsByGen1h: Record<string, { failed: number; total: number }> = {};
  for (const j of last1hRows) {
    const op = j.operation ?? 'unknown';
    const t = (totalsByGen1h[op] ??= { failed: 0, total: 0 });
    t.total += 1;
    if (j.status === 'failed') t.failed += 1;
  }
  const errorRateByGen: Record<string, { failed: number; total: number; rate: number }> = {};
  for (const [op, t] of Object.entries(totalsByGen1h)) {
    errorRateByGen[op] = {
      failed: t.failed,
      total: t.total,
      rate: t.total ? t.failed / t.total : 0,
    };
  }

  // ── Top error codes (24h) ─────────────────────────────────────────────────
  const errorCodeCounts: Record<string, number> = {};
  for (const j of last24Rows) {
    if (j.status === 'failed' && j.error_code) {
      errorCodeCounts[j.error_code] = (errorCodeCounts[j.error_code] ?? 0) + 1;
    }
  }
  const topErrors = Object.entries(errorCodeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  // ── Cost summaries ────────────────────────────────────────────────────────
  const sumProviderCost = (rows: JobRow[]) =>
    rows.reduce((s, j) => s + (j.provider_cost_usd ?? 0), 0);
  const sumCredits = (rows: JobRow[]) =>
    rows.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.credit_cost ?? 0), 0);

  // ── Per-hour throughput (24h) ─────────────────────────────────────────────
  const jobsPerHour = bucketByHour(last24Rows);

  // ── Compact recent-jobs / recent-errors for the UI table ──────────────────
  const compact = (j: JobRow) => ({
    id: j.id,
    user_id: j.user_id,
    operation: j.operation,
    model_slug: j.model_slug,
    status: j.status,
    prompt: j.prompt ? j.prompt.slice(0, 120) : null,
    created_at: j.created_at,
    duration_s: durationSeconds(j),
    credit_cost: j.credit_cost,
    error_code: j.error_code,
    error_message: j.error_message ? j.error_message.slice(0, 300) : null,
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),

    growth,

    queue: {
      depth: queueDepth,
      pgmq_depth: queueStatus?.depth ?? 0,
      oldest_age_seconds: queueStatus?.oldest_age_seconds ?? 0,
      newest_age_seconds: queueStatus?.newest_age_seconds ?? 0,
    },

    status_counts_24h: statusCounts,
    latency_by_generator_24h: latencyByGen,
    error_rate_by_generator_1h: errorRateByGen,
    top_errors_24h: topErrors,
    jobs_per_hour_24h: jobsPerHour,

    recent_jobs: recentJobs.map(compact),
    recent_errors: recentErrors.map(compact),

    worker_health: workerHealth,

    cost: {
      provider_cost_usd_24h: sumProviderCost(last24Rows),
      provider_cost_usd_7d: sumProviderCost(all7d),
      credits_completed_24h: sumCredits(last24Rows),
      credits_completed_7d: sumCredits(all7d),
    },

    counts: {
      jobs_24h: last24Rows.length,
      jobs_7d: all7d.length,
    },
  });
}
