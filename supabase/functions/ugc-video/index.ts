// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Edge Function: ugc-video
 *
 * Thin orchestrator that validates the request, estimates duration,
 * deducts credits, creates a generation job, and dispatches the actual
 * work to a Railway-hosted media worker (GPT-4o + TTS + fal.ai + FFmpeg).
 *
 * Route:
 *   POST /functions/v1/ugc-video
 *
 * Body:
 *   {
 *     "script": "Ever wonder why top founders wake up at 5am?...",
 *     "voice": "alloy",
 *     "model": "fal-ai/minimax-video/video-01-live",
 *     "style": "hormozi"
 *   }
 *
 * Response (201):
 *   {
 *     "job_id": "uuid",
 *     "status": "submitted",
 *     "estimated_duration": 15,
 *     "credits_deducted": 300
 *   }
 *
 * Error responses:
 *   400: Invalid input
 *   401: Not authenticated
 *   402: Insufficient credits
 *   403: Plan tier too low
 *   500: Worker dispatch failed (credits refunded)
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { createLogger } from "../_shared/logger.ts";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

const log = createLogger("ugc-video");

const WORKER_URL = Deno.env.get("SUBTITLE_WORKER_URL"); // Same Railway worker
const WORKER_SECRET = Deno.env.get("SUBTITLE_WORKER_SECRET");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/** Additional credit cost when using AI script generation. */
const SCRIPT_GENERATION_CREDIT_SURCHARGE = 5;

/**
 * Per-second credit cost for UGC videos.
 * At $0.20/sec provider cost and 30 credits/sec, a 10s video = 300 credits (~$3).
 * This ensures ≥100% profit margin on all subscription plans.
 */
const CREDITS_PER_SECOND = 30;

function scriptGenerationPrompt(targetDuration: number): string {
  const wordsPerSec = 2.5;
  const maxWords = Math.round(targetDuration * wordsPerSec);
  return (
    `You are a UGC scriptwriter for short-form vertical video. ` +
    `CRITICAL CONSTRAINT: The video is ${targetDuration} seconds long. ` +
    `Natural speech is ${wordsPerSec} words/second, so write EXACTLY ${maxWords} words maximum. ` +
    `Do NOT exceed ${maxWords} words — count carefully. ` +
    `Structure: Hook (first sentence, grab attention) → 1-2 key points → CTA. ` +
    `Write in first person, conversational, punchy. No filler. Every word must earn its place.`
  );
}

function saasReviewPrompt(targetDuration: number): string {
  const wordsPerSec = 2.5;
  const maxWords = Math.round(targetDuration * wordsPerSec);
  return (
    `You are a UGC creator honestly reviewing a SaaS product for a short vertical video. ` +
    `CRITICAL: The video is ${targetDuration} seconds. At ${wordsPerSec} words/sec, write EXACTLY ${maxWords} words max. ` +
    `Structure: Hook (bold opener, ~2s) → Walkthrough (1-2 features) → Opinion (your take) → CTA. ` +
    `Keep it SHORT. First person, conversational, punchy. No filler. ` +
    `Be specific about features and opinions, not generic.`
  );
}

/** Voice map from face analysis label → ElevenLabs pre-made voice ID. */
const FACE_VOICE_MAP: Record<string, string> = {
  young_female: "cgSgspJ2msm6clMCkdW9", // Jessica
  female: "EXAVITQu4vr4xnSDxMaL",       // Sarah
  young_male: "TX3LPaxmHKxFdv7VOQHJ",   // Liam
  male: "iP95p4xoKVk53GoZ742B",         // Chris
  neutral: "EXAVITQu4vr4xnSDxMaL",      // Sarah (fallback)
};

// ── Request Types ───────────────────────────────────────────────────────────

