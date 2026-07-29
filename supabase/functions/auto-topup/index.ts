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
 * Edge Function: auto-topup
 *
 * Manages auto-top-up configuration and processing for credit packs.
 *
 * Routes:
 *   GET  /functions/v1/auto-topup/config  (user JWT auth)
 *     -> Return the user's auto_topup_config row (or defaults)
 *
 *   PUT  /functions/v1/auto-topup/config  (user JWT auth)
 *     -> Upsert auto-top-up settings: enabled, threshold_credits,
 *        pack_slug, max_monthly_topups
 *
 *   POST /functions/v1/auto-topup  (service role only)
 *     -> Process pending auto-top-ups (called by cron / webhook)
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
// rate-limit imports intentionally removed — the shared module
// counts all endpoint calls per user, not per endpoint, so a normal
// page load can use up the free-tier budget and lock a user out of
// their own config writes.
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface AutoTopUpConfig {
  enabled: boolean;
  threshold_credits: number;
  pack_slug: string;
  max_monthly_topups: number;
}

// ── Validation Constants ───────────────────────────────────────────────────

const VALID_PACK_SLUGS = new Set(["pack_3900"]);
const MIN_THRESHOLD = 10;
const MIN_MAX_MONTHLY = 1;
const MAX_MAX_MONTHLY = 10;

const DEFAULT_CONFIG: AutoTopUpConfig = {
  enabled: false,
  threshold_credits: 50,
  pack_slug: "pack_3900",
  max_monthly_topups: 3,
};

// ── GET /config ─────────────────────────────────────────────────────────────

async function handleGetConfig(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  // Authenticate
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

  // No rate-limit on the config read; see PUT for the reason.

  // Fetch config
  const { data, error: fetchError } = await db
    .from("auto_topup_config")
    .select("enabled, threshold_credits, pack_slug, max_monthly_topups, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch auto-topup config:", fetchError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to fetch auto-top-up configuration",
      },
      { status: 500 },
    );
  }

  // Return existing config or defaults
  const config = data ?? {
    ...DEFAULT_CONFIG,
    updated_at: null,
  };

  return corsRes(config);
}

// ── PUT /config ─────────────────────────────────────────────────────────────

