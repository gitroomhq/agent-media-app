// Copyright 2026 agent-media contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Security types for the agent-media platform.
 *
 * Covers rate limiting, content moderation, input validation,
 * CORS configuration, and HTTP security headers. These types are
 * consumed by Edge Functions, middleware, and the CLI.
 */

import type { BillingPlanTier } from './billing.js';

// ── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Rate-limit configuration for a given subscription tier.
 *
 * Stored in the `rate_limit_config` table and loaded at request time
 * to determine per-endpoint throttling for the user's plan.
 */
export interface RateLimitConfig {
  /** Subscription tier slug (e.g., 'free', 'starter', 'growth', 'pro'). */
  tierSlug: BillingPlanTier;
  /** Maximum sustained requests per rolling 60-second window. */
  requestsPerMinute: number;
  /** Maximum instantaneous burst above the sustained rate. */
  burstLimit: number;
}

/**
 * A single entry in the sliding-window rate-limit log.
 *
 * Tracked per (user, endpoint) pair with a fixed window start time.
 * The `rate_limit_log` table stores these rows and the Edge Function
 * increments `requestCount` atomically on each request.
 */
export interface RateLimitEntry {
  /** The user being rate-limited. */
  userId: string;
  /** The endpoint pattern that was matched (e.g., '/v1/generate'). */
  endpoint: string;
  /** Start of the current rate-limit window. */
  windowStart: Date;
  /** Number of requests recorded in this window so far. */
  requestCount: number;
}

// ── Content Moderation ─────────────────────────────────────────────────────

/**
 * Result of running a prompt through the content moderation pipeline.
 *
 * The moderation service returns per-category flags and confidence
 * scores. The `action` field determines how the platform handles
 * the request downstream.
 */
export interface ContentModerationResult {
  /** Whether any moderation category was triggered. */
  flagged: boolean;
  /** Per-category boolean flags (e.g., 'violence', 'sexual', 'hate'). */
  categories: Record<string, boolean>;
  /** Per-category confidence scores (0.0 – 1.0). */
  scores: Record<string, number>;
  /** Platform action: allow the request, block it, or queue for manual review. */
  action: 'allow' | 'block' | 'review';
}

/**
 * Persisted audit log entry for a content moderation decision.
 *
 * Stored in the `content_moderation_log` table for compliance
 * and abuse-investigation purposes.
 */
export interface ContentModerationLog {
  /** Unique log entry identifier (UUID). */
  id: string;
  /** The user whose prompt was moderated. */
  userId: string;
  /** Associated generation job, if the request proceeded past moderation. */
  jobId?: string;
  /** The prompt text that was evaluated. */
  prompt: string;
  /** Full moderation result including categories, scores, and action. */
  result: ContentModerationResult;
  /** ISO 8601 timestamp when the moderation check was performed. */
  createdAt: string;
}

// ── Input Validation ───────────────────────────────────────────────────────

/**
 * Configurable rules for validating user-supplied inputs.
 *
 * Applied at the Edge Function layer before any generation work begins.
 * Values are typically loaded from environment variables or a config
 * table so they can be tuned without redeploying.
 */
export interface InputValidationRules {
  /** Maximum allowed prompt length in characters. */
  maxPromptLength: number;
  /** MIME types or extensions accepted for file uploads (e.g., ['image/png', 'video/mp4']). */
  allowedFileTypes: string[];
  /** Maximum upload file size in megabytes. */
  maxFileSizeMb: number;
  /** Allowlisted URL domains for remote media inputs. */
  urlDomainAllowlist: string[];
}

// ── CORS Configuration ─────────────────────────────────────────────────────

/**
 * Cross-Origin Resource Sharing configuration for the Edge Function layer.
 */
export interface CorsConfig {
  /** Origins permitted to make cross-origin requests. */
  allowedOrigins: string[];
  /** HTTP methods permitted in cross-origin requests. */
  allowedMethods: string[];
  /** HTTP headers permitted in cross-origin requests. */
  allowedHeaders: string[];
}

// ── Security Headers ───────────────────────────────────────────────────────

/**
 * HTTP security headers applied to every Edge Function response.
 *
 * These values are set once at startup and injected into the
 * response via middleware.
 */
export interface SecurityHeaders {
  /** Content-Security-Policy directive string. */
  csp: string;
  /** X-Frame-Options value (e.g., 'DENY', 'SAMEORIGIN'). */
  xFrameOptions: string;
  /** X-Content-Type-Options value (typically 'nosniff'). */
  xContentTypeOptions: string;
  /** Referrer-Policy value (e.g., 'strict-origin-when-cross-origin'). */
  referrerPolicy: string;
}
