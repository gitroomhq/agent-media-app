// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: apikey-manage
 *
 * Manages user API keys: create, list, and revoke.
 *
 * Route:
 *   POST /functions/v1/apikey-manage
 *
 * Body:
 *   { "action": "create", "name": "My Key" }
 *   { "action": "list" }
 *   { "action": "revoke", "keyId": "uuid" }
 *
 * Responses:
 *   create -> { "key": "am_...", "id": "uuid", "key_prefix": "am_a1b2c3d4", "name": "My Key", "created_at": "..." }
 *   list   -> { "keys": [{ "id", "key_prefix", "name", "created_at", "last_used_at" }] }
 *   revoke -> { "revoked": true, "id": "uuid" }
 *
 * Error responses:
 *   400: Invalid action / missing params
 *   401: Not authenticated
 *   404: Key not found (revoke)
 *   429: Rate limit exceeded
 *   500: Server error
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limit.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Types ───────────────────────────────────────────────────────────────────

interface CreateAction {
  action: "create";
  name?: string;
}

interface ListAction {
  action: "list";
}

interface RevokeAction {
  action: "revoke";
  keyId: string;
}

type ApiKeyRequestBody = CreateAction | ListAction | RevokeAction;

// ── Constants ───────────────────────────────────────────────────────────────

const API_KEY_PREFIX = "ma_";
const MAX_KEY_NAME_LENGTH = 100;
const DEFAULT_KEY_NAME = "Default";

/**
 * Maximum number of active API keys per user.
 * Prevents abuse and keeps the key management UI manageable.
 */
const MAX_ACTIVE_KEYS_PER_USER = 25;

// ── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure API key with SHA-256 hash.
 *
 * Key format: am_<32 hex chars from UUID without dashes>
 * Hash:       SHA-256 hex digest of the full key
 * Prefix:     First 12 characters of the key for display (e.g. "am_a1b2c3d4")
 */
async function generateApiKey(): Promise<{
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}> {
  // Generate key using UUID (no dashes)
  const rawKey = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;

  // Hash with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Display prefix: first 12 characters of the key
  const keyPrefix = rawKey.substring(0, 12);

  return { rawKey, keyHash, keyPrefix };
}

// ── Request Validation ──────────────────────────────────────────────────────

function validateRequest(
  body: Record<string, unknown>,
): ApiKeyRequestBody | { error: string } {
  const action = body.action;

  if (!action || typeof action !== "string") {
    return { error: "action is required and must be a string" };
  }

  if (!["create", "list", "revoke"].includes(action)) {
    return {
      error: `Invalid action '${action}'. Must be one of: create, list, revoke`,
    };
  }

  if (action === "create") {
    const name = body.name ?? DEFAULT_KEY_NAME;
    if (typeof name !== "string") {
      return { error: "name must be a string" };
    }
    if (name.length === 0 || name.length > MAX_KEY_NAME_LENGTH) {
      return {
        error: `name must be between 1 and ${MAX_KEY_NAME_LENGTH} characters`,
      };
    }
    // Reject control characters in name
    if (/[\x00-\x1f\x7f]/.test(name)) {
      return { error: "name must not contain control characters" };
    }
    return { action: "create", name };
  }

  if (action === "list") {
    return { action: "list" };
  }

  // action === "revoke"
  const keyId = body.keyId;
  if (!keyId || typeof keyId !== "string") {
    return { error: "keyId is required for revoke action and must be a string" };
  }

  // Validate UUID format
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(keyId)) {
    return { error: "keyId must be a valid UUID" };
  }

  return { action: "revoke", keyId };
}

// ── Action Handlers ─────────────────────────────────────────────────────────

/**
 * Create a new API key.
 *
 * Generates a random key with the `am_` prefix, hashes it with SHA-256,
 * stores the hash in the database, and returns the raw key to the user
 * exactly once.
 */