interface UGCRequestBody {
  script: string;
  voice?: string;
  model?: string;
  style?: string;
  tone?: string;
  persona_slug?: string;
  actor_slug?: string;
  face_photo_url?: string;
  target_duration?: number;
  aspect_ratio?: '9:16' | '16:9' | '1:1';
  music?: string;
  cta?: string;
  generate_script?: boolean;
  script_prompt?: string;
  product_url?: string;
  tts_provider?: 'openai' | 'elevenlabs';
  allow_broll?: boolean;
  broll_images?: string[];
  dub_language?: string;
  scenes_input?: Array<{ type: string; text: string; visual_prompt?: string; image?: string }>;
  product_image_url?: string;
  template?: string;
  broll_model?: string;
  voice_speed?: number;
  composition_mode?: 'pip' | null;
  pip_position?: 'bottom-center' | 'bottom-left' | 'bottom-right' | null;
  pip_size?: 'small' | 'medium' | 'large' | null;
  pip_animation?: 'slide-up' | 'slide-left' | 'slide-right' | 'fade' | 'scale' | null;
  pip_style?: 'none' | 'rounded' | 'shadow' | null;
  webhook_url?: string;
}

const OPENAI_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const VALID_STYLES = new Set([
  "hormozi", "minimal", "bold", "karaoke", "clean",
  "tiktok", "neon", "fire", "glow", "pop", "aesthetic",
  "impact", "pastel", "electric", "boxed", "gradient", "spotlight",
]);
const VALID_TONES = new Set(["energetic", "calm", "confident", "dramatic"]);
const VALID_ASPECT_RATIOS = new Set(["9:16", "16:9", "1:1"]);
const VALID_MUSIC_GENRES = new Set(["chill", "energetic", "corporate", "dramatic", "upbeat"]);
const VALID_TEMPLATES = new Set([
  "monologue", "testimonial", "product-review", "problem-solution",
  "saas-review", "before-after", "listicle", "product-demo",
]);
const VALID_BROLL_MODELS = new Set(["kling3", "hailuo2", "wan21"]);

const MIN_SCRIPT_LENGTH = 50;
const MAX_SCRIPT_LENGTH = 3000;

// Duration buckets for pricing lookup
const DURATION_BUCKETS = [5, 10, 15] as const;

/**
 * Natural speaking pace is ~2.5 words per second.
 * Max recommended words per duration bucket to avoid rushed speech.
 */
const WORDS_PER_SECOND = 2.5;
const MAX_WORDS_PER_DURATION: Record<number, number> = {
  5: Math.floor(5 * WORDS_PER_SECOND),    // 12 words
  10: Math.floor(10 * WORDS_PER_SECOND),   // 25 words
  15: Math.floor(15 * WORDS_PER_SECOND),   // 37 words
};

const MIN_PLAN_TIER = "starter";
const TIER_ORDER: Record<string, number> = {
  free: 0,
  newby: 1,
  starter: 2,
  creator: 3,
  proplus: 4,
  pro_plus: 4,
};

// ── Input Validation ────────────────────────────────────────────────────────

