/**
 * Edge Function: device-token
 *
 * Implements the OAuth Device Flow for CLI authentication.
 *
 * Routes:
 *   POST /device-token           -> initiate: generate codes, store in DB
 *   POST /device-token/poll      -> poll: CLI checks if user has approved
 *   POST /device-token/approve   -> approve: authenticated user approves device
 *
 * Reference: architecture doc Section 11.2, Sprint 2.
 */

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

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import { notifyTelegram } from "../_shared/telegram.ts";
import { generateApiKey } from "./api-key.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEVICE_CODE_LENGTH = 32; // 32 hex chars
const USER_CODE_PATTERN = /^[A-Z]{4}-[A-Z]{4}$/;
const CONFIRMATION_CODE_LENGTH = 6;
const EXPIRY_MINUTES = 15;
const MIN_POLL_INTERVAL_SECONDS = 3;
const VERIFICATION_URL_PATH = "/device";

// ─── Code Generation Helpers ────────────────────────────────────────────────

/** Generate a cryptographically random hex string of `length` characters. */
function generateHexCode(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, length);
}

/** Generate a user code in ABCD-EFGH format (uppercase letters only, no ambiguous chars). */
function generateUserCode(): string {
  // Exclude ambiguous characters: 0/O, 1/I/L
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes).map(
    (b) => alphabet[b % alphabet.length],
  );
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

/** Generate a 6-digit numeric confirmation code. */
function generateConfirmationCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  // Convert to a number and take modulo 1000000 to get 6 digits
  const num =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 1000000).padStart(CONFIRMATION_CODE_LENGTH, "0");
}

// ─── Route: POST /device-token (initiate) ───────────────────────────────────

