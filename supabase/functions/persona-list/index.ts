// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Edge Function: persona-list
 *
 * Returns all personas for the authenticated user.
 *
 * Route: GET /functions/v1/persona-list
 *
 * Response (200):
 *   { personas: [{ id, name, slug, voice_clone_status, voice_id, face_photo_url, is_default, created_at }] }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

const log = createLogger("persona-list");

async function handleList(req: Request, origin: string): Promise<Response> {
  const db = supabaseAdmin();

  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, origin);

  // ═══ STEP 1: AUTHENTICATE ════════════════════════════════════════════
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      { error: "unauthorized", error_description: authError ?? "Authentication required" },
      { status: 401 },
    );
  }

  // ═══ STEP 2: FETCH PERSONAS ══════════════════════════════════════════
  const { data: personas, error: fetchError } = await db
    .from("user_personas")
    .select("id, name, slug, voice_provider, voice_id, voice_clone_status, face_photo_url, subtitle_style, pacing, is_default, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (fetchError) {
    log.error("Failed to fetch personas", { error: fetchError.message, userId: user.id });
    return corsRes(
      { error: "server_error", error_description: "Failed to fetch personas" },
      { status: 500 },
    );
  }

  return corsRes({ personas: personas ?? [] });
}

// ── Router ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...getCorsHeaders(origin), ...getSecurityHeaders() },
    });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }

  try {
    const response = await handleList(req, origin);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    log.fatal("Unhandled error in persona-list", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }
});
