// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: job-status
 *
 * Returns generation job data for the authenticated user.
 * Supports single job lookup and paginated listing.
 *
 * Route: POST /functions/v1/job-status
 * Body:
 *   Single job:  { jobId: string }
 *   List jobs:   { list: true, limit?, offset?, status?, model?, sort? }
 * Auth: Bearer JWT or API key (ma_)
 */

import { verifyAuth } from "../_shared/auth.ts";
import { getCorsHeadersForOrigin } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin") ?? "";

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...getCorsHeadersForOrigin(origin),
        "Content-Type": "application/json",
      },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeadersForOrigin(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const { user, error: authErr } = await verifyAuth(req);
  if (!user || authErr) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const db = supabaseAdmin();

  // ── Cancel a job ─────────────────────────────────────────────────────
  if (body.cancel && body.jobId && typeof body.jobId === "string") {
    const { data: job, error: jobErr } = await db
      .from("generation_jobs")
      .select("id, user_id, status, credit_cost")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .single();

    if (jobErr || !job) {
      return jsonResponse({ error: "job_not_found" }, 404);
    }

    // Only active jobs can be canceled
    if (!["submitted", "queued", "processing"].includes(job.status)) {
      return jsonResponse({
        error: "cannot_cancel",
        message: `Job is already ${job.status}`,
      }, 400);
    }

    // Mark as canceled and refund credits
    const { error: updateErr } = await db
      .from("generation_jobs")
      .update({
        status: "canceled",
        error_message: "Canceled by user",
        error_code: "USER_CANCELED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.jobId);

    if (updateErr) {
      return jsonResponse({ error: "cancel_failed" }, 500);
    }

    // Refund credits
    let refundSuccess = true;
    try {
      await db.rpc("refund_credits", { p_job_id: body.jobId });
    } catch (refundErr) {
      refundSuccess = false;
      const errMsg = refundErr instanceof Error ? refundErr.message : "unknown";
      console.error("refund_credits failed for canceled job:", body.jobId, errMsg);

      // Queue failed refund in dead_letter_webhooks for retry
      await db.from("dead_letter_webhooks").insert({
        provider_slug: "internal",
        payload: { action: "refund_credits", job_id: body.jobId, user_id: user.id, credit_cost: job.credit_cost },
        error_message: `Refund failed on cancel: ${errMsg}`,
        status: "pending",
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }).then(({ error: dlErr }) => {
        if (dlErr) console.error("Failed to dead-letter refund:", dlErr.message);
      });
    }

    return jsonResponse({
      canceled: true,
      jobId: body.jobId,
      credits_refunded: refundSuccess ? job.credit_cost : 0,
      refund_pending: !refundSuccess,
    });
  }

  // ── Single job lookup ─────────────────────────────────────────────────
  if (body.jobId && typeof body.jobId === "string") {
    const { data: job, error: jobErr } = await db
      .from("generation_jobs")
      .select("*")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .single();

    if (jobErr || !job) {
      return jsonResponse({ error: "job_not_found" }, 404);
    }

    return jsonResponse(job);
  }

  // ── List jobs ─────────────────────────────────────────────────────────
  if (body.list) {
    const limit = Math.min(Number(body.limit) || 20, 100);
    const offset = Number(body.offset) || 0;
    const sortDir = body.sort === "oldest" ? true : false; // ascending if oldest

    let query = db
      .from("generation_jobs")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: sortDir })
      .range(offset, offset + limit - 1);

    if (body.status && typeof body.status === "string") {
      query = query.eq("status", body.status);
    }

    if (body.model && typeof body.model === "string") {
      query = query.eq("model_slug", body.model);
    }

    const { data: jobs, count, error: listErr } = await query;

    if (listErr) {
      console.error("job-status list error:", listErr.message);
      return jsonResponse({ error: "query_failed" }, 500);
    }

    return jsonResponse({
      jobs: jobs ?? [],
      total: count ?? (jobs?.length ?? 0),
    });
  }

  return jsonResponse({ error: "invalid_body", message: "Provide jobId or list:true" }, 400);
});