function validateInput(body: UGCRequestBody): { error?: string } {
  // When generate_script is true, script_prompt or product_url is required instead of script
  if (body.generate_script) {
    if (!body.script_prompt && !body.product_url) {
      return { error: "When generate_script is true, either script_prompt or product_url must be provided" };
    }
    if (body.script_prompt && typeof body.script_prompt !== "string") {
      return { error: "script_prompt must be a string" };
    }
    if (body.product_url && typeof body.product_url !== "string") {
      return { error: "product_url must be a string" };
    }
    // Skip normal script validation — the script will be generated
  } else {
    if (!body.script || typeof body.script !== "string") {
      return { error: "script is required and must be a string" };
    }

    const trimmed = body.script.trim();
    if (trimmed.length < MIN_SCRIPT_LENGTH) {
      return { error: `Script too short (${trimmed.length} chars). Minimum is ${MIN_SCRIPT_LENGTH} characters.` };
    }

    if (trimmed.length > MAX_SCRIPT_LENGTH) {
      return { error: `Script too long (${trimmed.length} chars). Maximum is ${MAX_SCRIPT_LENGTH} characters.` };
    }
  }

  // Voice is validated later — it can be an OpenAI preset name OR an ElevenLabs voice_id (from persona).
  // Only validate if it looks like a preset name attempt that doesn't match.
  // When persona_slug is provided, voice is overridden from the persona record.

  if (body.style && !VALID_STYLES.has(body.style)) {
    return { error: `Invalid style '${body.style}'. Must be one of: ${[...VALID_STYLES].join(", ")}` };
  }

  if (body.tone && !VALID_TONES.has(body.tone)) {
    return { error: `Invalid tone '${body.tone}'. Must be one of: ${[...VALID_TONES].join(", ")}` };
  }

  if (body.aspect_ratio && !VALID_ASPECT_RATIOS.has(body.aspect_ratio)) {
    return { error: `Invalid aspect_ratio '${body.aspect_ratio}'. Must be one of: ${[...VALID_ASPECT_RATIOS].join(", ")}` };
  }

  if (body.music && !VALID_MUSIC_GENRES.has(body.music)) {
    return { error: `Invalid music genre '${body.music}'. Must be one of: ${[...VALID_MUSIC_GENRES].join(", ")}` };
  }

  if (body.cta && (typeof body.cta !== "string" || body.cta.length > 100)) {
    return { error: "CTA text must be a string of 100 characters or less" };
  }

  if (body.broll_images !== undefined) {
    if (!Array.isArray(body.broll_images)) {
      return { error: "broll_images must be an array of URLs" };
    }
    if (body.broll_images.length > 10) {
      return { error: "broll_images supports up to 10 images" };
    }
    for (const url of body.broll_images) {
      if (typeof url !== "string" || !url.startsWith("http")) {
        return { error: "Each broll_images entry must be a valid HTTP URL" };
      }
    }
  }

  if (body.dub_language !== undefined && typeof body.dub_language !== "string") {
    return { error: "dub_language must be a BCP-47 language code string (e.g. 'es', 'fr')" };
  }

  if (body.scenes_input !== undefined) {
    if (!Array.isArray(body.scenes_input)) {
      return { error: "scenes_input must be an array of scene objects" };
    }
    if (body.scenes_input.length === 0) {
      return { error: "scenes_input must contain at least one scene" };
    }
    if (body.scenes_input.length > 30) {
      return { error: "scenes_input supports up to 30 scenes" };
    }
    for (const scene of body.scenes_input) {
      if (!scene.text || typeof scene.text !== "string" || scene.text.trim().length === 0) {
        return { error: "Each scene in scenes_input must have a non-empty text field" };
      }
      if (scene.type && scene.type !== "talking_head" && scene.type !== "broll") {
        return { error: `Invalid scene type '${scene.type}'. Must be 'talking_head' or 'broll'` };
      }
      if (scene.image && (typeof scene.image !== "string" || !scene.image.startsWith("http"))) {
        return { error: "Each scene image must be a valid HTTP URL" };
      }
    }
  }

  if (body.product_image_url !== undefined) {
    if (typeof body.product_image_url !== "string" || !body.product_image_url.startsWith("http")) {
      return { error: "product_image_url must be a valid HTTP URL" };
    }
  }

  if (body.template !== undefined) {
    if (!VALID_TEMPLATES.has(body.template)) {
      return { error: `Invalid template '${body.template}'. Must be one of: ${[...VALID_TEMPLATES].join(", ")}` };
    }
  }

  if (body.broll_model !== undefined) {
    if (!VALID_BROLL_MODELS.has(body.broll_model)) {
      return { error: `Invalid broll_model '${body.broll_model}'. Must be one of: ${[...VALID_BROLL_MODELS].join(", ")}` };
    }
  }

  if (body.voice_speed !== undefined) {
    if (typeof body.voice_speed !== "number" || body.voice_speed < 0.7 || body.voice_speed > 1.5) {
      return { error: "voice_speed must be a number between 0.7 and 1.5" };
    }
  }

  // actor_slug is mutually exclusive with persona_slug and face_photo_url
  if (body.actor_slug) {
    if (body.persona_slug) {
      return { error: "actor_slug and persona_slug are mutually exclusive. Use one or the other." };
    }
    if (body.face_photo_url) {
      return { error: "actor_slug and face_photo_url are mutually exclusive. The actor already has a portrait." };
    }
  }

  return {};
}

/**
 * Estimate video duration from script character count.
 * Assumes ~750 characters per minute of spoken narration.
 */
function estimateDuration(script: string): number {
  return Math.ceil((script.length / 750) * 60);
}

/**
 * Map estimated duration to the nearest pricing bucket.
 */