async function handleCreate(
  userId: string,
  name: string,
  origin: string,
): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  // Check active key count to prevent abuse
  const { count: activeCount, error: countError } = await db
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (countError) {
    console.error("Failed to count active API keys:", countError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to verify key limit",
      },
      { status: 500 },
    );
  }

  if ((activeCount ?? 0) >= MAX_ACTIVE_KEYS_PER_USER) {
    return corsRes(
      {
        error: "key_limit_exceeded",
        error_description:
          `Maximum of ${MAX_ACTIVE_KEYS_PER_USER} active API keys allowed. Revoke an existing key first.`,
        active_keys: activeCount,
        max_keys: MAX_ACTIVE_KEYS_PER_USER,
      },
      { status: 400 },
    );
  }

  // Generate the key
  const { rawKey, keyHash, keyPrefix } = await generateApiKey();

  // Store the hashed key
  const { data: inserted, error: insertError } = await db
    .from("api_keys")
    .insert({
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      is_active: true,
    })
    .select("id, key_prefix, name, created_at")
    .single();

  if (insertError) {
    console.error("Failed to insert API key:", insertError.message);

    // Handle unique constraint violation on key_hash (astronomically rare)
    if (insertError.code === "23505") {
      return corsRes(
        {
          error: "key_collision",
          error_description: "Key generation collision. Please retry.",
        },
        { status: 409 },
      );
    }

    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to create API key",
      },
      { status: 500 },
    );
  }

  // Return the raw key -- this is the only time it is shown
  return corsRes(
    {
      key: rawKey,
      id: inserted.id,
      key_prefix: inserted.key_prefix,
      name: inserted.name,
      created_at: inserted.created_at,
    },
    { status: 201 },
  );
}

/**
 * List all active API keys for the user.
 *
 * Returns key metadata only -- the raw key is never stored or returned
 * after creation.
 */
async function handleList(userId: string, origin: string): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  const { data: keys, error: listError } = await db
    .from("api_keys")
    .select("id, key_prefix, name, created_at, last_used_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (listError) {
    console.error("Failed to list API keys:", listError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to list API keys",
      },
      { status: 500 },
    );
  }

  return corsRes({ keys: keys ?? [] });
}

/**
 * Revoke (soft-delete) an API key.
 *
 * Sets is_active=false and records the revocation timestamp.
 * The key hash remains in the database for audit purposes.
 */
async function handleRevoke(
  userId: string,
  keyId: string,
  origin: string,
): Promise<Response> {
  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);
  const db = supabaseAdmin();

  // Verify the key exists and belongs to the user
  const { data: existing, error: lookupError } = await db
    .from("api_keys")
    .select("id, is_active")
    .eq("id", keyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to look up API key:", lookupError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to look up API key",
      },
      { status: 500 },
    );
  }

  if (!existing) {
    return corsRes(
      {
        error: "not_found",
        error_description: "API key not found",
      },
      { status: 404 },
    );
  }

  if (!existing.is_active) {
    return corsRes(
      {
        error: "already_revoked",
        error_description: "API key has already been revoked",
      },
      { status: 400 },
    );
  }

  // Soft-delete: set is_active=false and record revocation time
  const { error: updateError } = await db
    .from("api_keys")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", keyId)
    .eq("user_id", userId);

  if (updateError) {
    console.error("Failed to revoke API key:", updateError.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to revoke API key",
      },
      { status: 500 },
    );
  }

  return corsRes({ revoked: true, id: keyId });
}

// ── Main Handler ────────────────────────────────────────────────────────────

async function handleApiKeyManage(req: Request): Promise<Response> {
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
  const rateLimitResult = await checkRateLimit(user.id, "apikey-manage", db);
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
  let body: Record<string, unknown>;
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

  const validated = validateRequest(body);
  if ("error" in validated) {
    return corsRes(
      { error: "invalid_request", error_description: validated.error },
      { status: 400 },
    );
  }

  // 4. Route to action handler
  switch (validated.action) {
    case "create":
      return await handleCreate(user.id, validated.name ?? DEFAULT_KEY_NAME, origin);

    case "list":
      return await handleList(user.id, origin);

    case "revoke":
      return await handleRevoke(user.id, validated.keyId, origin);

    default:
      return corsRes(
        {
          error: "invalid_request",
          error_description: "Unknown action",
        },
        { status: 400 },
      );
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
    const response = await handleApiKeyManage(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in apikey-manage:", err);
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
