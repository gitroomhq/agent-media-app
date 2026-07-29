// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Edge Function: subtitle-video
 *
 * Thin orchestrator that validates the request, deducts credits,
 * creates a generation job, and dispatches the actual work to a
 * Railway-hosted subtitle worker (FFmpeg + Whisper).
 *
 * Route:
 *   POST /functions/v1/subtitle-video
 *
 * Body:
 *   {
 *     "storage_path": "userId/jobId/output.mp4",
 *     "style": "hormozi"
 *   }
 *
 * Response (201):
 *   {
 *     "job_id": "uuid",
 *     "status": "submitted",
 *     "credits_deducted": 50
 *   }
 *
 * Error responses:
 *   400: Invalid input
 *   401: Not authenticated
 *   402: Insufficient credits
 *   500: Worker dispatch failed (credits refunded)
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";
import { SUBTITLE_STYLES } from "../_shared/schema.generated.ts";

const log = createLogger("subtitle-video");

const WORKER_URL = Deno.env.get("SUBTITLE_WORKER_URL");
const WORKER_SECRET = Deno.env.get("SUBTITLE_WORKER_SECRET");

const CREDIT_COST = 50;
const MAX_VIDEO_DURATION_SECONDS = 300; // 5 minutes

// ── Request Types ───────────────────────────────────────────────────────────

interface SubtitleRequestBody {
  storage_path: string;
  style?: string;
  job_id?: string; // Optional: pass an existing job ID to subtitle its output
}

const VALID_STYLES = new Set<string>(SUBTITLE_STYLES);

// ── Input Validation ────────────────────────────────────────────────────────

function validateInput(body: SubtitleRequestBody): { error?: string } {
  if (!body.storage_path && !body.job_id) {
    return { error: "storage_path or job_id is required" };
  }

  if (body.storage_path && typeof body.storage_path !== "string") {
    return { error: "storage_path must be a string" };
  }

  if (body.job_id && typeof body.job_id !== "string") {
    return { error: "job_id must be a string" };
  }

  if (body.style && !VALID_STYLES.has(body.style)) {
    return { error: `Invalid style '${body.style}'. Must be one of: ${[...VALID_STYLES].join(", ")}` };
  }

  return {};
}

// ── Main Handler ────────────────────────────────────────────────────────────

async function handleSubtitle(req: Request, _origin: string): Promise<Response> {
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
  let body: SubtitleRequestBody;
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

  // Resolve storage_path from job_id if needed
  let storagePath = body.storage_path;
  if (body.job_id && !storagePath) {
    const { data: sourceJob, error: jobError } = await db
      .from("generation_jobs")
      .select("output_media_url, user_id")
      .eq("id", body.job_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (jobError || !sourceJob) {
      return corsRes(
        { error: "not_found", error_description: `Job '${body.job_id}' not found` },
        { status: 404 },
      );
    }

    if (!sourceJob.output_media_url) {
      return corsRes(
        { error: "invalid_request", error_description: "Source job has no output media" },
        { status: 400 },
      );
    }

    // Extract storage path from the full URL
    // Format: https://xxx.supabase.co/storage/v1/object/public/generation-outputs/{path}
    const url = sourceJob.output_media_url as string;
    const marker = "/generation-outputs/";
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      storagePath = url.substring(idx + marker.length);
    } else {
      storagePath = url;
    }
  }

  if (!storagePath) {
    return corsRes(
      { error: "invalid_request", error_description: "Could not resolve storage path" },
      { status: 400 },
    );
  }

  const style = body.style ?? "hormozi";

  reqLog.info("Subtitle request validated", { storagePath, style });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: CHECK CREDITS
  // ═══════════════════════════════════════════════════════════════════════
  const { data: hasSufficient } = await db.rpc("has_sufficient_credits", {
    p_user_id: user.id,
    p_amount: CREDIT_COST,
  });

  if (hasSufficient === false) {
    const { data: balanceData } = await db.rpc("get_credit_balance", {
      p_user_id: user.id,
    });

    return corsRes(
      {
        error: "insufficient_credits",
        error_description:
          `Subtitle processing costs ${CREDIT_COST} credits, but you only have ${balanceData?.total_credits ?? 0} credits available.`,
        credits_required: CREDIT_COST,
        credits_available: balanceData?.total_credits ?? 0,
      },
      { status: 402 },
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: DEDUCT CREDITS
  // ═══════════════════════════════════════════════════════════════════════
  const jobId = crypto.randomUUID();

  const { error: deductError } = await db.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: CREDIT_COST,
    p_job_id: jobId,
    p_description: "Subtitle: Hormozi Subtitles",
  });

  if (deductError) {
    const errMsg = deductError.message ?? "";
    if (errMsg.includes("INSUFFICIENT_CREDITS")) {
      return corsRes(
        { error: "insufficient_credits", error_description: "Insufficient credits for subtitle processing." },
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
  // STEP 5: CREATE JOB
  // ═══════════════════════════════════════════════════════════════════════
  const { error: insertError } = await db.from("generation_jobs").insert({
    id: jobId,
    user_id: user.id,
    model_slug: "subtitle-hormozi",
    operation: "subtitle",
    status: "pending",
    prompt: `Add ${style} subtitles`,
    input_media_url: storagePath,
    credit_cost: CREDIT_COST,
    provider_cost_usd: 0.03,
    provider_slug: "railway",
    provider_job_id: jobId, // Self-referential for subtitle jobs
    webhook_checkpoint: "none",
    input_params: { storage_path: storagePath, style },
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
  // STEP 6: DISPATCH TO RAILWAY WORKER
  // ═══════════════════════════════════════════════════════════════════════
  if (!WORKER_URL || !WORKER_SECRET) {
    reqLog.error("Subtitle worker not configured");
    await failJobAndRefund(db, jobId, "Subtitle worker not configured");
    return corsRes(
      { error: "server_error", error_description: "Subtitle service unavailable. Credits refunded." },
      { status: 500 },
    );
  }

  const callbackUrl = buildCallbackUrl(jobId);

  try {
    const workerResponse = await fetchWithTimeout(`${WORKER_URL}/subtitle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": WORKER_SECRET,
      },
      body: JSON.stringify({
        job_id: jobId,
        storage_path: storagePath,
        style,
        callback_url: callbackUrl,
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

    reqLog.info("Job dispatched to worker", { jobId, durationMs: elapsed() });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Worker dispatch failed";
    reqLog.error("Worker dispatch failed", { error: errorMessage });
    await failJobAndRefund(db, jobId, errorMessage);
    return corsRes(
      { error: "provider_error", error_description: "Subtitle processing failed. Credits refunded.", credits_refunded: CREDIT_COST },
      { status: 500 },
    );
  }

  return corsRes(
    { job_id: jobId, status: "submitted", credits_deducted: CREDIT_COST },
    { status: 201 },
  );
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
    const response = await handleSubtitle(req, origin);
    const secHeaders = getSecurityHeaders();
    for (const [key, value] of Object.entries(secHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    log.fatal("Unhandled error in subtitle-video", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return new Response(
      JSON.stringify({ error: "server_error", error_description: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(origin), ...getSecurityHeaders() } },
    );
  }
});
