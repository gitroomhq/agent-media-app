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
 * Input validation utilities for Edge Functions.
 *
 * Provides sanitization and validation for user-supplied prompts,
 * file uploads, and URLs to prevent injection attacks, path traversal,
 * and SSRF vulnerabilities.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 2000;

/**
 * Patterns that indicate script injection attempts.
 * Matches common XSS vectors: <script>, javascript: URIs, and inline event handlers.
 */
const SCRIPT_INJECTION_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,
];

/**
 * Allowed MIME types for file uploads, with their corresponding max sizes.
 */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Allowed URL domains for media references.
 * Supports exact matches and wildcard subdomains.
 */
const ALLOWED_URL_DOMAINS: string[] = [
  "storage.googleapis.com",
  "*.supabase.co",
  "*.supabase.in",
  "*.r2.dev",
  "*.r2.cloudflarestorage.com",
];

/**
 * Private/reserved IP ranges that must be blocked to prevent SSRF.
 */
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^\[::1\]/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
];

// ── Prompt Validation ───────────────────────────────────────────────────────

/**
 * Validate a user-supplied prompt string.
 *
 * Checks:
 *   - Maximum length (2000 characters)
 *   - No null bytes or control characters (U+0000..U+001F, U+007F)
 *   - No script injection patterns (<script>, javascript:, on\w+=)
 *
 * @param prompt - The prompt text to validate
 * @returns Validation result with error message if invalid
 */
export function validatePrompt(prompt: string): ValidationResult {
  if (typeof prompt !== "string") {
    return { valid: false, error: "Prompt must be a string" };
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer (received ${prompt.length})`,
    };
  }

  // Check for null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(prompt)) {
    return {
      valid: false,
      error: "Prompt must not contain null bytes or control characters",
    };
  }

  // Check for script injection patterns
  for (const pattern of SCRIPT_INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return {
        valid: false,
        error: "Prompt contains disallowed content",
      };
    }
  }

  return { valid: true };
}

// ── File Upload Validation ──────────────────────────────────────────────────

/**
 * Validate a file upload descriptor.
 *
 * Checks:
 *   - MIME type is in the allowlist (image/jpeg, image/png, image/webp,
 *     video/mp4, video/webm)
 *   - Size does not exceed limits (10 MB for images, 50 MB for videos)
 *   - Filename does not contain path traversal sequences
 *
 * @param file - Object with type, size, and name properties
 * @returns Validation result with error message if invalid
 */
export function validateFileUpload(file: {
  type: string;
  size: number;
  name: string;
}): ValidationResult {
  const { type, size, name } = file;

  // Validate MIME type
  const isImage = IMAGE_TYPES.has(type);
  const isVideo = VIDEO_TYPES.has(type);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `File type '${type}' is not allowed. Supported types: ${[...IMAGE_TYPES, ...VIDEO_TYPES].join(", ")}`,
    };
  }

  // Validate file size
  const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  const maxSizeLabel = isVideo ? "50MB" : "10MB";

  if (size <= 0) {
    return { valid: false, error: "File size must be greater than 0" };
  }

  if (size > maxSize) {
    return {
      valid: false,
      error: `File size ${(size / (1024 * 1024)).toFixed(1)}MB exceeds maximum of ${maxSizeLabel} for ${isVideo ? "video" : "image"} files`,
    };
  }

  // Validate filename: no path traversal
  if (
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\x00")
  ) {
    return {
      valid: false,
      error: "Filename must not contain path traversal characters (.. / \\ or null bytes)",
    };
  }

  return { valid: true };
}

// ── URL Validation ──────────────────────────────────────────────────────────

/**
 * Check whether a hostname matches any pattern in the domain allowlist.
 *
 * Supports wildcard patterns like `*.supabase.co` which match any single
 * subdomain level (e.g., `abc.supabase.co` but not `a.b.supabase.co`).
 */
function isDomainAllowed(hostname: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith("*.")) {
      // Wildcard: match any subdomain
      const baseDomain = pattern.slice(2);
      if (
        hostname === baseDomain ||
        hostname.endsWith(`.${baseDomain}`)
      ) {
        return true;
      }
    } else {
      if (hostname === pattern) return true;
    }
  }
  return false;
}

/**
 * Check whether a hostname resolves to a private/reserved IP range.
 */
function isPrivateHost(hostname: string): boolean {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a URL for use as a media reference.
 *
 * Checks:
 *   - Must use https:// protocol
 *   - Domain must be in the allowlist (storage.googleapis.com,
 *     *.supabase.co, *.supabase.in, *.r2.dev, *.r2.cloudflarestorage.com)
 *   - Must not resolve to localhost, private IPs, or use file:// protocol
 *
 * @param url - The URL string to validate
 * @returns Validation result with error message if invalid
 */
export function validateUrl(url: string): ValidationResult {
  if (typeof url !== "string") {
    return { valid: false, error: "URL must be a string" };
  }

  // Block file:// and other non-http schemes early
  if (url.startsWith("file://")) {
    return { valid: false, error: "file:// URLs are not allowed" };
  }

  // Must be https://
  if (!url.startsWith("https://")) {
    return {
      valid: false,
      error: "URL must use https:// protocol",
    };
  }

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "URL is malformed" };
  }

  // Verify protocol after parsing (handles edge cases like https://...@http://...)
  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "URL must use https:// protocol",
    };
  }

  const hostname = parsed.hostname;

  // Block private/reserved IPs and localhost
  if (isPrivateHost(hostname)) {
    return {
      valid: false,
      error: "URLs pointing to private or reserved addresses are not allowed",
    };
  }

  // Check domain allowlist
  if (!isDomainAllowed(hostname, ALLOWED_URL_DOMAINS)) {
    return {
      valid: false,
      error: `Domain '${hostname}' is not in the allowed list. Allowed: ${ALLOWED_URL_DOMAINS.join(", ")}`,
    };
  }

  return { valid: true };
}