async function handleInitiate(origin: string): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  const deviceCode = generateHexCode(DEVICE_CODE_LENGTH);
  const userCode = generateUserCode();
  const confirmationCode = generateConfirmationCode();

  const expiresAt = new Date(
    Date.now() + EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  // Insert into device_codes table
  const { error } = await db.from("device_codes").insert({
    device_code: deviceCode,
    user_code: userCode,
    confirmation_code: confirmationCode,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    console.error("Failed to insert device code:", error.message);

    // Handle unique constraint violations (extremely rare but possible)
    if (error.code === "23505") {
      return corsRes(
        { error: "code_collision", error_description: "Please retry the request" },
        { status: 409 },
      );
    }

    return corsRes(
      { error: "server_error", error_description: "Failed to generate device code" },
      { status: 500 },
    );
  }

  // Build the verification URL
  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const verificationUrl = `${siteUrl}${VERIFICATION_URL_PATH}?code=${userCode}`;

  return corsRes({
    device_code: deviceCode,
    user_code: userCode,
    confirmation_code: confirmationCode,
    verification_url: verificationUrl,
    expires_in: EXPIRY_MINUTES * 60,
    interval: MIN_POLL_INTERVAL_SECONDS,
  });
}

// ─── Route: POST /device-token/poll ─────────────────────────────────────────

interface PollRequestBody {
  device_code?: string;
}

async function handlePoll(req: Request, origin: string): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // Parse and validate body
  let body: PollRequestBody;
  try {
    body = await req.json();
  } catch {
    return corsRes(
      { error: "invalid_request", error_description: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { device_code } = body;

  if (!device_code || typeof device_code !== "string") {
    return corsRes(
      { error: "invalid_request", error_description: "device_code is required" },
      { status: 400 },
    );
  }

  if (device_code.length !== DEVICE_CODE_LENGTH) {
    return corsRes(
      { error: "invalid_request", error_description: "Invalid device_code format" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Look up the device code
  const { data: record, error } = await db
    .from("device_codes")
    .select("id, device_code, user_code, status, user_id, expires_at")
    .eq("device_code", device_code)
    .single();

  if (error || !record) {
    return corsRes(
      { error: "invalid_grant", error_description: "Device code not found" },
      { status: 404 },
    );
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  if (now > expiresAt) {
    // Mark as expired if not already
    if (record.status === "pending") {
      await db
        .from("device_codes")
        .update({ status: "expired" })
        .eq("id", record.id);
    }

    return corsRes(
      { error: "expired_token", error_description: "Device code has expired" },
      { status: 410 },
    );
  }

  // Status-based responses
  switch (record.status) {
    case "pending":
      return corsRes(
        { error: "authorization_pending", error_description: "Awaiting user authorization" },
        { status: 428 },
      );

    case "denied":
      return corsRes(
        { error: "access_denied", error_description: "User denied the authorization request" },
        { status: 403 },
      );

    case "expired":
      return corsRes(
        { error: "expired_token", error_description: "Device code has expired" },
        { status: 410 },
      );

    case "approved": {
      // Retrieve the API key that was generated during approval.
      if (!record.user_id) {
        return corsRes(
          { error: "server_error", error_description: "Approved but no user linked" },
          { status: 500 },
        );
      }

      const { data: apiKey, error: keyError } = await db
        .from("api_keys")
        .select("id, key_prefix, created_at")
        .eq("user_id", record.user_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (keyError || !apiKey) {
        return corsRes(
          { error: "server_error", error_description: "API key not found for approved device" },
          { status: 500 },
        );
      }

      // The raw API key was stored temporarily in the device_codes row
      // during approval. Atomically read and clear it (one-time read).
      const { data: rawApiKey } = await db.rpc("consume_device_raw_key", {
        p_device_code_id: record.id,
      });

      return corsRes({
        status: "approved",
        api_key: rawApiKey ?? undefined,
        key_prefix: apiKey.key_prefix,
        user_id: record.user_id,
      });
    }

    default:
      return corsRes(
        { error: "server_error", error_description: `Unknown status: ${record.status}` },
        { status: 500 },
      );
  }
}

// ─── Route: POST /device-token/approve ──────────────────────────────────────

interface ApproveRequestBody {
  user_code?: string;
  confirmation_code?: string;
}

async function handleApprove(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";

  // Bind origin to corsResponse for origin-aware CORS
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // 1. Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      { error: "unauthorized", error_description: authError ?? "Authentication required" },
      { status: 401 },
    );
  }

  // 1b. Rate limit check
  const rateLimitDb = supabaseAdmin();
  const rateLimitResult = await checkRateLimit(user.id, "device-token", rateLimitDb);
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

  // 2. Parse and validate body
  let body: ApproveRequestBody;
  try {
    body = await req.json();
  } catch {
    return corsRes(
      { error: "invalid_request", error_description: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { user_code, confirmation_code } = body;

  if (!user_code || typeof user_code !== "string") {
    return corsRes(
      { error: "invalid_request", error_description: "user_code is required" },
      { status: 400 },
    );
  }

  if (!USER_CODE_PATTERN.test(user_code)) {
    return corsRes(
      { error: "invalid_request", error_description: "user_code must be in ABCD-EFGH format" },
      { status: 400 },
    );
  }

  if (!confirmation_code || typeof confirmation_code !== "string") {
    return corsRes(
      { error: "invalid_request", error_description: "confirmation_code is required" },
      { status: 400 },
    );
  }

  if (
    confirmation_code.length !== CONFIRMATION_CODE_LENGTH ||
    !/^\d+$/.test(confirmation_code)
  ) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: `confirmation_code must be ${CONFIRMATION_CODE_LENGTH} digits`,
      },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // 3. Look up the device code by user_code
  const { data: record, error: lookupError } = await db
    .from("device_codes")
    .select("id, device_code, user_code, confirmation_code, status, expires_at")
    .eq("user_code", user_code)
    .single();

  if (lookupError || !record) {
    return corsRes(
      { error: "not_found", error_description: "Device code not found for this user_code" },
      { status: 404 },
    );
  }

  // 4. Check status
  if (record.status !== "pending") {
    return corsRes(
      { error: "invalid_state", error_description: `Device code is already ${record.status}` },
      { status: 409 },
    );
  }

  // 5. Check expiry
  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  if (now > expiresAt) {
    await db
      .from("device_codes")
      .update({ status: "expired" })
      .eq("id", record.id);

    return corsRes(
      { error: "expired_token", error_description: "Device code has expired" },
      { status: 410 },
    );
  }

  // 6. Verify the confirmation code (CSRF protection)
  if (record.confirmation_code !== confirmation_code) {
    return corsRes(
      { error: "invalid_code", error_description: "Confirmation code does not match" },
      { status: 403 },
    );
  }

  // 7. Generate an API key for this user
  const { rawKey, keyHash, keyPrefix } = await generateApiKey();

  // 8. Insert the API key into api_keys table
  const { data: apiKeyRecord, error: insertKeyError } = await db
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: `CLI Device (${user_code})`,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertKeyError || !apiKeyRecord) {
    console.error("Failed to insert API key:", insertKeyError?.message);
    return corsRes(
      { error: "server_error", error_description: "Failed to create API key" },
      { status: 500 },
    );
  }

  // 9. Update device_codes: set status = approved, link user_id, store raw key temporarily
  const { error: updateError } = await db
    .from("device_codes")
    .update({
      status: "approved",
      user_id: user.id,
      raw_api_key: rawKey,
    })
    .eq("id", record.id);

  if (updateError) {
    console.error("Failed to update device code:", updateError.message);
    return corsRes(
      { error: "server_error", error_description: "Failed to approve device code" },
      { status: 500 },
    );
  }

  // Notify admin via Telegram (fire-and-forget)
  notifyTelegram(`<b>New user signup</b>\n${user.email ?? user.id}`);

  return corsRes({
    status: "approved",
    key_prefix: keyPrefix,
    message: "Device authorized. The CLI will receive the API key on next poll.",
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────

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

  // Route based on URL path
  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    // Normalize: strip trailing slash, extract the sub-path after the function name
    // Edge Functions are mounted at /functions/v1/<function-name>
    // So paths look like: /device-token, /device-token/poll, /device-token/approve
    // After Supabase routing: /, /poll, /approve
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? "";

    let response: Response;

    if (lastSegment === "poll") {
      response = await handlePoll(req, origin);
    } else if (lastSegment === "approve") {
      response = await handleApprove(req);
    } else {
      // Default: initiate (POST /device-token)
      // Covers: /device-token, /, empty path
      response = await handleInitiate(origin);
    }

    // Append security headers to every response
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in device-token:", err);
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description: err instanceof Error ? err.message : "Internal server error",
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
