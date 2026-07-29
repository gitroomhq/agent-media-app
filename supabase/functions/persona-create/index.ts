// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Edge Function: persona-create
 *
 * Creates a new persona by uploading a voice sample and face photo.
 * Voice cloning happens via ElevenLabs Instant Voice Clone (synchronous).
 * Face photo is stored in Supabase Storage for later use by Kling Avatar v2 Pro
 * and Kling V3 Elements.
 *
 * Route: POST /functions/v1/persona-create
 *
 * Body (multipart/form-data):
 *   name: string (required)
 *   voice_sample: File (MP3/WAV, 1-2 min, required)
 *   face_photo: File (JPG/PNG, min 512x512, required)
 *
 * Response (201):
 *   { persona_id, name, slug, voice_clone_status, face_photo_url }
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

const log = createLogger("persona-create");

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

const VALID_VOICE_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3"]);
const VALID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_VOICE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

async function handleCreate(req: Request, origin: string): Promise<Response> {
  const db = supabaseAdmin();
  const elapsed = log.startTimer();

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

  // ═══ STEP 2: PARSE MULTIPART FORM ════════════════════════════════════
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return corsRes(
      { error: "invalid_request", error_description: "Request body must be multipart/form-data" },
      { status: 400 },
    );
  }

  const name = formData.get("name") as string | null;
  const voiceSample = formData.get("voice_sample") as File | null;
  const facePhoto = formData.get("face_photo") as File | null;

  if (!name || name.trim().length < 1) {
    return corsRes(
      { error: "invalid_request", error_description: "name is required" },
      { status: 400 },
    );
  }

  if (!voiceSample) {
    return corsRes(
      { error: "invalid_request", error_description: "voice_sample file is required" },
      { status: 400 },
    );
  }

  if (!facePhoto) {
    return corsRes(
      { error: "invalid_request", error_description: "face_photo file is required" },
      { status: 400 },
    );
  }

  // Validate file types and sizes
  if (!VALID_VOICE_TYPES.has(voiceSample.type)) {
    return corsRes(
      { error: "invalid_request", error_description: `Invalid voice sample type '${voiceSample.type}'. Use MP3 or WAV.` },
      { status: 400 },
    );
  }

  if (voiceSample.size > MAX_VOICE_SIZE) {
    return corsRes(
      { error: "invalid_request", error_description: "Voice sample exceeds 10 MB limit" },
      { status: 400 },
    );
  }

  if (!VALID_IMAGE_TYPES.has(facePhoto.type)) {
    return corsRes(
      { error: "invalid_request", error_description: `Invalid face photo type '${facePhoto.type}'. Use JPG, PNG, or WebP.` },
      { status: 400 },
    );
  }

  if (facePhoto.size > MAX_IMAGE_SIZE) {
    return corsRes(
      { error: "invalid_request", error_description: "Face photo exceeds 10 MB limit" },
      { status: 400 },
    );
  }

  const slug = slugify(name.trim());

  // Check for duplicate slug
  const { data: existing } = await db
    .from("user_personas")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return corsRes(
      { error: "conflict", error_description: `A persona with slug '${slug}' already exists` },
      { status: 409 },
    );
  }

  reqLog.info("Creating persona", { name: name.trim(), slug });

  // ═══ STEP 3: UPLOAD ASSETS TO STORAGE ════════════════════════════════

  const personaId = crypto.randomUUID();
  const voiceExt = voiceSample.name.endsWith(".wav") ? "wav" : "mp3";
  const imageExt = facePhoto.type === "image/png" ? "png" : facePhoto.type === "image/webp" ? "webp" : "jpg";

  const voiceStoragePath = `${user.id}/voice/${personaId}.${voiceExt}`;
  const faceStoragePath = `${user.id}/face/${personaId}.${imageExt}`;

  const voiceBuffer = new Uint8Array(await voiceSample.arrayBuffer());
  const faceBuffer = new Uint8Array(await facePhoto.arrayBuffer());

  const [voiceUpload, faceUpload] = await Promise.all([
    db.storage.from("persona-assets").upload(voiceStoragePath, voiceBuffer, {
      contentType: voiceSample.type,
      upsert: false,
    }),
    db.storage.from("persona-assets").upload(faceStoragePath, faceBuffer, {
      contentType: facePhoto.type,
      upsert: false,
    }),
  ]);

  if (voiceUpload.error) {
    reqLog.error("Voice upload failed", { error: voiceUpload.error.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to upload voice sample" },
      { status: 500 },
    );
  }

  if (faceUpload.error) {
    reqLog.error("Face upload failed", { error: faceUpload.error.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to upload face photo" },
      { status: 500 },
    );
  }

  // ═══ STEP 4: CLONE VOICE VIA ELEVENLABS ══════════════════════════════

  let voiceId: string | null = null;
  let voiceCloneStatus: string = "pending";

  if (ELEVENLABS_API_KEY) {
    try {
      const cloneForm = new FormData();
      cloneForm.append("name", `agent-media-${slug}-${user.id.substring(0, 8)}`);
      cloneForm.append("files", new Blob([voiceBuffer], { type: voiceSample.type }), voiceSample.name);
      cloneForm.append("remove_background_noise", "true");

      const cloneRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        body: cloneForm,
      });

      if (!cloneRes.ok) {
        const errBody = await cloneRes.text().catch(() => "unknown");
        throw new Error(`ElevenLabs clone failed (${cloneRes.status}): ${errBody}`);
      }

      const cloneResult = await cloneRes.json();
      voiceId = cloneResult.voice_id;
      voiceCloneStatus = "ready";

      reqLog.info("Voice cloned successfully", { voiceId });
    } catch (err) {
      reqLog.error("Voice cloning failed", { error: (err as Error).message });
      voiceCloneStatus = "failed";
      // Continue — persona is still created with face, voice can be retried
    }
  } else {
    reqLog.warn("ELEVENLABS_API_KEY not set, skipping voice clone");
    voiceCloneStatus = "failed";
  }

  // ═══ STEP 5: CREATE PERSONA RECORD ════════════════════════════════════

  // Generate a signed URL for the face photo (long-lived for video generation)
  const { data: faceSignedData } = await db.storage
    .from("persona-assets")
    .createSignedUrl(faceStoragePath, 365 * 24 * 3600); // 1 year

  const facePhotoUrl = faceSignedData?.signedUrl ?? faceStoragePath;

  const { error: insertError } = await db.from("user_personas").insert({
    id: personaId,
    user_id: user.id,
    name: name.trim(),
    slug,
    voice_provider: "elevenlabs",
    voice_id: voiceId,
    voice_clone_status: voiceCloneStatus,
    face_photo_url: faceStoragePath,
    is_default: false,
  });

  if (insertError) {
    reqLog.error("Persona insert failed", { error: insertError.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to create persona record" },
      { status: 500 },
    );
  }

  // Insert asset records
  await Promise.all([
    db.from("persona_assets").insert({
      persona_id: personaId,
      user_id: user.id,
      asset_type: "voice_sample",
      storage_path: voiceStoragePath,
      file_name: voiceSample.name,
      mime_type: voiceSample.type,
      file_size_bytes: voiceSample.size,
    }),
    db.from("persona_assets").insert({
      persona_id: personaId,
      user_id: user.id,
      asset_type: "face_photo",
      storage_path: faceStoragePath,
      file_name: facePhoto.name,
      mime_type: facePhoto.type,
      file_size_bytes: facePhoto.size,
    }),
  ]);

  reqLog.info("Persona created", { personaId, slug, voiceCloneStatus, durationMs: elapsed() });

  return corsRes(
    {
      persona_id: personaId,
      name: name.trim(),
      slug,
      voice_clone_status: voiceCloneStatus,
      voice_id: voiceId,
      face_photo_url: facePhotoUrl,
    },
    { status: 201 },
  );
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
    const response = await handleCreate(req, origin);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    log.fatal("Unhandled error in persona-create", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }
});