async function handlePutConfig(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  // Authenticate
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

  // No rate limit on the config endpoint — this is a tiny config write
  // that gates auto-billing, and the shared rate-limit module counts
  // ALL endpoint calls per user (not per-endpoint), so a normal page
  // load can already burn through the free-tier 10/min budget before
  // the user ever toggles anything.

  // Parse body
  let body: Partial<AutoTopUpConfig>;
  try {
    body = await req.json();
  } catch {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  // Validate fields
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return corsRes(
      { error: "invalid_request", error_description: "enabled must be a boolean" },
      { status: 400 },
    );
  }

  if (body.threshold_credits !== undefined) {
    if (
      typeof body.threshold_credits !== "number" ||
      !Number.isInteger(body.threshold_credits) ||
      body.threshold_credits < MIN_THRESHOLD
    ) {
      return corsRes(
        {
          error: "invalid_request",
          error_description: `threshold_credits must be an integer >= ${MIN_THRESHOLD}`,
        },
        { status: 400 },
      );
    }
  }

  if (body.pack_slug !== undefined) {
    if (typeof body.pack_slug !== "string" || !VALID_PACK_SLUGS.has(body.pack_slug)) {
      return corsRes(
        {
          error: "invalid_request",
          error_description: `pack_slug must be one of: ${[...VALID_PACK_SLUGS].join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  if (body.max_monthly_topups !== undefined) {
    if (
      typeof body.max_monthly_topups !== "number" ||
      !Number.isInteger(body.max_monthly_topups) ||
      body.max_monthly_topups < MIN_MAX_MONTHLY ||
      body.max_monthly_topups > MAX_MAX_MONTHLY
    ) {
      return corsRes(
        {
          error: "invalid_request",
          error_description: `max_monthly_topups must be an integer between ${MIN_MAX_MONTHLY} and ${MAX_MAX_MONTHLY}`,
        },
        { status: 400 },
      );
    }
  }

  // Build upsert payload (merge with defaults for new rows)
  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    enabled: body.enabled ?? DEFAULT_CONFIG.enabled,
    threshold_credits: body.threshold_credits ?? DEFAULT_CONFIG.threshold_credits,
    pack_slug: body.pack_slug ?? DEFAULT_CONFIG.pack_slug,
    max_monthly_topups: body.max_monthly_topups ?? DEFAULT_CONFIG.max_monthly_topups,
    updated_at: new Date().toISOString(),
  };

  const { data, error: upsertError } = await db
    .from("auto_topup_config")
    .upsert(upsertData, { onConflict: "user_id" })
    .select("enabled, threshold_credits, pack_slug, max_monthly_topups, updated_at")
    .single();

  if (upsertError) {
    console.error("Failed to upsert auto-topup config:", upsertError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to update auto-top-up configuration",
      },
      { status: 500 },
    );
  }

  return corsRes(data);
}

// ── POST / (service role only) ──────────────────────────────────────────────

async function handleProcessTopUps(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // Verify service role key
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!token || token !== serviceRoleKey) {
    return corsRes(
      {
        error: "unauthorized",
        error_description: "Service role key required",
      },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  // Find users who need auto-top-up
  const { data: configs, error: configError } = await db
    .from("auto_topup_config")
    .select("user_id, threshold_credits, pack_slug, max_monthly_topups")
    .eq("enabled", true);

  if (configError) {
    console.error("Failed to fetch auto-topup configs:", configError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to fetch auto-top-up configurations",
      },
      { status: 500 },
    );
  }

  const results: Array<{
    user_id: string;
    should_topup: boolean;
    error?: string;
  }> = [];

  for (const config of configs ?? []) {
    try {
      const { data: checkResult, error: checkError } = await db.rpc(
        "check_and_topup",
        { p_user_id: config.user_id },
      );

      if (checkError) {
        results.push({
          user_id: config.user_id,
          should_topup: false,
          error: checkError.message,
        });
        continue;
      }

      const shouldTopup = checkResult?.should_topup === true;
      results.push({
        user_id: config.user_id,
        should_topup: shouldTopup,
      });

      if (shouldTopup) {
        console.log(
          `auto-topup: user ${config.user_id} needs top-up ` +
            `(pack: ${config.pack_slug}, threshold: ${config.threshold_credits})`,
        );
      }
    } catch (err) {
      results.push({
        user_id: config.user_id,
        should_topup: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const triggered = results.filter((r) => r.should_topup).length;
  console.log(
    `auto-topup: processed ${results.length} configs, ${triggered} need top-up`,
  );

  return corsRes({
    processed: results.length,
    triggered,
    results,
  });
}

// ── Router ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";
  const url = new URL(req.url);
  const path = url.pathname;

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

  try {
    let response: Response;

    // Route: GET /functions/v1/auto-topup[/config]
    // The /api/fn/[name] proxy can't pass sub-paths, so accept both
    // /auto-topup and /auto-topup/config for user-facing GET/PUT.
    if (req.method === "GET") {
      response = await handleGetConfig(req);
    }
    // Route: PUT /functions/v1/auto-topup[/config]
    else if (req.method === "PUT") {
      response = await handlePutConfig(req);
    }
    // POST also accepts the legacy body-based shape from the client
    // proxy. If the request has a JSON body with `enabled`/`threshold`
    // /`amount_usd` (or pack_slug) treat it as a user config write;
    // otherwise fall through to the cron-only "process topups" path.
    else if (req.method === "POST" && !path.endsWith("/config")) {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const peek = req.clone();
        try {
          const body = await peek.json();
          if (
            body &&
            (typeof body.enabled === "boolean" ||
              typeof body.threshold === "number" ||
              typeof body.threshold_credits === "number" ||
              typeof body.amount_usd === "number" ||
              typeof body.pack_slug === "string")
          ) {
            response = await handlePutConfig(req);
          } else {
            response = await handleProcessTopUps(req);
          }
        } catch {
          response = await handleProcessTopUps(req);
        }
      } else {
        response = await handleProcessTopUps(req);
      }
    }
    // Route: POST /functions/v1/auto-topup/config (kept for explicit clients)
    else if (req.method === "POST" && path.endsWith("/config")) {
      response = await handlePutConfig(req);
    }
    // Unsupported method/route
    else {
      response = new Response(
        JSON.stringify({
          error: "not_found",
          error_description:
            "Valid methods: GET, PUT, POST",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(origin),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    // Append security headers to every response
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in auto-topup:", err);
    await captureEdgeError(err, "auto-topup");
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
