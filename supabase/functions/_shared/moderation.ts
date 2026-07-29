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
 * Content moderation utility for Edge Functions.
 *
 * Evaluates user prompts against the OpenAI moderation endpoint and
 * logs every decision to the `content_moderation_log` table for
 * compliance and abuse investigation.
 *
 * Usage:
 *   const result = await moderatePrompt(prompt, userId, supabaseClient);
 *   if (result.action === 'block') return error;
 *
 * Fallback behaviour:
 *   - If the OpenAI API is unreachable or returns an error, the
 *     function falls back to a simple keyword check for extreme
 *     cases and defaults to action='allow' so that transient
 *     service failures do not block legitimate users.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "./fetch-with-timeout.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of running a prompt through the moderation pipeline.
 */
export interface ModerationResult {
  /** Whether any moderation category was triggered. */
  flagged: boolean;
  /** Per-category boolean flags (e.g., { violence: true, sexual: false }). */
  categories: Record<string, boolean>;
  /** Per-category confidence scores (0.0 - 1.0). */
  scores: Record<string, number>;
  /** Platform action: allow the request, block it, or queue for review. */
  action: "allow" | "block" | "review";
}

// ── Keyword Fallback ───────────────────────────────────────────────────────

/**
 * Extreme-case keywords that trigger an immediate block even when the
 * OpenAI moderation API is unavailable. These are intentionally narrow
 * and cover only the most unambiguous cases.
 */
const BLOCKED_KEYWORDS: RegExp[] = [
  /\bchild\s*(sexual|porn|exploitation|abuse)\b/i,
  /\bcsam\b/i,
  /\bcp\s+content\b/i,
  /\bminor[s]?\s+(sex|nude|naked|porn)\b/i,
  /\bnon[-\s]?consensual\s+(sex|porn|intimate)\b/i,
  /\bbomb[-\s]?making\s+instructions\b/i,
  /\bsynthesize\s+(sarin|vx|ricin|anthrax)\b/i,
];

/**
 * Simple keyword-based fallback for extreme content.
 *
 * Returns a ModerationResult with action='block' if any keyword
 * pattern matches, otherwise returns null (no opinion).
 */
function keywordFallbackCheck(prompt: string): ModerationResult | null {
  const lowerPrompt = prompt.toLowerCase();

  for (const pattern of BLOCKED_KEYWORDS) {
    if (pattern.test(lowerPrompt)) {
      return {
        flagged: true,
        categories: { keyword_match: true },
        scores: { keyword_match: 1.0 },
        action: "block",
      };
    }
  }

  return null;
}

// ── OpenAI Moderation ──────────────────────────────────────────────────────

/**
 * Shape of the OpenAI moderation API response.
 * @see https://platform.openai.com/docs/api-reference/moderations
 */
interface OpenAIModerationResponse {
  id: string;
  model: string;
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

/**
 * Call the OpenAI moderation endpoint.
 *
 * Returns null on any failure (network, auth, malformed response)
 * so the caller can fall through to the keyword fallback.
 */
async function callOpenAIModeration(
  prompt: string,
): Promise<OpenAIModerationResponse | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    console.error("Content moderation: OPENAI_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: prompt }),
    }, 10_000);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown error");
      console.error(
        `Content moderation: OpenAI API returned ${response.status}: ${errorBody}`,
      );
      return null;
    }

    const data = (await response.json()) as OpenAIModerationResponse;

    if (!data.results || data.results.length === 0) {
      console.error(
        "Content moderation: OpenAI response missing results array",
      );
      return null;
    }

    return data;
  } catch (err) {
    console.error(
      "Content moderation: OpenAI API request failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Map the raw OpenAI response to our ModerationResult type.
 */
function mapOpenAIResult(
  response: OpenAIModerationResponse,
): ModerationResult {
  const result = response.results[0];

  return {
    flagged: result.flagged,
    categories: { ...result.categories },
    scores: { ...result.category_scores },
    action: result.flagged ? "block" : "allow",
  };
}

// ── Logging ────────────────────────────────────────────────────────────────

/**
 * Persist a moderation decision to the `content_moderation_log` table.
 *
 * Best-effort: errors are logged but never thrown. A failure to log
 * must not prevent the generation pipeline from proceeding.
 */
async function logModerationResult(
  supabaseClient: SupabaseClient,
  userId: string,
  prompt: string,
  result: ModerationResult,
): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from("content_moderation_log")
      .insert({
        user_id: userId,
        prompt,
        flagged: result.flagged,
        categories: result.categories,
        scores: result.scores,
        action: result.action,
      });

    if (error) {
      console.error(
        "Content moderation: failed to insert log entry:",
        error.message,
      );
    }
  } catch (err) {
    console.error(
      "Content moderation: log insert threw exception:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate a user prompt for content policy violations.
 *
 * 1. Calls the OpenAI moderation endpoint.
 * 2. If the API succeeds, maps the response to a ModerationResult.
 * 3. If the API fails, falls back to a keyword-based check for
 *    extreme content, defaulting to action='allow'.
 * 4. Logs the decision to `content_moderation_log` in all cases.
 *
 * @param prompt         - The user-supplied prompt text.
 * @param userId         - The authenticated user's UUID.
 * @param supabaseClient - A Supabase client with insert access
 *                         to content_moderation_log (service_role).
 * @returns The moderation result with an action decision.
 */
export async function moderatePrompt(
  prompt: string,
  userId: string,
  supabaseClient: SupabaseClient,
): Promise<ModerationResult> {
  // Attempt OpenAI moderation
  const openAIResponse = await callOpenAIModeration(prompt);

  let result: ModerationResult;

  if (openAIResponse) {
    // OpenAI succeeded -- use its verdict
    result = mapOpenAIResult(openAIResponse);
  } else {
    // OpenAI unavailable -- still try keyword fallback for obvious cases.
    // If THAT also has nothing to say, FAIL CLOSED. We do not let prompts
    // through with no moderation signal — moderation is a safety contract,
    // not a best-effort feature.
    const keywordResult = keywordFallbackCheck(prompt);
    if (keywordResult) {
      result = keywordResult;
    } else {
      result = {
        flagged: true,
        categories: { moderation_unavailable: true },
        scores: {},
        action: "block",
      };
    }
  }

  // Always log the decision (best-effort)
  await logModerationResult(supabaseClient, userId, prompt, result);

  return result;
}
