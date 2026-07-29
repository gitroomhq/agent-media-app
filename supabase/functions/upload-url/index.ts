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
 * Edge Function: upload-url
 *
 * Generates a presigned upload URL for Supabase Storage, allowing
 * users to upload input media (images, videos) for generation
 * workflows like image-to-video.
 *
 * Route:
 *   POST /functions/v1/upload-url
 *
 * Body:
 *   { "filename": "input.mp4", "content_type": "video/mp4" }
 *
 * Response (200):
 *   {
 *     "upload_url": "https://...",
 *     "storage_path": "{user_id}/{uuid}/{filename}",
 *     "expires_in": 3600
 *   }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import { validateFileUpload } from "../_shared/validation.ts";

// ── Configuration ──────────────────────────────────────────────────────────

const BUCKET_NAME = "generation-inputs";
const UPLOAD_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Allowed MIME types for upload. Restricts what users can upload
 * to prevent abuse and ensure only valid media files are accepted.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
]);

/**
 * Maximum filename length to prevent path traversal and storage issues.
 */
const MAX_FILENAME_LENGTH = 255;

/**
 * Maximum file size in bytes (100 MB).
 * Enforced by the presigned URL policy, not at the application level.
 */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// ── Request Types ──────────────────────────────────────────────────────────

interface UploadUrlRequestBody {
  filename: string;
  content_type: string;
}

// ── Input Validation ───────────────────────────────────────────────────────

interface ValidatedUploadInput {
  filename: string;
  contentType: string;
}

function validateInput(
  body: UploadUrlRequestBody,
): ValidatedUploadInput | { error: string } {
  // Required: filename
  if (!body.filename || typeof body.filename !== "string") {
    return { error: "filename is required and must be a non-empty string" };
  }

  const filename = body.filename.trim();

  if (filename.length === 0) {
    return { error: "filename must not be empty" };
  }

  if (filename.length > MAX_FILENAME_LENGTH) {
    return {
      error: `filename must be ${MAX_FILENAME_LENGTH} characters or fewer`,
    };
  }

  // Prevent path traversal attacks
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return {
      error: "filename must not contain path separators or '..' sequences",
    };
  }

  // Prevent null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return { error: "filename must not contain control characters" };
  }

  // Required: content_type
  if (!body.content_type || typeof body.content_type !== "string") {
    return { error: "content_type is required and must be a non-empty string" };
  }

  const contentType = body.content_type.trim().toLowerCase();

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return {
      error:
        `content_type '${contentType}' is not allowed. ` +
        `Supported types: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
    };
  }

  return { filename, contentType };
}

// ── Main Handler ───────────────────────────────────────────────────────────

async function handleUploadUrl(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";

  // Bind origin to corsResponse for origin-aware CORS
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Authenticate
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

  // 1b. Rate limit check
  const rateLimitDb = supabaseAdmin();
  const rateLimitResult = await checkRateLimit(user.id, "upload-url", rateLimitDb);
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

  // 2. Parse and validate request body
  let body: UploadUrlRequestBody;
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

  const validated = validateInput(body);
  if ("error" in validated) {
    return corsRes(
      { error: "invalid_request", error_description: validated.error },
      { status: 400 },
    );
  }

  // 2b. Validate file type and size using shared validation
  // The content_type header tells us the MIME type; we validate that along
  // with the Content-Length header (if available) for early rejection.
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  const fileValidation = validateFileUpload({
    type: validated.contentType,
    size: contentLength > 0 ? contentLength : 1, // default to 1 if no content-length (presigned flow)
    name: validated.filename,
  });

  if (!fileValidation.valid) {
    return corsRes(
      { error: "invalid_request", error_description: fileValidation.error },
      { status: 400 },
    );
  }

  // 3. Generate a unique storage path
  // Path format: {user_id}/{uuid}/{filename}
  // The UUID ensures no filename collisions even if the same user
  // uploads files with the same name.
  const uploadId = crypto.randomUUID();
  const storagePath = `${user.id}/${uploadId}/${validated.filename}`;

  // 4. Create a presigned upload URL via Supabase Storage
  const db = supabaseAdmin();

  const { data: signedData, error: signError } = await db.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(storagePath, {
      upsert: false,
    });

  if (signError || !signedData) {
    console.error(
      "Failed to create signed upload URL:",
      signError?.message ?? "unknown error",
    );

    // Check for specific storage errors
    if (signError?.message?.includes("Bucket not found")) {
      return corsRes(
        {
          error: "storage_error",
          error_description:
            "Upload storage is not configured. Please contact support.",
        },
        { status: 500 },
      );
    }

    return corsRes(
      {
        error: "storage_error",
        error_description: "Failed to generate upload URL. Please try again.",
      },
      { status: 500 },
    );
  }

  // 5. Return the presigned URL and storage path
  return corsRes({
    upload_url: signedData.signedUrl,
    storage_path: storagePath,
    token: signedData.token,
    expires_in: UPLOAD_EXPIRY_SECONDS,
    max_file_size: MAX_FILE_SIZE_BYTES,
    content_type: validated.contentType,
  });
}

// ── Router ─────────────────────────────────────────────────────────────────

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
    const response = await handleUploadUrl(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in upload-url:", err);
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
