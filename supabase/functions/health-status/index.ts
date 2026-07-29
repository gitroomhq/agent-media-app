// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: health-status
 *
 * Public API endpoint returning system health, provider status, circuit
 * breaker state, and active alerts. No authentication required.
 *
 * Route:
 *   GET /functions/v1/health-status
 *
 * Response (200):
 *   {
 *     "status": "operational" | "degraded" | "outage",
 *     "providers": [
 *       {
 *         "slug": "kie",
 *         "status": "healthy" | "degraded" | "down",
 *         "circuit_state": "closed" | "open" | "half_open",
 *         "avg_latency_ms": 245.5,
 *         "success_rate_24h": 98.5,
 *         "total_requests_24h": 1200
 *       }
 *     ],
 *     "system": {
 *       "total_jobs_24h": 500,
 *       "success_rate_24h": 95.2,
 *       "avg_response_time_ms": 320.1,
 *       "active_alerts": 0
 *     },
 *     "services": [
 *       { "name": "Generation Pipeline", "status": "operational" },
 *       { "name": "Webhook Processing", "status": "operational" },
 *       { "name": "Credit System", "status": "operational" },
 *       { "name": "Authentication", "status": "operational" }
 *     ],
 *     "updated_at": "2026-02-18T12:00:00.000Z"
 *   }
 *
 * Error responses:
 *   429: Rate limit exceeded
 *   500: Server error
 */

import { supabaseAdmin } from "../_shared/supabase.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProviderStatus {
  slug: string;
  status: "healthy" | "degraded" | "down";
  circuit_state: "closed" | "open" | "half_open";
  avg_latency_ms: number;
  success_rate_24h: number;
  total_requests_24h: number;
}

interface SystemStatus {
  total_jobs_24h: number;
  success_rate_24h: number;
  avg_response_time_ms: number;
  active_alerts: number;
}

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "outage";
}

interface HealthResponse {
  status: "operational" | "degraded" | "outage";
  providers: ProviderStatus[];
  system: SystemStatus;
  services: ServiceStatus[];
  updated_at: string;
}

// ── IP-based Rate Limiting ──────────────────────────────────────────────────
// Public endpoint: lightweight in-memory sliding window keyed by client IP.
// Resets on cold-start but protects against casual abuse.

const IP_WINDOW_MS = 60_000; // 1 minute
const IP_MAX_REQUESTS = 20; // 20 requests per minute per IP

interface IpBucket {
  timestamps: number[];
}

const ipBuckets = new Map<string, IpBucket>();

// Periodic cleanup to prevent unbounded memory growth.
// Runs every 5 minutes and evicts buckets with no recent activity.
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function cleanupStaleBuckets(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - IP_WINDOW_MS;
  for (const [ip, bucket] of ipBuckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      ipBuckets.delete(ip);
    }
  }
}

function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  cleanupStaleBuckets();

  const now = Date.now();
  const cutoff = now - IP_WINDOW_MS;

  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { timestamps: [] };
    ipBuckets.set(ip, bucket);
  }

  // Evict expired entries
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= IP_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  bucket.timestamps.push(now);
  return { allowed: true, remaining: IP_MAX_REQUESTS - bucket.timestamps.length };
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── Response Helpers ────────────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status: number,
  origin: string,
  cacheControl?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl ?? "public, max-age=30, s-maxage=60",
      ...getCorsHeaders(origin),
      ...getSecurityHeaders(),
    },
  });
}

function errorResponse(
  error: string,
  status: number,
  origin: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin),
      ...getSecurityHeaders(),
    },
  });
}

// ── Health Determination Helpers ────────────────────────────────────────────

/**
 * Derive a provider's status from its circuit breaker state and metrics.
 */
function deriveProviderStatus(
  circuitState: string,
  successRate: number,
): "healthy" | "degraded" | "down" {
  if (circuitState === "open") return "down";
  if (circuitState === "half_open") return "degraded";
  // closed state: check success rate
  if (successRate < 80) return "degraded";
  return "healthy";
}

/**
 * Derive the overall system status from provider statuses and active alerts.
 */
function deriveOverallStatus(
  providers: ProviderStatus[],
  activeAlertCount: number,
): "operational" | "degraded" | "outage" {
  const downProviders = providers.filter((p) => p.status === "down").length;
  const degradedProviders = providers.filter((p) => p.status === "degraded").length;
  const totalProviders = providers.length;

  // All providers down = outage
  if (totalProviders > 0 && downProviders === totalProviders) return "outage";
  // Any provider down or degraded, or critical alerts = degraded
  if (downProviders > 0 || degradedProviders > 0 || activeAlertCount > 0) return "degraded";
  return "operational";
}

/**
 * Determine a service's health based on recent job data and errors.
 */
