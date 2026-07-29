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
 * Idempotency middleware for Edge Functions.
 *
 * Prevents duplicate processing of financial operations by checking
 * the idempotency_keys table before executing and caching results
 * after successful completion.
 *
 * Usage:
 *   const cached = await checkIdempotency(key, 'checkout');
 *   if (cached) return cached;         // return cached response
 *   const result = await doWork();
 *   await saveIdempotency(key, 'checkout', result);
 *   return result;
 *
 * Scopes:
 *   - 'stripe_webhook'  : Stripe webhook event processing
 *   - 'checkout'         : Checkout session creation
 *   - 'payg_purchase'    : PAYG credit pack purchase
 *   - 'credit_deduction' : Credit deduction operation
 *
 * TTL: 24 hours (enforced by pg_cron cleanup job).
 */

import { supabaseAdmin } from "./supabase.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Cached idempotency result returned when a duplicate request is detected.
 */
export interface IdempotencyResult {
  /** HTTP status code from the original response. */
  status: number;
  /** Response body from the original response. */
  body: unknown;
}

/**
 * Valid scope values for idempotency key namespacing.
 *
 * Each scope isolates keys so the same key string used in different
 * contexts does not collide.
 */
export type IdempotencyScope =
  | "stripe_webhook"
  | "checkout"
  | "payg_purchase"
  | "credit_deduction"
  | "default";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if a request with the given idempotency key has already been
 * processed within the specified scope.
 *
 * @param key   - The idempotency key (typically from X-Idempotency-Key header).
 * @param scope - The operation scope to namespace the key under.
 * @returns The cached result if found; `null` if this is a new request.
 */
export async function checkIdempotency(
  key: string,
  scope: IdempotencyScope = "default",
): Promise<IdempotencyResult | null> {
  if (!key) {
    return null;
  }

  const db = supabaseAdmin();

  // Build a composite key to ensure uniqueness across scopes
  const compositeKey = `${scope}:${key}`;

  const { data, error } = await db
    .from("idempotency_keys")
    .select("response_status, response_body")
    .eq("key", compositeKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    // Log but do not throw -- on error, allow the request to proceed.
    // The worst case is we process twice, which downstream handlers
    // should be designed to tolerate.
    console.error("Idempotency check failed:", error.message);
    return null;
  }

  if (!data || data.response_status === null || data.response_body === null) {
    // No cached result found, or a previous attempt started but did
    // not complete (response fields are null).
    return null;
  }

  return {
    status: data.response_status as number,
    body: data.response_body as unknown,
  };
}

/**
 * Store the result of a successfully processed request so that
 * subsequent requests with the same key return the cached result.
 *
 * The record expires after 24 hours (enforced by the `expires_at`
 * default and pg_cron cleanup job).
 *
 * @param key    - The idempotency key.
 * @param scope  - The operation scope.
 * @param result - The result to cache (status + body).
 */
export async function saveIdempotency(
  key: string,
  scope: IdempotencyScope = "default",
  result: IdempotencyResult,
): Promise<void> {
  if (!key) {
    return;
  }

  const db = supabaseAdmin();
  const compositeKey = `${scope}:${key}`;

  const { error } = await db
    .from("idempotency_keys")
    .upsert(
      {
        key: compositeKey,
        endpoint: scope,
        scope,
        response_status: result.status,
        response_body: result.body as Record<string, unknown>,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "key" },
    );

  if (error) {
    // Log but do not throw.  The primary operation already succeeded;
    // failing to cache the result means a duplicate request might be
    // processed again, but downstream handlers should tolerate that.
    console.error("Failed to save idempotency result:", error.message);
  }
}
