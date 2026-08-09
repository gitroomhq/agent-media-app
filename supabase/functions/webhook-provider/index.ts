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
 * Edge Function: webhook-provider
 *
 * Universal webhook handler that receives callbacks from the provider
 * when generation jobs complete or fail. The `parseProviderWebhook()`
 * function normalizes the payload into a common `ProviderWebhookEvent`.
 *
 * The handler then uses the `update_job_checkpoint` stored procedure
 * to advance the generation_jobs state machine idempotently.  For
 * completed jobs, media is downloaded from the provider and re-uploaded
 * to Supabase Storage before finalizing.
 *
 * Route:
 *   POST /functions/v1/webhook-provider?provider=fal&job_id=xxx
 *   POST /functions/v1/webhook-provider/fal  (path-based fallback)
 *
 * IMPORTANT:
 *   - Webhooks are UNAUTHENTICATED (no JWT / verifyAuth).
 *   - ALWAYS return 200 to the provider to prevent retry storms.
 *   - Processing errors go to the dead_letter_webhooks table.
 *
 * Reference: architecture doc Section 9; sprint-plan Sprint 5.
 */

import { corsResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { getSecurityHeaders } from "../_shared/security-headers.ts";
import { createLogger } from "../_shared/logger.ts";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";

const log = createLogger("webhook-provider");

// ── Types ──────────────────────────────────────────────────────────────────

/** Normalized webhook event from any provider. */
interface ProviderWebhookEvent {
  providerJobId: string;
  status: "submitted" | "processing" | "completed" | "failed" | "canceled";
  mediaUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  /**
   * Optional specific error code from the worker's error-classifier.
   * When present, takes precedence over the default PROVIDER_FAILURE catch-all
   * so the dashboard / SDK clients can switch on a meaningful code.
   * Examples: CONTENT_POLICY_BLOCKED, TTS_FAILED, PROVIDER_QUOTA_EXHAUSTED.
   */
  errorCode?: string;
  metadata?: Record<string, unknown>;
  /**
   * Non-media completion artifacts (character-create). A completed event
   * with no mediaUrl previously fell through EVERY branch of the state
   * machine, leaving the job "processing" forever — the pipeline had
   * finished (portrait + sheet on R2, user_characters row usable) but
   * nothing ever flipped the generation_jobs row. (2026-08-09)
   */
  characterSheetUrl?: string;
  portraitUrl?: string;
}

/** Shape of a generation_jobs row we need for processing. */
interface JobRecord {
  id: string;
  user_id: string;
  webhook_checkpoint: string;
  provider_slug: string;
  operation: string;
  input_params: Record<string, unknown> | null;
  credit_cost: number | null;
  duration_seconds: number | null;
  created_at: string;
}

// ── Provider-Specific Parsing ──────────────────────────────────────────────

/**
 * Provider webhook payload shape.
 *
 * Provider sends:
 *   {
 *     request_id: string,
 *     status: "OK" | "ERROR" | "IN_PROGRESS",
 *     payload: {
 *       video?: { url: string, content_type: string },
 *       images?: Array<{ url: string, content_type: string }>,
 *       seed?: number,
 *     },
 *     error?: string
 *   }
 */
interface FalWebhookPayload {
  request_id: string;
  status: string;
  payload?: {
    video?: { url: string; content_type?: string };
    images?: Array<{ url: string; content_type?: string }>;
    seed?: number;
  };
  error?: string;
}

/** Map provider status strings to our normalized status values. */
const FAL_STATUS_MAP: Record<string, ProviderWebhookEvent["status"]> = {
  OK: "completed",
  ERROR: "failed",
  IN_PROGRESS: "processing",
};

/**
 * Parse a provider webhook payload into a normalized event.
 */
function parseFalWebhook(body: unknown): ProviderWebhookEvent {
  const payload = body as FalWebhookPayload;

  if (!payload.request_id) {
    throw new Error("Provider webhook missing request_id");
  }

  if (!payload.status) {
    throw new Error("Provider webhook missing status");
  }

  const normalizedStatus = FAL_STATUS_MAP[payload.status];
  if (!normalizedStatus) {
    throw new Error(`Provider webhook unknown status: '${payload.status}'`);
  }

  // Extract media URL: prefer video, fall back to first image
  const mediaUrl =
    payload.payload?.video?.url ??
    payload.payload?.images?.[0]?.url ??
    undefined;

  return {
    providerJobId: payload.request_id,
    status: normalizedStatus,
    mediaUrl,
    thumbnailUrl: undefined,
    error: payload.error ?? undefined,
    metadata: payload.payload?.seed != null
      ? { seed: payload.payload.seed }
      : undefined,
  };
}

/**
 * Railway subtitle worker webhook payload.
 *
 * The worker sends:
 *   {
 *     job_id: string,
 *     status: "completed" | "failed",
 *     output_url?: string,
 *     error?: string
 *   }
 */
interface RailwayWebhookPayload {
  job_id: string;
  status: string;
  output_url?: string;
  error?: string;
  /** Optional structured code from worker error-classifier. */
  error_code?: string;
  stage?: string;
  progress_pct?: number;
  message?: string;
  /** Character-create completions carry these instead of output_url. */
  character_id?: string;
  sheet_url?: string;
  portrait_url?: string;
}

/**
 * Parse a Railway subtitle worker webhook payload into a normalized event.
 */
function parseRailwayWebhook(body: unknown): ProviderWebhookEvent {
  const payload = body as RailwayWebhookPayload;

  if (!payload.job_id) {
    throw new Error("Railway webhook missing job_id");
  }

  if (!payload.status) {
    throw new Error("Railway webhook missing status");
  }

  const statusMap: Record<string, ProviderWebhookEvent["status"]> = {
    completed: "completed",
    failed: "failed",
    processing: "processing",
    progress: "processing",
  };

  const normalizedStatus = statusMap[payload.status];
  if (!normalizedStatus) {
    throw new Error(`Railway webhook unknown status: '${payload.status}'`);
  }

  return {
    // For Railway, job_id IS the provider_job_id (self-referential)
    providerJobId: payload.job_id,
    status: normalizedStatus,
    mediaUrl: payload.output_url ?? undefined,
    characterSheetUrl: payload.sheet_url ?? undefined,
    portraitUrl: payload.portrait_url ?? undefined,
    error: payload.error ?? undefined,
    errorCode: typeof payload.error_code === "string" ? payload.error_code : undefined,
    metadata: payload.stage != null ? {
      stage: payload.stage,
      progress_pct: payload.progress_pct ?? null,
      message: payload.message ?? null,
      is_progress: payload.status === "progress",
    } : undefined,
  };
}

/**
 * Route to the correct provider parser.
 */
function parseProviderWebhook(
  provider: string,
  body: unknown,
): ProviderWebhookEvent {
  switch (provider) {
    case "fal":
      return parseFalWebhook(body);
    case "railway":
      return parseRailwayWebhook(body);
    default:
      throw new Error(`Unsupported provider: '${provider}'`);
  }
}

// ── Media Transfer ─────────────────────────────────────────────────────────

/**
 * Infer file extension from a URL or content-type.
 * Falls back to "mp4" for video.
 */
function inferExtension(url: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes("mp4")) return "mp4";
    if (contentType.includes("webm")) return "webm";
    if (contentType.includes("mov") || contentType.includes("quicktime"))
      return "mov";
    if (contentType.includes("png")) return "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg"))
      return "jpg";
    if (contentType.includes("webp")) return "webp";
  }

  // Try to extract from URL path
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.(\w{2,5})$/);
  if (match) return match[1];

  // Default to mp4 for video content
  return "mp4";
}

