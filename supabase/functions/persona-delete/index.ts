// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Edge Function: persona-delete
 *
 * Deletes a persona and its associated assets. Also removes the cloned
 * voice from ElevenLabs if one exists.
 *
 * Route: POST /functions/v1/persona-delete
 *
 * Body:
 *   { "persona_id": "uuid" }
 *   or
 *   { "slug": "my-persona" }
 *
 * Response (200):
 *   { deleted: true, persona_id, voice_deleted: boolean }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

const log = createLogger("persona-delete");

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

interface DeleteRequestBody {
  persona_id?: string;
  slug?: string;
}

async function handleDelete(req: Request, origin: string): Promise<Response> {
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

  const reqLog = log.withContext({ userId: user.id });

  // ═══ STEP 2: PARSE INPUT ═════════════════════════════════════════════
  let body: DeleteRequestBody;
  try {
    body = await req.json();
  } catch {
    return corsRes(
      { error: "invalid_request", error_description: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!body.persona_id && !body.slug) {
    return corsRes(
      { error: "invalid_request", error_description: "Either persona_id or slug is required" },
      { status: 400 },
    );
  }

  // ═══ STEP 3: FIND PERSONA ════════════════════════════════════════════
  let query = db
    .from("user_personas")
    .select("id, voice_id, voice_provider, face_photo_url")
    .eq("user_id", user.id);

  if (body.persona_id) {
    query = query.eq("id", body.persona_id);
  } else {
    query = query.eq("slug", body.slug!);
  }

  const { data: persona, error: findError } = await query.maybeSingle();

  if (findError) {
    reqLog.error("Persona lookup failed", { error: findError.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to look up persona" },
      { status: 500 },
    );
  }

  if (!persona) {
    return corsRes(
      { error: "not_found", error_description: "Persona not found" },
      { status: 404 },
    );
  }

  reqLog.info("Deleting persona", { personaId: persona.id });

  // ═══ STEP 4: DELETE VOICE FROM ELEVENLABS ════════════════════════════
  let voiceDeleted = false;

  if (persona.voice_id && persona.voice_provider === "elevenlabs" && ELEVENLABS_API_KEY) {
    try {
      const deleteRes = await fetch(
        `https://api.elevenlabs.io/v1/voices/${persona.voice_id}`,
        {
          method: "DELETE",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        },
      );

      if (deleteRes.ok) {
        voiceDeleted = true;
        reqLog.info("Voice deleted from ElevenLabs", { voiceId: persona.voice_id });
      } else {
        reqLog.warn("Failed to delete voice from ElevenLabs", {
          voiceId: persona.voice_id,
          status: deleteRes.status,
        });
      }
    } catch (err) {
      reqLog.warn("ElevenLabs voice delete threw", {
        error: (err as Error).message,
      });
    }
  }

  // ═══ STEP 5: DELETE STORAGE ASSETS ═══════════════════════════════════
  const { data: assets } = await db
    .from("persona_assets")
    .select("storage_path")
    .eq("persona_id", persona.id);

  if (assets && assets.length > 0) {
    const paths = assets.map((a: { storage_path: string }) => a.storage_path);
    const { error: storageError } = await db.storage
      .from("persona-assets")
      .remove(paths);

    if (storageError) {
      reqLog.warn("Storage cleanup failed", { error: storageError.message });
    }
  }

  // ═══ STEP 6: DELETE DB RECORDS ═══════════════════════════════════════
  // Delete assets first (FK), then persona
  await db.from("persona_assets").delete().eq("persona_id", persona.id);

  const { error: deleteError } = await db
    .from("user_personas")
    .delete()
    .eq("id", persona.id)
    .eq("user_id", user.id);

  if (deleteError) {
    reqLog.error("Persona delete failed", { error: deleteError.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to delete persona" },
      { status: 500 },
    );
  }

  reqLog.info("Persona deleted", { personaId: persona.id, voiceDeleted });

  return corsRes({
    deleted: true,
    persona_id: persona.id,
    voice_deleted: voiceDeleted,
  });
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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }

  try {
    const response = await handleDelete(req, origin);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    log.fatal("Unhandled error in persona-delete", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }
});
