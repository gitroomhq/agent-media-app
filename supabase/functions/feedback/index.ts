// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: feedback
 *
 * Collects user feedback from the dashboard widget. Rate-limited to
 * 10 submissions per hour per user via a simple count query against
 * the feedback table.
 *
 * Route:
 *   POST /functions/v1/feedback { type, message, rating?, page_url? }
 *
 * Response:
 *   { success: true, id: <feedback_uuid> }
 */

import { corsResponse, corsPreflightResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_FEEDBACK_PER_HOUR = 10;
const VALID_TYPES = new Set(["bug", "feature", "general"]);

// ── Handler ─────────────────────────────────────────────────────────────────

async function handleFeedback(req: Request): Promise<Response> {
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

  // 2. Parse and validate request body
  let body: {
    type?: string;
    message?: string;
    rating?: number;
    page_url?: string;
  };
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

  // Validate type
  if (!body.type || typeof body.type !== "string") {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Field 'type' is required",
      },
      { status: 400 },
    );
  }

  if (!VALID_TYPES.has(body.type)) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: `Invalid type. Must be one of: ${[...VALID_TYPES].join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Validate message
  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Field 'message' is required and must be non-empty",
      },
      { status: 400 },
    );
  }

  const message = body.message.trim();
  if (message.length > 5000) {
    return corsRes(
      {
        error: "invalid_request",
        error_description: "Message must be 5000 characters or fewer",
      },
      { status: 400 },
    );
  }

  // Validate optional rating
  if (body.rating !== undefined && body.rating !== null) {
    if (
      typeof body.rating !== "number" ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 5
    ) {
      return corsRes(
        {
          error: "invalid_request",
          error_description: "Rating must be an integer between 1 and 5",
        },
        { status: 400 },
      );
    }
  }

  // Validate optional page_url
  if (body.page_url !== undefined && body.page_url !== null) {
    if (typeof body.page_url !== "string") {
      return corsRes(
        {
          error: "invalid_request",
          error_description: "Field 'page_url' must be a string",
        },
        { status: 400 },
      );
    }
  }

  const db = supabaseAdmin();

  // 3. Rate limit: count feedback from this user in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: recentCount, error: countError } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("feedback: rate limit check failed:", countError.message);
    // Fail open on count errors to avoid blocking legitimate feedback
  } else if (recentCount !== null && recentCount >= MAX_FEEDBACK_PER_HOUR) {
    return corsRes(
      {
        error: "rate_limit_exceeded",
        error_description: `Maximum ${MAX_FEEDBACK_PER_HOUR} feedback submissions per hour`,
      },
      { status: 429 },
    );
  }

  // 4. Insert feedback
  const { data: inserted, error: insertError } = await db
    .from("feedback")
    .insert({
      user_id: user.id,
      type: body.type,
      message,
      rating: body.rating ?? null,
      page_url: body.page_url ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("feedback: insert failed:", insertError?.message);
    return corsRes(
      {
        error: "server_error",
        error_description: "Failed to save feedback",
      },
      { status: 500 },
    );
  }

  return corsRes({
    success: true,
    id: inserted.id,
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

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
    const response = await handleFeedback(req);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("Unhandled error in feedback:", err);
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
