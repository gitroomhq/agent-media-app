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
 * Edge Function: gallery-delete
 *
 * Soft-deletes (or restores) a generation job owned by the authenticated user.
 * Uses the deleted_at column on generation_jobs for reversible deletion.
 *
 * Route:
 *   POST /functions/v1/gallery-delete
 *
 * Body (delete):
 *   { "jobId": "<uuid>" }
 *
 * Body (restore):
 *   { "jobId": "<uuid>", "restore": true }
 *
 * Response (200):
 *   { "success": true, "jobId": "<uuid>", "deletedAt": "<ISO timestamp>" }
 *   or
 *   { "success": true, "jobId": "<uuid>", "restored": true }
 *
 * Error responses:
 *   400: Invalid input (missing or malformed jobId)
 *   401: Not authenticated
 *   404: Job not found or already deleted/restored
 *   429: Rate limit exceeded
 *   500: Server error
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Constants ───────────────────────────────────────────────────────────────

/** UUID v4 format regex for jobId validation. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Request Types ───────────────────────────────────────────────────────────

interface GalleryDeleteRequestBody {
  jobId: string;
  restore?: boolean;
}

// ── Handler ─────────────────────────────────────────────────────────────────

async function handleGalleryDelete(req: Request): Promise<Response> {
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
  const rateLimitResult = await checkRateLimit(user.id, "gallery-delete", db);
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

  // 3. Parse and validate request body
  let body: GalleryDeleteRequestBody;
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

  // Validate jobId is present and is a valid UUID
  if (!body.jobId || typeof body.jobId !== "string") {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "jobId is required and must be a string",
      },
      { status: 400 },
    );
  }

  if (!UUID_REGEX.test(body.jobId)) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "jobId must be a valid UUID",
      },
      { status: 400 },
    );
  }

  const jobId = body.jobId;
  const isRestore = body.restore === true;

  // 4. Perform soft-delete or restore
  if (isRestore) {
    // Restore: set deleted_at = NULL where deleted_at IS NOT NULL
    const { data, error: updateError } = await db
      .from("generation_jobs")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id)
      .not("deleted_at", "is", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to restore job:", updateError.message);
      return corsRes(
        {
          error: "server_error",
          error_description: "Failed to restore job",
        },
        { status: 500 },
      );
    }

    if (!data) {
      return corsRes(
        {
          error: "not_found",
          error_description: "Job not found or already restored",
        },
        { status: 404 },
      );
    }

    return corsRes({
      success: true,
      jobId,
      restored: true,
    });
  } else {
    // Delete: set deleted_at = now() where deleted_at IS NULL
    const now = new Date().toISOString();
    const { data, error: updateError } = await db
      .from("generation_jobs")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", jobId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to soft-delete job:", updateError.message);
      return corsRes(
        {
          error: "server_error",
          error_description: "Failed to delete job",
        },
        { status: 500 },
      );
    }

    if (!data) {
      return corsRes(
        {
          error: "not_found",
          error_description: "Job not found or already deleted",
        },
        { status: 404 },
      );
    }

    return corsRes({
      success: true,
      jobId,
      deletedAt: now,
    });
  }
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

  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "method_not_allowed",
        error_description: "Only POST requests are accepted",
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
    const response = await handleGalleryDelete(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in gallery-delete:", err);
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
