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
 * Edge Function: presigned-url
 *
 * Generates presigned download URLs for completed generation job outputs.
 * For files stored in Supabase Storage, returns a signed URL with a 1-hour TTL.
 * For external URLs (e.g., provider-hosted), returns the URL directly.
 *
 * Route:
 *   POST /functions/v1/presigned-url
 *
 * Body:
 *   { "jobId": "<uuid>", "type": "media" | "thumbnail" }
 *
 * Response (200):
 *   { "url": "<signed-url>", "expiresAt": "<ISO8601>", "type": "media" | "thumbnail" }
 *
 * Error responses:
 *   400: Invalid input (missing/malformed jobId or invalid type)
 *   401: Not authenticated
 *   404: Job not found, not owned by user, or no output URL available
 *   429: Rate limit exceeded
 *   500: Server error
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// -- Constants ---------------------------------------------------------------

/** UUID v4 format regex for jobId validation. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valid output type values. */
const VALID_TYPES = new Set(["media", "thumbnail"]);

/** Presigned URL TTL in seconds (1 hour). */
const SIGNED_URL_TTL_SECONDS = 3600;

/** The Supabase Storage bucket name for generation outputs. */
const STORAGE_BUCKET = "generation-outputs";

// -- Request Types -----------------------------------------------------------

interface PresignedUrlRequestBody {
  jobId: string;
  type: "media" | "thumbnail";
}

// -- Handler -----------------------------------------------------------------

async function handlePresignedUrl(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
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
  const rateLimitResult = await checkRateLimit(user.id, "presigned-url", db);
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
  let body: PresignedUrlRequestBody;
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

  // Validate jobId
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

  // Validate type
  if (!body.type || !VALID_TYPES.has(body.type)) {
    return corsRes(
      {
        error: "invalid_request",
        error_description:
          'type is required and must be "media" or "thumbnail"',
      },
      { status: 400 },
    );
  }

  const jobId = body.jobId;
  const type = body.type;

  // 4. Fetch the job and verify ownership
  const { data: job, error: jobError } = await db
    .from("generation_jobs")
    .select("id, user_id, output_media_url, output_thumbnail_url")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobError) {
    console.error("Failed to fetch job:", jobError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to fetch job data",
      },
      { status: 500 },
    );
  }

  if (!job) {
    return corsRes(
      {
        error: "not_found",
        error_description: "Job not found or access denied",
      },
      { status: 404 },
    );
  }

  // 5. Get the appropriate URL based on type
  const rawUrl =
    type === "media" ? job.output_media_url : job.output_thumbnail_url;

  if (!rawUrl) {
    return corsRes(
      {
        error: "not_found",
        error_description: `No ${type} URL available for this job`,
      },
      { status: 404 },
    );
  }

  // 6. Determine if URL is a Supabase Storage path or external
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const isStorageUrl = rawUrl.includes(STORAGE_BUCKET);

  if (isStorageUrl) {
    // Extract the storage path from the full URL.
    // URL format: {SUPABASE_URL}/storage/v1/object/generation-outputs/{path}
    // or it may be a previously signed URL containing the bucket name.
    const bucketPrefix = `${STORAGE_BUCKET}/`;
    const bucketIndex = rawUrl.indexOf(bucketPrefix);

    if (bucketIndex === -1) {
      // Fallback: cannot parse the storage path
      console.error("Could not extract storage path from URL:", rawUrl);
      return corsRes(
        {
          error: "server_error",
          error_description: "Failed to resolve storage path",
        },
        { status: 500 },
      );
    }

    // Extract everything after "generation-outputs/"
    let storagePath = rawUrl.substring(bucketIndex + bucketPrefix.length);

    // Strip any query parameters (from previously signed URLs)
    const queryIndex = storagePath.indexOf("?");
    if (queryIndex !== -1) {
      storagePath = storagePath.substring(0, queryIndex);
    }

    // Generate a fresh presigned URL
    const { data: signedData, error: signError } = await db.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signedData?.signedUrl) {
      console.error("Failed to create signed URL:", signError?.message);
      return corsRes(
        {
          error: "server_error",
          error_description: "Failed to generate presigned URL",
        },
        { status: 500 },
      );
    }

    const expiresAt = new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString();

    return corsRes({
      url: signedData.signedUrl,
      expiresAt,
      type,
    });
  }

  // 7. External URL -- return it directly
  // External URLs (e.g., provider-hosted temporary files) are returned as-is.
  // Note: these may have their own expiration managed by the provider.
  const expiresAt = new Date(
    Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  ).toISOString();

  return corsRes({
    url: rawUrl,
    expiresAt,
    type,
    external: true,
  });
}

// -- Router ------------------------------------------------------------------

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
    const response = await handlePresignedUrl(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in presigned-url:", err);
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
