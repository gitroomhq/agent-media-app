// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Edge Function: pricing
 *
 * Returns model pricing information. This is a public endpoint -- no
 * authentication is required since pricing is not sensitive data.
 *
 * Routes:
 *   GET /functions/v1/pricing            -> all model pricing
 *   GET /functions/v1/pricing?model=slug -> pricing filtered by model slug
 *
 * Response format (matches CLI PricingResponse):
 *   {
 *     "pricing": [
 *       {
 *         "modelSlug": "seedance2",
 *         "operation": "text_to_video",
 *         "durationSeconds": 5,
 *         "resolution": "720p",
 *         "creditCost": 38,
 *         "providerCostUsd": 0.25
 *       },
 *       ...
 *     ]
 *   }
 */

import { supabaseAdmin } from "../_shared/supabase.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface PricingRow {
  model_slug: string;
  operation: string;
  duration_seconds: number | null;
  resolution: string | null;
  credit_cost: number;
  provider_cost_usd: number;
  models: {
    is_active: boolean;
  } | null;
}

interface PricingEntry {
  modelSlug: string;
  operation: string;
  durationSeconds: number | null;
  resolution: string | null;
  creditCost: number;
  providerCostUsd: number;
}

// ── Simple IP-based rate limiting ────────────────────────────────────────────
// Public endpoints cannot use the user-based rate limiter. Instead we use a
// lightweight in-memory sliding window keyed by client IP. This resets on
// cold-start but provides adequate protection against casual abuse.

const IP_WINDOW_MS = 60_000; // 1 minute
const IP_MAX_REQUESTS = 30; // 30 requests per minute per IP

interface IpBucket {
  timestamps: number[];
}

const ipBuckets = new Map<string, IpBucket>();

function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
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

/**
 * Extract the client IP from request headers.
 * Supabase Edge Functions set X-Forwarded-For; fall back to a generic key.
 */
function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=600",
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

// ── Handler ──────────────────────────────────────────────────────────────────

async function handlePricing(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const url = new URL(req.url);
  const modelFilter = url.searchParams.get("model") ?? undefined;

  // Rate limit by IP
  const clientIp = getClientIp(req);
  const rateResult = checkIpRateLimit(clientIp);
  if (!rateResult.allowed) {
    return errorResponse("rate_limit_exceeded", 429, origin, {
      retry_after: 60,
    });
  }

  const db = supabaseAdmin();

  // Build query: join model_pricing with models to get only active models
  let query = db
    .from("model_pricing")
    .select(
      "model_slug, operation, duration_seconds, resolution, credit_cost, provider_cost_usd, models!inner(is_active)",
    )
    .eq("models.is_active", true)
    .order("model_slug")
    .order("operation")
    .order("duration_seconds", { ascending: true, nullsFirst: false })
    .order("resolution");

  if (modelFilter) {
    query = query.eq("model_slug", modelFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch pricing:", error.message);
    return errorResponse("server_error", 500, origin, {
      error_description: "Failed to fetch pricing data",
    });
  }

  const rows = (data ?? []) as unknown as PricingRow[];

  // Map DB rows to the camelCase format the CLI expects
  const pricing: PricingEntry[] = rows.map((row) => ({
    modelSlug: row.model_slug,
    operation: row.operation,
    durationSeconds: row.duration_seconds,
    resolution: row.resolution,
    creditCost: row.credit_cost,
    providerCostUsd: Number(row.provider_cost_usd),
  }));

  return jsonResponse({ pricing }, 200, origin);
}

// ── Router ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  // Handle CORS preflight
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
    return await handlePricing(req);
  } catch (err) {
    console.error("Unhandled error in pricing:", err);
    return errorResponse("server_error", 500, origin, {
      error_description:
        err instanceof Error ? err.message : "Internal server error",
    });
  }
});
