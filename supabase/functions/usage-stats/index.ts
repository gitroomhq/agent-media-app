// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: usage-stats
 *
 * Returns usage analytics data for the authenticated user, including
 * job summaries, per-model breakdowns, daily trends, and operation
 * type distributions.
 *
 * Route:
 *   GET /functions/v1/usage-stats?period=30d
 *
 * Query parameters:
 *   period - Time period: "7d", "30d", or "90d" (default: "30d")
 *
 * Response (200):
 *   {
 *     "period": "30d",
 *     "period_start": "2026-01-18T00:00:00Z",
 *     "period_end": "2026-02-17T00:00:00Z",
 *     "summary": { ... },
 *     "by_model": [ ... ],
 *     "daily": [ ... ],
 *     "by_operation": [ ... ]
 *   }
 *
 * Error responses:
 *   400: Invalid period
 *   401: Not authenticated
 *   429: Rate limit exceeded
 *   500: Server error
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Types ───────────────────────────────────────────────────────────────────

interface UsageSummary {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  credits_used: number;
}

interface ModelBreakdown {
  model_slug: string;
  job_count: number;
  credits_used: number;
  avg_duration_seconds: number | null;
}

interface DailyUsage {
  date: string;
  job_count: number;
  credits_used: number;
}

interface OperationBreakdown {
  operation: string;
  job_count: number;
}

interface UsageStatsResponse {
  period: string;
  period_start: string;
  period_end: string;
  summary: UsageSummary;
  by_model: ModelBreakdown[];
  daily: DailyUsage[];
  by_operation: OperationBreakdown[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const VALID_PERIODS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

// ── Main Handler ────────────────────────────────────────────────────────────

async function handleUsageStats(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";

  // Bind origin to corsResponse for origin-aware CORS
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      {
        error: "unauthorized",
        error_description: authError ?? "Authentication required",
      },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  // 2. Rate limit check
  const rateLimitResult = await checkRateLimit(user.id, "usage-stats", db);
  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        retry_after: Math.ceil(
          (rateLimitResult.resetAt.getTime() - Date.now()) / 1000,
        ),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...getRateLimitHeaders(rateLimitResult),
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  // 3. Parse and validate the period parameter
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30d";

  if (!VALID_PERIODS[periodParam]) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: `Invalid period '${periodParam}'. Must be one of: ${Object.keys(VALID_PERIODS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const days = VALID_PERIODS[periodParam];
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 4. Fetch all generation jobs for the user within the period
  //    Using the admin client to bypass RLS for performance; the user_id
  //    filter ensures data isolation.
  const { data: jobs, error: jobsError } = await db
    .from("generation_jobs")
    .select(
      "id, model_slug, operation, status, credit_cost, duration_seconds, started_at, completed_at, created_at",
    )
    .eq("user_id", user.id)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (jobsError) {
    console.error("Failed to fetch generation jobs:", jobsError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to fetch usage data",
      },
      { status: 500 },
    );
  }

  const allJobs = jobs ?? [];

  // 5. Calculate summary
  const summary: UsageSummary = {
    total_jobs: allJobs.length,
    completed_jobs: 0,
    failed_jobs: 0,
    credits_used: 0,
  };

  for (const job of allJobs) {
    if (job.status === "completed") {
      summary.completed_jobs++;
    } else if (job.status === "failed") {
      summary.failed_jobs++;
    }
    summary.credits_used += job.credit_cost ?? 0;
  }

  // 6. Calculate by_model breakdown
  const modelMap = new Map<
    string,
    { count: number; credits: number; durations: number[] }
  >();

  for (const job of allJobs) {
    const slug = job.model_slug;
    if (!modelMap.has(slug)) {
      modelMap.set(slug, { count: 0, credits: 0, durations: [] });
    }
    const entry = modelMap.get(slug)!;
    entry.count++;
    entry.credits += job.credit_cost ?? 0;

    // Calculate actual duration from started_at to completed_at if available
    if (job.started_at && job.completed_at) {
      const durationMs =
        new Date(job.completed_at).getTime() -
        new Date(job.started_at).getTime();
      if (durationMs > 0) {
        entry.durations.push(durationMs / 1000);
      }
    }
  }

  const byModel: ModelBreakdown[] = Array.from(modelMap.entries())
    .map(([slug, data]) => ({
      model_slug: slug,
      job_count: data.count,
      credits_used: data.credits,
      avg_duration_seconds:
        data.durations.length > 0
          ? Math.round(
              (data.durations.reduce((a, b) => a + b, 0) /
                data.durations.length) *
                10,
            ) / 10
          : null,
    }))
    .sort((a, b) => b.job_count - a.job_count);

  // 7. Calculate daily breakdown (for chart data)
  const dailyMap = new Map<string, { count: number; credits: number }>();

  // Pre-fill all dates in the range so the chart has continuous data
  for (let i = 0; i < days; i++) {
    const date = new Date(
      now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000,
    );
    const dateStr = date.toISOString().split("T")[0];
    dailyMap.set(dateStr, { count: 0, credits: 0 });
  }

  for (const job of allJobs) {
    const dateStr = job.created_at.split("T")[0];
    if (dailyMap.has(dateStr)) {
      const entry = dailyMap.get(dateStr)!;
      entry.count++;
      entry.credits += job.credit_cost ?? 0;
    }
  }

  const daily: DailyUsage[] = Array.from(dailyMap.entries()).map(
    ([date, data]) => ({
      date,
      job_count: data.count,
      credits_used: data.credits,
    }),
  );

  // 8. Calculate by_operation breakdown
  const operationMap = new Map<string, number>();

  for (const job of allJobs) {
    const op = job.operation ?? "unknown";
    operationMap.set(op, (operationMap.get(op) ?? 0) + 1);
  }

  const byOperation: OperationBreakdown[] = Array.from(
    operationMap.entries(),
  )
    .map(([operation, count]) => ({
      operation,
      job_count: count,
    }))
    .sort((a, b) => b.job_count - a.job_count);

  // 9. Build and return the response
  const response: UsageStatsResponse = {
    period: periodParam,
    period_start: periodStart,
    period_end: periodEnd,
    summary,
    by_model: byModel,
    daily,
    by_operation: byOperation,
  };

  return corsRes(response);
}

// ── Router ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  // Handle CORS preflight with security headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(origin),
        ...getSecurityHeaders(),
      },
    });
  }

  // Only GET allowed
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({
        error: "method_not_allowed",
        error_description: "Only GET requests are accepted",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }

  try {
    const response = await handleUsageStats(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in usage-stats:", err);
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description:
          err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(origin),
          ...getSecurityHeaders(),
        },
      },
    );
  }
});