/**
 * Download media from the provider and upload it to Supabase Storage.
 *
 * Storage path: generation-outputs/{userId}/{jobId}/output.{ext}
 *
 * @returns The public or signed URL of the stored file.
 */
async function transferMediaToStorage(
  db: ReturnType<typeof supabaseAdmin>,
  providerMediaUrl: string,
  userId: string,
  jobId: string,
): Promise<string> {
  // 1. Download from provider
  const mediaResponse = await fetchWithTimeout(providerMediaUrl, {}, 60_000);

  if (!mediaResponse.ok) {
    throw new Error(
      `Failed to download media from provider: ${mediaResponse.status} ${mediaResponse.statusText}`,
    );
  }

  const contentType = mediaResponse.headers.get("content-type");
  const ext = inferExtension(providerMediaUrl, contentType);
  const mediaBuffer = await mediaResponse.arrayBuffer();

  // 2. Upload to Supabase Storage
  const storagePath = `${userId}/${jobId}/output.${ext}`;
  const uploadContentType = contentType ?? "video/mp4";

  const { error: uploadError } = await db.storage
    .from("generation-outputs")
    .upload(storagePath, mediaBuffer, {
      contentType: uploadContentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // 3. Return public URL (bucket is public)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return `${supabaseUrl}/storage/v1/object/public/generation-outputs/${storagePath}`;
}

/**
 * Download thumbnail from the provider and upload to Supabase Storage.
 *
 * Storage path: generation-outputs/{userId}/{jobId}/thumbnail.{ext}
 *
 * Non-critical -- returns null on failure rather than throwing.
 */
async function transferThumbnailToStorage(
  db: ReturnType<typeof supabaseAdmin>,
  providerThumbnailUrl: string,
  userId: string,
  jobId: string,
): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(providerThumbnailUrl, {}, 15_000);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type");
    const ext = inferExtension(providerThumbnailUrl, contentType);
    const buffer = await response.arrayBuffer();

    const storagePath = `${userId}/${jobId}/thumbnail.${ext}`;
    const uploadContentType = contentType ?? "image/jpeg";

    const { error: uploadError } = await db.storage
      .from("generation-outputs")
      .upload(storagePath, buffer, {
        contentType: uploadContentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Thumbnail upload failed:", uploadError.message);
      return null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return `${supabaseUrl}/storage/v1/object/public/generation-outputs/${storagePath}`;
  } catch (err) {
    console.error(
      "Thumbnail transfer failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ── Dead Letter ────────────────────────────────────────────────────────────

/**
 * Insert a failed webhook into the dead_letter_webhooks table for
 * later manual or automated retry.
 */
async function deadLetter(
  db: ReturnType<typeof supabaseAdmin>,
  providerSlug: string,
  providerJobId: string | undefined,
  payload: unknown,
  errorMessage: string,
): Promise<void> {
  const { error } = await db.from("dead_letter_webhooks").insert({
    provider_slug: providerSlug,
    provider_job_id: providerJobId ?? null,
    payload: payload as Record<string, unknown>,
    error_message: errorMessage,
    status: "pending",
    next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
  });

  if (error) {
    // Last resort -- log it so we can recover manually
    console.error("CRITICAL: Failed to insert dead letter:", error.message, {
      providerSlug,
      providerJobId,
      errorMessage,
    });
  }
}

// ── Webhook Processing ─────────────────────────────────────────────────────

/**
 * Core webhook processing logic.
 *
 * 1. Parse & normalize the provider payload
 * 2. Look up the generation job
 * 3. Advance the state machine via update_job_checkpoint
 * 4. For completed jobs: transfer media to Supabase Storage
 * 5. For failed jobs: refund credits
 */

// ── Outbound user webhooks ──────────────────────────────────────────────────
//
// When a job hits a terminal state (completed | failed) we POST a typed
// event to the user's configured webhook URL. URL resolution order:
//   1. job.input_params.webhook_url  (per-job override)
//   2. profiles.webhook_url          (per-account default)
// If neither is set, we silently skip — webhooks are opt-in.
//
// The body is HMAC-signed with the user's profiles.webhook_secret so the
// receiver can verify authenticity. Header format mirrors Stripe:
//   X-AgentMedia-Signature: t=<unix_ts>,v1=<hex_hmac_sha256(t.body, secret)>
//
// First attempt is fired inline. Failures are recorded in
// webhook_deliveries with a next_retry_at; a separate pg_cron job
// (added in a follow-up migration) drains the retry queue.

interface UserWebhookContext {
  // deno-lint-ignore no-explicit-any
  db: any;
  job: JobRecord;
  event: "job.completed" | "job.failed";
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fireUserWebhook(ctx: UserWebhookContext): Promise<void> {
  const { db, job, event, outputUrl, thumbnailUrl, errorMessage, errorCode } = ctx;

  // Resolve URL — per-job override beats per-account default.
  const inputParams = (job.input_params ?? {}) as Record<string, unknown>;
  const perJobUrl = typeof inputParams.webhook_url === "string"
    ? (inputParams.webhook_url as string)
    : null;

  const { data: profile } = await db
    .from("profiles")
    .select("webhook_url, webhook_secret")
    .eq("id", job.user_id)
    .maybeSingle();

  const accountUrl = (profile?.webhook_url as string | null) ?? null;
  const url = perJobUrl ?? accountUrl;
  if (!url) return; // opt-in; nothing to do

  const secret = profile?.webhook_secret as string | undefined;
  if (!secret) {
    console.warn(
      `webhook-provider: no webhook_secret on profile for user ${job.user_id}; skipping fire`,
    );
    return;
  }

  const completedAt = event === "job.completed" ? new Date().toISOString() : null;
  const payload: Record<string, unknown> = {
    event,
    job_id: job.id,
    user_id: job.user_id,
    operation: job.operation,
    status: event === "job.completed" ? "completed" : "failed",
    credits_deducted: job.credit_cost,
    duration_seconds: job.duration_seconds,
    created_at: job.created_at,
  };
  if (event === "job.completed") {
    payload.completed_at = completedAt;
    if (outputUrl) payload.video_url = outputUrl;
    if (thumbnailUrl) payload.thumbnail_url = thumbnailUrl;
  } else {
    payload.error_message = errorMessage ?? null;
    payload.error_code = errorCode ?? null;
  }

  const bodyText = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const signature = await hmacSha256Hex(secret, `${ts}.${bodyText}`);

  // Fire attempt 1 inline; record outcome in webhook_deliveries either way.
  const attemptN = 1;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "agent-media-webhook/1.0",
    "X-AgentMedia-Event": event,
    "X-AgentMedia-Signature": `t=${ts},v1=${signature}`,
    "X-AgentMedia-Job-Id": job.id,
    "X-AgentMedia-Attempt": String(attemptN),
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  let httpStatus: number | null = null;
  let responseExcerpt: string | null = null;
  let errorString: string | null = null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: bodyText,
      signal: ac.signal,
    });
    httpStatus = resp.status;
    try {
      const text = await resp.text();
      responseExcerpt = text.slice(0, 500);
    } catch {
      responseExcerpt = null;
    }
  } catch (err) {
    errorString = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(t);
  }

  const delivered = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  const status: "delivered" | "failed" = delivered ? "delivered" : "failed";
  // Retry schedule: attempt 1 fails → retry in 30s, attempt 2 in 5min, then permanent
  const nextRetryAt = !delivered && attemptN < 3
    ? new Date(Date.now() + (attemptN === 1 ? 30_000 : 300_000)).toISOString()
    : null;

  await db.from("webhook_deliveries").insert({
    user_id: job.user_id,
    job_id: job.id,
    event,
    url,
    attempt_n: attemptN,
    status,
    http_status: httpStatus,
    response_excerpt: responseExcerpt,
    error_message: errorString,
    delivered_at: delivered ? new Date().toISOString() : null,
    next_retry_at: nextRetryAt,
  }).then(() => {}, (err: unknown) => {
    console.error(
      `webhook-provider: webhook_deliveries insert failed for job ${job.id}:`,
      err instanceof Error ? err.message : String(err),
    );
  });

  if (delivered) {
    console.log(
      `webhook-provider: ${event} delivered for job ${job.id} (HTTP ${httpStatus})`,
    );
  } else {
    console.warn(
      `webhook-provider: ${event} delivery failed for job ${job.id} ` +
        `(HTTP ${httpStatus ?? "n/a"}, error=${errorString ?? "none"}); ` +
        `${nextRetryAt ? `retry at ${nextRetryAt}` : "no further retries"}`,
    );
  }
}

// ── Postiz auto-publish ────────────────────────────────────────────────────
//
// When a job.completed lands and the user has a postiz_api_key plus at
// least one entry in postiz_default_integrations, we fan out a Postiz
// publish per integration:
//   1. POST /upload-from-url  → uploads the R2 video to Postiz CDN
//   2. POST /posts            → schedules the post (date=now → publishes)
//
// Per-integration outcome is recorded in postiz_publications. Best-effort:
// errors never block the 200 response back to the worker.

import {
  listIntegrations as postizListIntegrations,
  uploadFromUrl as postizUploadFromUrl,
  createPost as postizCreatePost,
  PostizError,
  type PostizIntegration,
} from "../_shared/postiz-client.ts";

/**
 * Pick an explicit caption from input_params. ONLY checks fields that are
 * actual caption text — not action_prompt / script / beats, which are
 * generation prompts for Seedance / Whisper and would post raw stage
 * directions to social if used as a caption. The worker writes
 * action_prompt back to input_params for /jobs UI visibility, and we
 * must not let it leak into the published caption.
 */
function captionFromJob(job: JobRecord): string {
  const ip = (job.input_params ?? {}) as Record<string, unknown>;
  const candidates = [ip.caption, ip.caption_template];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      return c.trim().slice(0, 1000);
    }
  }
  return "";
}

/**
 * Generate a per-run caption via Opus 4.7 when the schedule is in
 * `caption_mode: 'ai'` and no static caption exists. Falls back to the
 * brief (truncated) if Anthropic is misconfigured.
 */
async function generateAiCaption(job: JobRecord): Promise<string> {
  const ip = (job.input_params ?? {}) as Record<string, unknown>;
  const brief = typeof ip.brief === "string" ? ip.brief.trim() : "";
  const guidance = typeof ip.caption_guidance === "string" ? ip.caption_guidance.trim() : "";
  if (!brief && !guidance) return "";

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing — refusing to publish without an AI-generated caption");
  }

  const system = `You write short social-media captions for AI-generated UGC videos.

Output rules:
- Plain text caption only. No JSON, no quotes, no preamble.
- 1-3 sentences, under 280 characters when guidance doesn't say otherwise.
- Match the brief's tone. Hook in the first 8 words.
- Hashtags inline at the end ONLY if the guidance asks for them.
- No emoji unless guidance asks for them.

If the user supplied caption guidance below, follow it strictly.`;

  const userMsg = [
    `Brief (recurring concept): ${brief || "(none)"}`,
    guidance ? `User's caption guidance: ${guidance}` : null,
    "",
    "Write today's caption.",
  ].filter(Boolean).join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Anthropic caption API ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
  const text = data?.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("Anthropic returned empty caption content");
  return text.slice(0, 1000);
}

