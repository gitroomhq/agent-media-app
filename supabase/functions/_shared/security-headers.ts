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
 * Shared security headers for Edge Functions.
 *
 * Provides two header sets:
 *   - getCorsHeaders(origin): Origin-aware CORS headers with allow-list
 *   - getSecurityHeaders():   Standard security hardening headers
 *
 * Usage:
 *   const headers = {
 *     ...getCorsHeaders(req.headers.get('Origin') ?? ''),
 *     ...getSecurityHeaders(),
 *   };
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Default allowed origins when ALLOWED_ORIGINS env var is not set. */
const DEFAULT_ALLOWED_ORIGINS: string[] = [
  "https://agent-media.ai",
  "http://localhost:3000",
  "https://*.vercel.app",
];

/**
 * Allowed HTTP methods for CORS preflight.
 */
const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

/**
 * Allowed request headers for CORS preflight.
 */
const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Client-Info, X-Idempotency-Key, apikey";

/**
 * Max age for CORS preflight cache (24 hours).
 */
const CORS_MAX_AGE = "86400";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse the ALLOWED_ORIGINS environment variable into an array of patterns.
 * Falls back to DEFAULT_ALLOWED_ORIGINS if not set.
 */
function getAllowedOrigins(): string[] {
  const envValue = Deno.env.get("ALLOWED_ORIGINS");
  if (!envValue) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check whether a given origin matches any of the allowed origin patterns.
 *
 * Supports wildcard patterns like `https://*.vercel.app` where `*` matches
 * any single subdomain segment (no dots).
 */
function isOriginAllowed(origin: string, patterns: string[]): boolean {
  if (!origin) return false;

  for (const pattern of patterns) {
    if (pattern === "*") return true;

    if (pattern.includes("*")) {
      // Convert wildcard pattern to regex:
      //   https://*.vercel.app -> https://[^.]+\.vercel\.app
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, "[^.]+");
      const regex = new RegExp(`^${escaped}$`);
      if (regex.test(origin)) return true;
    } else {
      if (origin === pattern) return true;
    }
  }

  return false;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build CORS response headers for the given request origin.
 *
 * If the origin matches the allow-list, it is reflected back in
 * Access-Control-Allow-Origin. Otherwise, the header is omitted
 * (browser will block the request).
 *
 * @param origin - The value of the request's Origin header.
 */
export function getCorsHeaders(origin: string): Record<string, string> {
  const patterns = getAllowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
  };

  if (isOriginAllowed(origin, patterns)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * Return standard security hardening headers.
 *
 * These mitigate common web vulnerabilities:
 *   - X-Content-Type-Options: Prevents MIME-type sniffing
 *   - X-Frame-Options: Prevents clickjacking
 *   - Referrer-Policy: Limits referrer information leakage
 *   - Permissions-Policy: Restricts browser feature access
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