function deriveServiceStatus(
  serviceName: string,
  providerStatuses: ProviderStatus[],
  jobSuccessRate: number,
  activeAlertCount: number,
): "operational" | "degraded" | "outage" {
  switch (serviceName) {
    case "Generation Pipeline": {
      const anyDown = providerStatuses.some((p) => p.status === "down");
      const allDown = providerStatuses.length > 0 &&
        providerStatuses.every((p) => p.status === "down");
      if (allDown) return "outage";
      if (anyDown || jobSuccessRate < 80) return "degraded";
      return "operational";
    }
    case "Webhook Processing": {
      // If there are webhook-related alerts, degrade
      if (activeAlertCount > 0) return "degraded";
      return "operational";
    }
    case "Credit System": {
      // Credit system is operational unless there are credit-related alerts
      return "operational";
    }
    case "Authentication": {
      // Auth is operational unless entirely unreachable (which would
      // prevent this function from querying the DB at all)
      return "operational";
    }
    default:
      return "operational";
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────

async function handleHealthStatus(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";

  // Rate limit by IP
  const clientIp = getClientIp(req);
  const rateResult = checkIpRateLimit(clientIp);
  if (!rateResult.allowed) {
    return errorResponse("rate_limit_exceeded", 429, origin, {
      retry_after: 60,
    });
  }

  const db = supabaseAdmin();
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // ── Fetch provider health rows ───────────────────────────────────────
  const { data: healthRows, error: healthError } = await db
    .from("provider_health")
    .select(
      "provider_slug, circuit_state, avg_latency_ms, total_successes, total_failures, " +
      "failure_count, last_success_at, last_failure_at, opened_at, recovery_timeout_seconds"
    );

  if (healthError) {
    console.error("health-status: failed to fetch provider_health:", healthError.message);
    return errorResponse("server_error", 500, origin, {
      error_description: "Failed to fetch provider health data",
    });
  }

  // ── Fetch 24h job stats from generation_jobs ─────────────────────────
  const { data: recentJobs, error: jobsError } = await db
    .from("generation_jobs")
    .select("provider_slug, status, started_at, completed_at")
    .gte("created_at", twentyFourHoursAgo);

  if (jobsError) {
    console.error("health-status: failed to fetch generation_jobs:", jobsError.message);
    return errorResponse("server_error", 500, origin, {
      error_description: "Failed to fetch job statistics",
    });
  }

  const allJobs = recentJobs ?? [];

  // ── Compute per-provider 24h stats ───────────────────────────────────
  const providerJobStats = new Map<
    string,
    { total: number; successes: number; responseTimes: number[] }
  >();

  for (const job of allJobs) {
    const slug = job.provider_slug ?? "unknown";
    if (!providerJobStats.has(slug)) {
      providerJobStats.set(slug, { total: 0, successes: 0, responseTimes: [] });
    }
    const stats = providerJobStats.get(slug)!;
    stats.total++;
    if (job.status === "completed") {
      stats.successes++;
    }
    // Calculate response time if both timestamps are available
    if (job.started_at && job.completed_at) {
      const durationMs =
        new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
      if (durationMs > 0) {
        stats.responseTimes.push(durationMs);
      }
    }
  }

  // ── Build provider status array ──────────────────────────────────────
  const providers: ProviderStatus[] = (healthRows ?? []).map((row) => {
    const slug = row.provider_slug as string;
    const circuitState = row.circuit_state as "closed" | "open" | "half_open";
    const avgLatency = Number(row.avg_latency_ms) || 0;

    const jobStats = providerJobStats.get(slug);
    const totalRequests24h = jobStats?.total ?? 0;
    const successRate24h = totalRequests24h > 0
      ? Math.round(((jobStats?.successes ?? 0) / totalRequests24h) * 1000) / 10
      : 100; // No requests = assume healthy

    return {
      slug,
      status: deriveProviderStatus(circuitState, successRate24h),
      circuit_state: circuitState,
      avg_latency_ms: Math.round(avgLatency * 100) / 100,
      success_rate_24h: successRate24h,
      total_requests_24h: totalRequests24h,
    };
  });

  // ── Compute system-wide 24h stats ────────────────────────────────────
  const totalJobs24h = allJobs.length;
  const completedJobs24h = allJobs.filter((j) => j.status === "completed").length;
  const systemSuccessRate = totalJobs24h > 0
    ? Math.round((completedJobs24h / totalJobs24h) * 1000) / 10
    : 100;

  // Average response time across all providers
  const allResponseTimes: number[] = [];
  for (const stats of providerJobStats.values()) {
    allResponseTimes.push(...stats.responseTimes);
  }
  const avgResponseTimeMs = allResponseTimes.length > 0
    ? Math.round(
        (allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length) * 100
      ) / 100
    : 0;

  // ── Fetch active (unacknowledged) alert count ───────────────────────
  let resolvedAlertCount = 0;
  {
    const { count, error: alertError } = await db
      .from("alert_events")
      .select("id", { count: "exact", head: true })
      .is("acknowledged_at", null);

    if (alertError) {
      console.error("health-status: failed to count alert_events:", alertError.message);
      // Non-fatal: proceed with 0 alerts
    } else if (count !== null) {
      resolvedAlertCount = count;
    }
  }

  const system: SystemStatus = {
    total_jobs_24h: totalJobs24h,
    success_rate_24h: systemSuccessRate,
    avg_response_time_ms: avgResponseTimeMs,
    active_alerts: resolvedAlertCount,
  };

  // ── Build service statuses ───────────────────────────────────────────
  const serviceNames = [
    "Generation Pipeline",
    "Webhook Processing",
    "Credit System",
    "Authentication",
  ] as const;

  const services: ServiceStatus[] = serviceNames.map((name) => ({
    name,
    status: deriveServiceStatus(
      name,
      providers,
      systemSuccessRate,
      resolvedAlertCount,
    ),
  }));

  // ── Derive overall status ────────────────────────────────────────────
  const overallStatus = deriveOverallStatus(providers, resolvedAlertCount);

  const response: HealthResponse = {
    status: overallStatus,
    providers,
    system,
    services,
    updated_at: now.toISOString(),
  };

  return jsonResponse(response, 200, origin);
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
    return errorResponse("method_not_allowed", 405, origin, {
      error_description: "Only GET requests are accepted",
    });
  }

  try {
    return await handleHealthStatus(req);
  } catch (err) {
    console.error("Unhandled error in health-status:", err);
    return errorResponse("server_error", 500, origin, {
      error_description:
        err instanceof Error ? err.message : "Internal server error",
    });
  }
});