/**
 * Resolve the final caption. AI mode generates per-run via Opus;
 * static mode (or any path with a literal caption already) uses
 * captionFromJob directly.
 */
async function resolveCaption(job: JobRecord): Promise<string> {
  const ip = (job.input_params ?? {}) as Record<string, unknown>;
  // AI mode wins unconditionally. If user picked AI for caption_mode they
  // want a fresh per-run caption from Opus using brief + caption_guidance,
  // not whatever random text happens to be in input_params (action_prompt,
  // script, etc.). Only fall back to literal-caption / static template when
  // caption_mode is NOT 'ai'.
  if (ip.caption_mode === "ai") {
    return await generateAiCaption(job);
  }
  return captionFromJob(job);
}

async function publishToPostiz(
  // deno-lint-ignore no-explicit-any
  db: any,
  job: JobRecord,
  videoUrl: string,
): Promise<void> {
  const { data: profile } = await db
    .from("profiles")
    .select("postiz_api_key, postiz_default_integrations")
    .eq("id", job.user_id)
    .maybeSingle();

  const apiKey = profile?.postiz_api_key as string | null;
  if (!apiKey) {
    return; // user hasn't opted in
  }

  // Per-job override (set by schedule-runner) beats profile default.
  const ip = (job.input_params ?? {}) as Record<string, unknown>;
  const perJob = Array.isArray(ip.postiz_integration_ids)
    ? (ip.postiz_integration_ids as unknown[]).filter((s) => typeof s === 'string') as string[]
    : null;
  const defaults = perJob && perJob.length > 0
    ? perJob
    : (profile?.postiz_default_integrations as string[] | null);

  if (!defaults || defaults.length === 0) {
    return; // user hasn't opted in
  }

  // We need the integration's identifier (platform string) to put in
  // settings.__type. listIntegrations gives us all of them in one call.
  let integrations: PostizIntegration[];
  try {
    integrations = await postizListIntegrations(apiKey);
  } catch (err) {
    console.error(
      `webhook-provider: postiz listIntegrations failed for user ${job.user_id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return; // can't proceed without platform-type lookup
  }

  const byId = new Map<string, PostizIntegration>();
  for (const i of integrations) byId.set(i.id, i);

  // Resolve caption. If AI caption generation fails (e.g. ANTHROPIC_API_KEY
  // missing on the function, Anthropic 5xx, etc.) we record a failed
  // publication row PER destination and abort the publish. No silent
  // fallback to brief-as-caption — the user opted into AI captions, and
  // shipping the raw brief is not the same product.
  let caption: string;
  try {
    caption = await resolveCaption(job);
  } catch (captionErr) {
    const msg = captionErr instanceof Error ? captionErr.message : String(captionErr);
    console.error(`webhook-provider: caption resolution failed for job ${job.id}: ${msg}`);
    for (const integrationId of defaults) {
      const { error: insertErr } = await db.from("postiz_publications").insert({
        user_id: job.user_id,
        job_id: job.id,
        integration_id: integrationId,
        status: "failed",
        error_message: `caption generation failed: ${msg}`,
      });
      if (insertErr) {
        console.error(`webhook-provider: failed to record caption-failure publication for ${integrationId}: ${insertErr.message}`);
      }
    }
    return;
  }

  for (const integrationId of defaults) {
    const integration = byId.get(integrationId);
    if (!integration) {
      // User configured an integration that no longer exists; record + skip
      const { error: insErr } = await db.from("postiz_publications").insert({
        user_id: job.user_id,
        job_id: job.id,
        integration_id: integrationId,
        status: "failed",
        error_message: "integration not found in user's Postiz account (deleted or revoked)",
      });
      if (insErr) {
        console.error(`webhook-provider: failed to insert missing-integration publication row for job ${job.id} → ${integrationId}: ${insErr.message}`);
      }
      continue;
    }
    // Postiz's `disabled` flag is sometimes stale or platform-state
    // dependent; attempt the publish anyway and let Postiz's API
    // return a concrete error if it really can't accept the post.
    // The error_message + http_status get recorded in postiz_publications.

    const pubRow = {
      user_id: job.user_id,
      job_id: job.id,
      integration_id: integrationId,
      status: "pending" as const,
    };
    const { data: insertedPub } = await db
      .from("postiz_publications")
      .insert(pubRow)
      .select("id")
      .maybeSingle();
    const pubId = insertedPub?.id as string | undefined;

    // Step 1: upload-from-url (Postiz fetches the R2 video to its CDN)
    let uploadId: string;
    let uploadPath: string;
    try {
      const upload = await postizUploadFromUrl(apiKey, videoUrl);
      uploadId = upload.id;
      uploadPath = upload.path;
    } catch (err) {
      const httpStatus = err instanceof PostizError ? err.status : null;
      const msg = err instanceof Error ? err.message : String(err);
      if (pubId) {
        const { error: updErr } = await db.from("postiz_publications").update({
          status: "failed",
          error_message: `upload-from-url failed: ${msg}`,
          http_status: httpStatus,
        }).eq("id", pubId);
        if (updErr) {
          console.error(`webhook-provider: failed to update pub ${pubId} as failed: ${updErr.message}`);
        }
      }
      console.error(
        `webhook-provider: postiz upload-from-url failed for job ${job.id} → ${integrationId}:`,
        msg,
      );
      continue;
    }

    if (pubId) {
      const { error: updErr } = await db.from("postiz_publications").update({
        status: "uploaded",
        postiz_upload_id: uploadId,
        postiz_upload_path: uploadPath,
        uploaded_at: new Date().toISOString(),
      }).eq("id", pubId);
      if (updErr) {
        console.error(`webhook-provider: failed to update pub ${pubId} to uploaded: ${updErr.message}`);
      }
    }

    // Step 2: create post
    try {
      const created = await postizCreatePost(apiKey, {
        integrationId,
        mediaPath: uploadPath,
        content: caption,
        platformType: integration.identifier,
      });
      const postId = created[0]?.postId ?? null;
      if (pubId) {
        const { error: updErr } = await db.from("postiz_publications").update({
          status: "published",
          postiz_post_id: postId,
          published_at: new Date().toISOString(),
        }).eq("id", pubId);
        if (updErr) {
          console.error(`webhook-provider: failed to update pub ${pubId} to published: ${updErr.message}`);
        }
      }
      console.log(
        `webhook-provider: postiz published job ${job.id} → ${integration.identifier} (${integrationId}) post=${postId}`,
      );
    } catch (err) {
      const httpStatus = err instanceof PostizError ? err.status : null;
      const msg = err instanceof Error ? err.message : String(err);
      if (pubId) {
        const { error: updErr } = await db.from("postiz_publications").update({
          status: "failed",
          error_message: `create-post failed: ${msg}`,
          http_status: httpStatus,
        }).eq("id", pubId);
        if (updErr) {
          console.error(`webhook-provider: failed to update pub ${pubId} as failed: ${updErr.message}`);
        }
      }
      console.error(
        `webhook-provider: postiz create-post failed for job ${job.id} → ${integrationId}:`,
        msg,
      );
    }
  }
}

async function processWebhook(
  provider: string,
  body: unknown,
): Promise<{ status: string; jobId?: string }> {
  const db = supabaseAdmin();
  const elapsed = log.startTimer();
  const wLog = log.withContext({ provider });

  // ── Step 1: Parse provider payload ──────────────────────────────────
  const event = parseProviderWebhook(provider, body);

  wLog.info("Webhook received", {
    providerJobId: event.providerJobId,
    providerStatus: event.status,
    hasMediaUrl: !!event.mediaUrl,
  });

  console.log(
    `webhook-provider [${provider}]: received ${event.status} for ` +
      `provider_job_id=${event.providerJobId}`,
  );

  // ── Step 2: Look up the generation job ──────────────────────────────
  const { data: job, error: jobError } = await db
    .from("generation_jobs")
    .select(
      "id, user_id, webhook_checkpoint, provider_slug, " +
      "operation, input_params, credit_cost, duration_seconds, created_at",
    )
    .eq("provider_job_id", event.providerJobId)
    .eq("provider_slug", provider)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Job lookup failed: ${jobError.message}`);
  }

  if (!job) {
    // Job not found -- provider may have sent a stale or unknown callback.
    // Return 200 (do not retry) but log warning for investigation.
    wLog.warn("No job found for provider callback", {
      providerJobId: event.providerJobId,
    });
    console.warn(
      `webhook-provider [${provider}]: no job found for ` +
        `provider_job_id=${event.providerJobId} -- ignoring`,
    );
    return { status: "ignored_unknown_job" };
  }

  const jobRecord = job as unknown as JobRecord;
  const jobId = jobRecord.id;
  const userId = jobRecord.user_id;

  // ── Step 3: State machine transitions ───────────────────────────────

  if (event.status === "processing") {
    const isProgress = event.metadata?.is_progress === true;
    // The checkpoint arg must be one of the lifecycle ordinals the
    // update_job_checkpoint SQL function understands (none/received/processing/
    // media_received/completed/failed). A previous version forwarded the
    // granular progress *stage* (e.g. "assembled") here, which the function
    // rejects with INVALID_CHECKPOINT -> 500 -> provider retry storm. Progress
    // stages are not lifecycle checkpoints; they're recorded in progress_detail
    // below. So a processing event always advances to the "processing"
    // checkpoint regardless of the granular stage. (2026-06-12)
    const { error: rpcError } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "processing",
      p_status: "processing",
    });

    if (rpcError) {
      throw new Error(`update_job_checkpoint(processing) failed: ${rpcError.message}`);
    }

    // For granular progress events, also update progress_detail column
    if (isProgress && event.metadata?.stage) {
      await db
        .from("generation_jobs")
        .update({
          progress_detail: {
            stage: event.metadata.stage,
            progress_pct: event.metadata.progress_pct ?? null,
            message: event.metadata.message ?? null,
          },
        })
        .eq("id", jobId);
    }

    return { status: isProgress ? "progress" : "processing", jobId };
  }

  if (event.status === "completed" && event.mediaUrl) {
    // Provider says job completed with media -- two-phase checkpoint:
    // Phase 1: Mark media_received (before download starts)
    const { error: phase1Error } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "media_received",
      p_status: "processing",
    });

    if (phase1Error) {
      throw new Error(
        `update_job_checkpoint(media_received) failed: ${phase1Error.message}`,
      );
    }

    // Phase 2: Download media from provider and upload to Storage.
    // For Railway subtitle workers, the media is already in Supabase Storage
    // (the worker uploaded directly), so skip the transfer.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const isAlreadyInStorage = event.mediaUrl.includes(supabaseUrl) &&
      event.mediaUrl.includes("/generation-outputs/");
    const isR2Url = event.mediaUrl.includes(".r2.dev/");

    let storageUrl: string;
    if (isAlreadyInStorage || isR2Url) {
      storageUrl = event.mediaUrl;
    } else {
      storageUrl = await transferMediaToStorage(
        db,
        event.mediaUrl,
        userId,
        jobId,
      );
    }

    // Transfer thumbnail (best-effort, non-blocking failure)
    let thumbnailUrl: string | null = null;
    if (event.thumbnailUrl) {
      thumbnailUrl = await transferThumbnailToStorage(
        db,
        event.thumbnailUrl,
        userId,
        jobId,
      );
    }

    // Phase 3: Mark completed with storage URLs
    const { error: phase2Error } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "completed",
      p_status: "completed",
      p_output_media_url: storageUrl,
      p_output_thumbnail_url: thumbnailUrl,
    });

    if (phase2Error) {
      throw new Error(
        `update_job_checkpoint(completed) failed: ${phase2Error.message}`,
      );
    }

    wLog.info("Job completed, media stored", {
      jobId,
      providerJobId: event.providerJobId,
      storageUrl,
      hasThumbnail: !!thumbnailUrl,
      durationMs: elapsed(),
    });

    console.log(
      `webhook-provider [${provider}]: job ${jobId} completed, ` +
        `media stored at ${storageUrl}`,
    );

    // Fire the user's webhook (best-effort — never block the 200 response).
    await fireUserWebhook({
      db,
      job: jobRecord,
      event: "job.completed",
      outputUrl: storageUrl,
      thumbnailUrl,
    }).catch((err: unknown) => {
      console.error(
        `webhook-provider: fireUserWebhook(completed) crashed for job ${jobId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    // Postiz auto-publish — fan out to the user's configured integrations.
    // Best-effort, never blocks the 200 response. Per-integration outcomes
    // recorded in postiz_publications. Only fires for media outputs (mp4/png/jpg).
    if (storageUrl) {
      await publishToPostiz(db, jobRecord, storageUrl).catch((err: unknown) => {
        console.error(
          `webhook-provider: publishToPostiz crashed for job ${jobId}:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    return { status: "completed", jobId };
  }

  if (event.status === "completed") {
    // Completed WITHOUT media — character-create (and any future one-shot
    // v2 op whose artifacts live outside the media path). Before this
    // branch existed, such events fell through the whole state machine and
    // the job stayed "processing" forever even though the pipeline had
    // finished. Complete the row directly; surface the sheet (or portrait)
    // as the job's visible output so pollers get a URL.
    const artifactUrl = event.characterSheetUrl ?? event.portraitUrl ?? null;

    const { error: completeError } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "completed",
      p_status: "completed",
      ...(artifactUrl ? { p_output_media_url: artifactUrl } : {}),
    });

    if (completeError) {
      throw new Error(
        `update_job_checkpoint(completed, no-media) failed: ${completeError.message}`,
      );
    }

    wLog.info("Job completed (no media payload)", {
      jobId,
      providerJobId: event.providerJobId,
      artifactUrl,
      durationMs: elapsed(),
    });
    console.log(
      `webhook-provider [${provider}]: job ${jobId} completed (no media payload${artifactUrl ? `, artifact ${artifactUrl}` : ""})`,
    );

    // Fire the user's webhook (best-effort — never block the 200 response).
    await fireUserWebhook({
      db,
      job: jobRecord,
      event: "job.completed",
      outputUrl: artifactUrl ?? undefined,
      thumbnailUrl: null,
    }).catch((err: unknown) => {
      console.error(
        `webhook-provider: fireUserWebhook(completed, no-media) crashed for job ${jobId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return { status: "completed", jobId };
  }

  if (event.status === "failed") {
    // Provider says job failed -- mark failed and refund credits
    const errorMessage = event.error ?? "Provider reported failure";
    // Worker (media-worker-v2/src/error-classifier.js) supplies a specific
    // code when it can classify the failure (CONTENT_POLICY_BLOCKED, etc.).
    // Fall back to PROVIDER_FAILURE for legacy callers / unrecognised errors.
    const errorCode = event.errorCode ?? "PROVIDER_FAILURE";

    const { error: failError } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "failed",
      p_status: "failed",
      p_error_message: errorMessage,
      p_error_code: errorCode,
    });

    if (failError) {
      throw new Error(
        `update_job_checkpoint(failed) failed: ${failError.message}`,
      );
    }

    wLog.warn("Job failed, initiating credit refund", {
      jobId,
      providerJobId: event.providerJobId,
      errorMessage,
      errorCode,
    });

    // Refund credits for the failed job
    try {
      const { error: refundError } = await db.rpc("refund_credits", {
        p_job_id: jobId,
      });

      if (refundError) {
        // Refund failure is serious but should not prevent the 200 response.
        // Insert into dead letter queue so it shows up for manual review.
        wLog.error("Credit refund failed", { jobId, error: refundError.message });
        console.error(
          `webhook-provider: credit refund failed for job ${jobId}:`,
          refundError.message,
        );
        await deadLetter(
          db,
          provider,
          event.providerJobId,
          body,
          `REFUND_FAILED: credit refund failed for job ${jobId}: ${refundError.message}`,
        );
      } else {
        wLog.info("Credits refunded for failed job", { jobId });
        console.log(
          `webhook-provider [${provider}]: job ${jobId} failed, credits refunded`,
        );
      }
    } catch (refundErr) {
      const refundErrMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
      console.error(
        `webhook-provider: refund_credits threw for job ${jobId}:`,
        refundErrMsg,
      );
      await deadLetter(
        db,
        provider,
        event.providerJobId,
        body,
        `REFUND_FAILED: refund_credits threw for job ${jobId}: ${refundErrMsg}`,
      );
    }

    // Fire the user's webhook (best-effort).
    await fireUserWebhook({
      db,
      job: jobRecord,
      event: "job.failed",
      errorMessage,
      errorCode,
    }).catch((err: unknown) => {
      console.error(
        `webhook-provider: fireUserWebhook(failed) crashed for job ${jobId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return { status: "failed", jobId };
  }

  if (event.status === "canceled") {
    // Provider says job was canceled -- mark failed with CANCELED code
    const { error: cancelError } = await db.rpc("update_job_checkpoint", {
      p_job_id: jobId,
      p_checkpoint: "failed",
      p_status: "canceled",
      p_error_message: "Job canceled by provider",
      p_error_code: "CANCELED",
    });

    if (cancelError) {
      throw new Error(
        `update_job_checkpoint(canceled) failed: ${cancelError.message}`,
      );
    }

    // Refund credits for the canceled job
    try {
      const { error: refundError } = await db.rpc("refund_credits", {
        p_job_id: jobId,
      });

      if (refundError) {
        console.error(
          `webhook-provider: credit refund failed for canceled job ${jobId}:`,
          refundError.message,
        );
        await deadLetter(
          db,
          provider,
          event.providerJobId,
          body,
          `REFUND_FAILED: credit refund failed for canceled job ${jobId}: ${refundError.message}`,
        );
      }
    } catch (refundErr) {
      const refundErrMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
      console.error(
        `webhook-provider: refund_credits threw for canceled job ${jobId}:`,
        refundErrMsg,
      );
      await deadLetter(
        db,
        provider,
        event.providerJobId,
        body,
        `REFUND_FAILED: refund_credits threw for canceled job ${jobId}: ${refundErrMsg}`,
      );
    }

    return { status: "canceled", jobId };
  }

  // Submitted or other informational status -- just acknowledge
  if (event.status === "submitted") {
    console.log(
      `webhook-provider [${provider}]: job ${jobId} submitted confirmation`,
    );
    return { status: "acknowledged", jobId };
  }

  console.warn(
    `webhook-provider [${provider}]: unhandled status '${event.status}' ` +
      `for job ${jobId}`,
  );
  return { status: "unhandled", jobId };
}

// ── Provider Extraction ────────────────────────────────────────────────────

/**
 * Extract the provider slug from the request.
 *
 * Supports two URL patterns (to accommodate both the generate function's
 * buildWebhookUrl which uses a path segment, and direct calls via query
 * param):
 *
 *   1. Path-based:  /functions/v1/webhook-provider/kie
 *   2. Query-based: /functions/v1/webhook-provider?provider=kie
 */
function extractProvider(req: Request): string | null {
  const url = new URL(req.url);

  // Try query parameter first
  const queryProvider = url.searchParams.get("provider");
  if (queryProvider) {
    return queryProvider.toLowerCase().trim();
  }

  // Try path segment: /functions/v1/webhook-provider/{provider}
  const pathSegments = url.pathname.split("/").filter(Boolean);
  // Expected: ["functions", "v1", "webhook-provider", "{provider}"]
  const webhookIdx = pathSegments.indexOf("webhook-provider");
  if (webhookIdx >= 0 && webhookIdx < pathSegments.length - 1) {
    return pathSegments[webhookIdx + 1].toLowerCase().trim();
  }

  return null;
}

// ── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const secHeaders = getSecurityHeaders();

  // Handle CORS preflight (provider webhooks are server-to-server but
  // we keep the handler for consistency)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: secHeaders,
    });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // FIX 5 (C3): permissive-until-configured inbound auth. With PROVIDER_WEBHOOK_SECRET
  // unset this is a no-op (deploys without breaking provider callbacks); once set and
  // callers send the header, an unauthenticated POST — which could drive a delivered
  // job to `failed` and trigger a refund of an already-delivered render — is rejected
  // before any DB write.
  const INBOUND_SECRET = Deno.env.get("PROVIDER_WEBHOOK_SECRET");
  if (INBOUND_SECRET && req.headers.get("x-provider-webhook-secret") !== INBOUND_SECRET) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // Extract provider from URL
  const provider = extractProvider(req);
  if (!provider) {
    // Return 200 anyway -- don't give the caller a reason to retry
    console.error("webhook-provider: missing provider parameter");
    return new Response(
      JSON.stringify({ received: true, status: "error", error: "missing provider parameter" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.error(`webhook-provider [${provider}]: invalid JSON body`);
    return new Response(
      JSON.stringify({ received: true, status: "error", error: "invalid JSON body" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }

  // Process the webhook -- entire handler wrapped in try/catch
  try {
    const result = await processWebhook(provider, body);

    return new Response(
      JSON.stringify({
        received: true,
        status: result.status,
        job_id: result.jobId ?? null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown processing error";

    log.error("Webhook processing error", {
      provider,
      error: err instanceof Error ? err : new Error(errorMessage),
    });
    await captureEdgeError(err, "webhook-provider", { provider });

    console.error(
      `webhook-provider [${provider}]: processing error:`,
      errorMessage,
    );

    // Send to dead letter queue for later retry
    const db = supabaseAdmin();
    await deadLetter(
      db,
      provider,
      (body as Record<string, unknown>)?.request_id as string | undefined,
      body,
      errorMessage,
    );

    // ALWAYS return 200 to prevent provider retry storms
    return new Response(
      JSON.stringify({
        received: true,
        status: "error_queued",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...secHeaders },
      },
    );
  }
});