function toDurationBucket(estimatedSeconds: number): number {
  for (const bucket of DURATION_BUCKETS) {
    if (estimatedSeconds <= bucket) return bucket;
  }
  return DURATION_BUCKETS[DURATION_BUCKETS.length - 1]; // Max bucket
}

function isTierSufficient(userTier: string): boolean {
  const userLevel = TIER_ORDER[userTier] ?? 0;
  const requiredLevel = TIER_ORDER[MIN_PLAN_TIER] ?? 0;
  return userLevel >= requiredLevel;
}

/**
 * Call GPT-4o Vision to determine the best TTS voice for a face photo.
 * Returns the OpenAI voice name or null if detection fails.
 */
async function detectVoiceFromFace(imageUrl: string): Promise<{ voice: string; label: string } | null> {
  if (!OPENAI_API_KEY) return null;

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You analyze face photos. Return ONLY one of these exact labels: young_female, female, young_male, male, neutral. No other text.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "What is the apparent gender and age group of this person?" },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 10,
      }),
    }, 15_000);

    if (!response.ok) return null;

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const label = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "neutral";
    const voice = FACE_VOICE_MAP[label] ?? "alloy";
    return { voice, label };
  } catch {
    return null;
  }
}

/**
 * Call OpenAI GPT-4o to generate a UGC script from a product description / prompt.
 */
async function generateScriptFromPrompt(
  scriptPrompt: string,
  productUrl?: string | null,
  template?: string | null,
  targetDuration?: number | null,
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let userMessage = scriptPrompt;
  if (productUrl) {
    userMessage += `\n\nProduct URL for reference: ${productUrl}`;
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: template === "saas-review" ? saasReviewPrompt(targetDuration ?? 10) : scriptGenerationPrompt(targetDuration ?? 10) },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.8,
    }),
  }, 30_000);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const generatedScript = data.choices?.[0]?.message?.content?.trim();
  if (!generatedScript) {
    throw new Error("OpenAI returned an empty script");
  }

  return generatedScript;
}

// ── Main Handler ────────────────────────────────────────────────────────────

async function handleUGC(req: Request, _origin: string): Promise<Response> {
  const db = supabaseAdmin();
  const elapsed = log.startTimer();

  const corsRes = (body: unknown, init?: ResponseInit) =>
    corsResponse(body, init, _origin);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: AUTHENTICATE
  // ═══════════════════════════════════════════════════════════════════════
  const { user, error: authError } = await verifyAuth(req);
  if (authError || !user) {
    return corsRes(
      { error: "unauthorized", error_description: authError ?? "Authentication required" },
      { status: 401 },
    );
  }

  const reqLog = log.withContext({ userId: user.id });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: VALIDATE INPUT
  // ═══════════════════════════════════════════════════════════════════════
  let body: UGCRequestBody;
  try {
    body = await req.json();
  } catch {
    return corsRes(
      { error: "invalid_request", error_description: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const validation = validateInput(body);
  if (validation.error) {
    return corsRes(
      { error: "invalid_request", error_description: validation.error },
      { status: 400 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2a: GENERATE SCRIPT (if requested)
  // ═══════════════════════════════════════════════════════════════════════
  let generatedScript: string | null = null;

  if (body.generate_script) {
    const prompt = body.script_prompt ?? "";
    reqLog.info("Generating UGC script via GPT-4o", {
      promptLength: prompt.length,
      hasProductUrl: !!body.product_url,
    });

    try {
      generatedScript = await generateScriptFromPrompt(prompt, body.product_url ?? null, body.template ?? null, body.target_duration ?? null);
      reqLog.info("Script generated", {
        wordCount: generatedScript.split(/\s+/).length,
        charCount: generatedScript.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Script generation failed";
      reqLog.error("Script generation failed", { error: errorMessage });
      return corsRes(
        { error: "script_generation_failed", error_description: `Failed to generate script: ${errorMessage}` },
        { status: 500 },
      );
    }

    // Use generated script as the script body; override whatever was in body.script
    body.script = generatedScript;
  }

  const script = body.script.trim();
  let voice = body.voice ?? "alloy";
  let voiceAutoDetected = false;
  const model = body.model ?? "kling3";
  const ttsProvider = body.tts_provider ?? null;
  const style = body.style ?? "hormozi";
  const tone = body.tone ?? null;
  const aspectRatio = body.aspect_ratio ?? "9:16";
  const music = body.music ?? null;
  const cta = body.cta ?? null;
  const overlayText = body.overlay_text ?? null;
  const overlayImage = body.overlay_image ?? null;
  let facePhotoUrl: string | null = null;

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2b: RESOLVE PERSONA (if provided)
  // ═══════════════════════════════════════════════════════════════════════
  if (body.persona_slug) {
    const { data: persona, error: personaError } = await db
      .from("user_personas")
      .select("id, voice_id, voice_clone_status, face_photo_url, subtitle_style, pacing")
      .eq("user_id", user.id)
      .eq("slug", body.persona_slug)
      .maybeSingle();

    if (personaError) {
      reqLog.error("Persona lookup failed", { error: personaError.message });
      return corsRes(
        { error: "server_error", error_description: "Failed to look up persona" },
        { status: 500 },
      );
    }

    if (!persona) {
      return corsRes(
        {
          error: "not_found",
          error_description: `Persona '${body.persona_slug}' not found. Run 'agent-media persona list' to see your personas.`,
        },
        { status: 404 },
      );
    }

    // Override voice with the persona's cloned voice (if ready)
    if (persona.voice_id && persona.voice_clone_status === "ready") {
      voice = persona.voice_id;
      reqLog.info("Using persona voice", { voiceId: persona.voice_id });
    } else {
      reqLog.warn("Persona voice not ready, falling back to default", {
        voiceCloneStatus: persona.voice_clone_status,
      });
    }

    // Resolve face photo URL from storage path
    if (persona.face_photo_url) {
      // face_photo_url is stored as a storage path — generate a signed URL
      const { data: signedData } = await db.storage
        .from("persona-assets")
        .createSignedUrl(persona.face_photo_url, 3600); // 1 hour for generation

      facePhotoUrl = signedData?.signedUrl ?? null;

      if (!facePhotoUrl) {
        reqLog.warn("Could not generate signed URL for face photo", {
          storagePath: persona.face_photo_url,
        });
      }
    }

    reqLog.info("Persona resolved", {
      personaSlug: body.persona_slug,
      hasVoice: !!persona.voice_id,
      hasFace: !!facePhotoUrl,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2b2: RESOLVE ACTOR (if provided)
  // ═══════════════════════════════════════════════════════════════════════
  if (body.actor_slug) {
    const { data: actor, error: actorError } = await db
      .from("actors")
      .select("id, name, slug, portrait_url, voice_id, voice_gender, lip_sync_engine")
      .eq("slug", body.actor_slug)
      .eq("status", "active")
      .maybeSingle();

    if (actorError) {
      reqLog.error("Actor lookup failed", { error: actorError.message });
      return corsRes({ error: "server_error", error_description: "Failed to look up actor" }, { status: 500 });
    }

    if (!actor) {
      // Suggest similar slugs (Levenshtein distance ≤ 2)
      let hint = "";
      const { data: allSlugs } = await db
        .from("actors")
        .select("slug")
        .eq("status", "active");
      if (allSlugs) {
        const lev = (a: string, b: string): number => {
          const m = a.length, n = b.length;
          const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
            Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
          );
          for (let i = 1; i <= m; i++)
            for (let j = 1; j <= n; j++)
              d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
              );
          return d[m][n];
        };
        const similar = allSlugs
          .map((r) => ({ slug: r.slug as string, dist: lev(body.actor_slug!, r.slug as string) }))
          .filter((r) => r.dist <= 2 && r.dist > 0)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3)
          .map((r) => r.slug);
        if (similar.length) {
          hint = ` Did you mean: ${similar.join(", ")}?`;
        }
      }
      return corsRes(
        {
          error: "not_found",
          error_description: `Actor '${body.actor_slug}' not found.${hint} Run 'agent-media actor list' to browse actors.`,
        },
        { status: 404 },
      );
    }

    // Use actor's portrait as face photo URL
    if (actor.portrait_url) {
      facePhotoUrl = actor.portrait_url;
    }

    // Use actor's voice unless explicitly overridden
    if (actor.voice_id && !body.voice) {
      voice = actor.voice_id;
    }

    reqLog.info("Actor resolved", {
      actorSlug: body.actor_slug,
      actorName: actor.name,
      hasFace: !!facePhotoUrl,
      voice,
      lipSyncEngine: actor.lip_sync_engine,
    });
  }

  // Direct face_photo_url takes precedence if no persona/actor was used
  if (!facePhotoUrl && body.face_photo_url) {
    facePhotoUrl = body.face_photo_url;
    reqLog.info("Using direct face_photo_url", { url: facePhotoUrl.substring(0, 60) });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2c: AUTO-DETECT VOICE FROM FACE PHOTO (if no explicit voice)
  // ═══════════════════════════════════════════════════════════════════════
  if (facePhotoUrl && !body.voice) {
    const detection = await detectVoiceFromFace(facePhotoUrl);
    if (detection) {
      voice = detection.voice;
      voiceAutoDetected = true;
      reqLog.info("Voice auto-detected from face photo", { label: detection.label, voice });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: CHECK PLAN TIER
  // ═══════════════════════════════════════════════════════════════════════
  const { data: subscription } = await db
    .from("subscriptions")
    .select("plan_slug, status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .maybeSingle();

  let userTier = subscription?.plan_slug ?? "free";

  // Detect PAYG users: no subscription but have purchased credits
  if (userTier === "free") {
    const { data: creditRow } = await db
      .from("user_credits")
      .select("purchased_balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (creditRow && (creditRow.purchased_balance as number) > 0) {
      userTier = "newby";
    }
  }

  if (!isTierSufficient(userTier)) {
    return corsRes(
      {
        error: "plan_required",
        error_description: `UGC video requires at least the Starter plan. You are on the '${userTier}' plan.`,
      },
      { status: 403 },
    );
  }

  // Creator-tier plans (starter, newby) are limited to 10s max duration
  const isCreatorTier = userTier === "starter" || userTier === "newby";
  if (isCreatorTier && body.target_duration && body.target_duration > 10) {
    return corsRes(
      {
        error: "plan_limit",
        error_description: `Your plan (${userTier}) supports up to 10s videos. Upgrade to Pro ($69/mo) or Pro Plus ($129/mo) for 15s videos.`,
      },
      { status: 403 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: ESTIMATE DURATION & CALCULATE CREDIT COST (per-second billing)
  // ═══════════════════════════════════════════════════════════════════════
  const targetDuration = body.target_duration ?? null;
  const estimatedDuration = targetDuration ?? estimateDuration(script);
  const durationBucket = toDurationBucket(estimatedDuration);

  // ── Word count pacing check ──────────────────────────────────────────
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const maxWords = MAX_WORDS_PER_DURATION[durationBucket] ?? Math.floor(durationBucket * WORDS_PER_SECOND);
  const wordsPerSec = wordCount / durationBucket;
  let pacingWarning: string | null = null;

  if (wordCount > maxWords) {
    const recommendedDuration = Math.ceil(wordCount / WORDS_PER_SECOND);
    const recommendedBucket = toDurationBucket(recommendedDuration);

    // If the script is way too long even for max duration, reject
    if (wordCount > MAX_WORDS_PER_DURATION[15]!) {
      return corsRes(
        {
          error: "script_too_long",
          error_description: `Script has ${wordCount} words but the maximum for a ${durationBucket}s video is ${maxWords} words (at natural pace of ${WORDS_PER_SECOND} words/sec). Max allowed is ${MAX_WORDS_PER_DURATION[15]} words for a 15s video. Shorten your script or increase target_duration.`,
          word_count: wordCount,
          max_words: MAX_WORDS_PER_DURATION[15],
          words_per_second: WORDS_PER_SECOND,
          duration_limits: MAX_WORDS_PER_DURATION,
        },
        { status: 400 },
      );
    }

    // If it fits in a longer bucket, warn and auto-upgrade
    if (recommendedBucket > durationBucket) {
      pacingWarning = `Script has ${wordCount} words — too many for ${durationBucket}s (max ${maxWords} words at ${WORDS_PER_SECOND} wps). Auto-upgraded to ${recommendedBucket}s for natural pacing.`;
      reqLog.warn("Pacing auto-upgrade", { wordCount, maxWords, from: durationBucket, to: recommendedBucket });
    } else {
      pacingWarning = `Script has ${wordCount} words for a ${durationBucket}s video (${wordsPerSec.toFixed(1)} words/sec). Recommended max is ${maxWords} words for natural pacing. Speech may sound rushed.`;
      reqLog.warn("Script pacing warning", { wordCount, maxWords, wordsPerSec });
    }
  }

  // Use the recommended bucket if auto-upgraded
  const effectiveDurationBucket = wordCount > maxWords
    ? toDurationBucket(Math.ceil(wordCount / WORDS_PER_SECOND))
    : durationBucket;

  // Per-second billing: credit cost scales linearly with video duration
  const baseCreditCost = effectiveDurationBucket * CREDITS_PER_SECOND;
  const creditCost = baseCreditCost + (generatedScript ? SCRIPT_GENERATION_CREDIT_SURCHARGE : 0);
  const providerCostUsd = effectiveDurationBucket * 0.2; // $0.20/sec estimated provider cost

  reqLog.info("UGC request validated", {
    scriptLength: script.length,
    wordCount,
    wordsPerSec,
    estimatedDuration,
    durationBucket,
    effectiveDurationBucket,
    creditCost,
    voice,
    style,
    scriptGenerated: !!generatedScript,
    pacingWarning,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: CHECK CREDITS
  // ═══════════════════════════════════════════════════════════════════════
  const { data: hasSufficient } = await db.rpc("has_sufficient_credits", {
    p_user_id: user.id,
    p_amount: creditCost,
  });

  if (hasSufficient === false) {
    const { data: balanceData } = await db.rpc("get_credit_balance", {
      p_user_id: user.id,
    });

    return corsRes(
      {
        error: "insufficient_credits",
        error_description:
          `UGC video (~${effectiveDurationBucket}s) costs ${creditCost} credits (${CREDITS_PER_SECOND} credits/sec), but you only have ${balanceData?.total_credits ?? 0} credits available.`,
        credits_required: creditCost,
        credits_available: balanceData?.total_credits ?? 0,
      },
      { status: 402 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: DEDUCT CREDITS
  // ═══════════════════════════════════════════════════════════════════════
  const jobId = crypto.randomUUID();

  const { error: deductError } = await db.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: creditCost,
    p_job_id: jobId,
    p_description: `UGC Video: ${script.substring(0, 50)}...`,
  });

  if (deductError) {
    const errMsg = deductError.message ?? "";
    if (errMsg.includes("INSUFFICIENT_CREDITS")) {
      return corsRes(
        { error: "insufficient_credits", error_description: "Insufficient credits for UGC video." },
        { status: 402 },
      );
    }
    reqLog.error("Credit deduction failed", { error: deductError.message });
    return corsRes(
      { error: "server_error", error_description: "Failed to deduct credits" },
      { status: 500 },
    );
  }

  // Credits deducted — any failure from here must trigger a refund.

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 7: CREATE JOB
  // ═══════════════════════════════════════════════════════════════════════
  const { error: insertError } = await db.from("generation_jobs").insert({
    id: jobId,
    user_id: user.id,
    model_slug: "ugc-basic",
    operation: "ugc_video",
    status: "pending",
    prompt: script.substring(0, 500),
    credit_cost: creditCost,
    provider_cost_usd: providerCostUsd,
    provider_slug: "railway",
    provider_job_id: jobId,
    webhook_checkpoint: "none",
    input_params: {
      script,
      voice,
      model,
      style,
      tone,
      estimated_duration: effectiveDurationBucket,
      persona_slug: body.persona_slug ?? null,
      has_face: !!facePhotoUrl,
      aspect_ratio: aspectRatio,
      music,
      cta: cta ? cta.substring(0, 100) : null,
      generated_script: generatedScript,
      composition_mode: body.composition_mode ?? null,
    },
    started_at: new Date().toISOString(),
  });

  if (insertError) {
    reqLog.error("Job insert failed", { error: insertError.message });
    await refundCredits(db, jobId);
    return corsRes(
      { error: "server_error", error_description: "Failed to create job. Credits refunded." },
      { status: 500 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 8: DISPATCH TO RAILWAY WORKER
  // ═══════════════════════════════════════════════════════════════════════
  if (!WORKER_URL || !WORKER_SECRET) {
    reqLog.error("Media worker not configured");
    await failJobAndRefund(db, jobId, "Media worker not configured");
    return corsRes(
      { error: "server_error", error_description: "UGC service unavailable. Credits refunded." },
      { status: 500 },
    );
  }

  const callbackUrl = buildCallbackUrl(jobId);

  try {
    const workerResponse = await fetchWithTimeout(`${WORKER_URL}/ugc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": WORKER_SECRET,
      },
      body: JSON.stringify({
        job_id: jobId,
        script,
        voice,
        model,
        style,
        tone,
        user_id: user.id,
        callback_url: callbackUrl,
        face_photo_url: facePhotoUrl,
        target_duration: effectiveDurationBucket,
        aspect_ratio: aspectRatio,
        music,
        cta,
        overlay_text: overlayText,
        overlay_image: overlayImage,
        tts_provider: ttsProvider,
        allow_broll: body.allow_broll ?? false,
        broll_images: body.broll_images ?? null,
        dub_language: body.dub_language ?? null,
        scenes_input: body.scenes_input ?? null,
        product_image_url: body.product_image_url ?? null,
        template: body.template ?? null,
        broll_model: body.broll_model ?? null,
        voice_speed: body.voice_speed ?? null,
        composition_mode: body.composition_mode ?? null,
        pip_position: body.pip_position ?? null,
        pip_size: body.pip_size ?? null,
        pip_animation: body.pip_animation ?? null,
        pip_style: body.pip_style ?? null,
        webhook_url: body.webhook_url ?? null,
      }),
    }, 15_000);

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text().catch(() => "unknown");
      throw new Error(`Worker returned ${workerResponse.status}: ${errorText}`);
    }

    // Update job status to submitted
    await db
      .from("generation_jobs")
      .update({ status: "submitted", webhook_checkpoint: "processing" })
      .eq("id", jobId);

    reqLog.info("UGC job dispatched to worker", { jobId, durationMs: elapsed() });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Worker dispatch failed";
    reqLog.error("Worker dispatch failed", { error: errorMessage });
    await failJobAndRefund(db, jobId, errorMessage);
    return corsRes(
      { error: "provider_error", error_description: "UGC processing failed. Credits refunded.", credits_refunded: creditCost },
      { status: 500 },
    );
  }

  const responseBody: Record<string, unknown> = {
    job_id: jobId,
    status: "submitted",
    estimated_duration: effectiveDurationBucket,
    credits_deducted: creditCost,
    selected_voice: voice,
    voice_auto_detected: voiceAutoDetected,
    word_count: wordCount,
    words_per_second: Number(wordsPerSec.toFixed(1)),
    max_words: maxWords,
  };

  if (pacingWarning) {
    responseBody.pacing_warning = pacingWarning;
  }

  if (generatedScript) {
    responseBody.generated_script = generatedScript;
  }

  return corsRes(responseBody, { status: 201 });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCallbackUrl(jobId: string): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return `${supabaseUrl}/functions/v1/webhook-provider?provider=railway&job_id=${jobId}`;
}

async function refundCredits(
  db: ReturnType<typeof supabaseAdmin>,
  jobId: string,
): Promise<void> {
  try {
    const { error } = await db.rpc("refund_credits", { p_job_id: jobId });
    if (error) console.error("Refund failed:", error.message, { jobId });
  } catch (err) {
    console.error("Refund threw:", err instanceof Error ? err.message : err);
  }
}

async function failJobAndRefund(
  db: ReturnType<typeof supabaseAdmin>,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .from("generation_jobs")
    .update({
      status: "failed",
      webhook_checkpoint: "failed",
      error_message: errorMessage,
      error_code: "WORKER_DISPATCH_FAILED",
    })
    .eq("id", jobId);

  await refundCredits(db, jobId);
}

// ── Router ──────────────────────────────────────────────────────────────────

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
      JSON.stringify({ error: "method_not_allowed", error_description: "Only POST requests are accepted" }),
      { status: 405, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }

  try {
    const response = await handleUGC(req, origin);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    log.fatal("Unhandled error in ugc-video", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    await captureEdgeError(err, "ugc-video");
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }
});
