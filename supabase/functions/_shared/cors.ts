/**
 * Shared CORS helpers for all Edge Functions.
 *
 * Origin-aware: checks the request Origin against an allow-list loaded from
 * the ALLOWED_ORIGINS env var (comma-separated). Defaults to
 * https://agent-media.ai and http://localhost:3000 when not set.
 *
 * Migrated from wildcard "*" to explicit origin reflection for production
 * hardening. Functions that previously imported `corsHeaders` (the static
 * record) should now call `getCorsHeadersForOrigin(origin)` or pass the
 * request to `corsResponse` / `corsPreflightResponse`.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ALLOWED_ORIGINS: string[] = [
  "https://agent-media.ai",
  "http://localhost:3000",
  "https://*.vercel.app",
];

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

const ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Client-Info, X-Idempotency-Key, apikey";

const CORS_MAX_AGE = "86400";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAllowedOrigins(): string[] {
  const envValue = Deno.env.get("ALLOWED_ORIGINS");
  if (!envValue) return DEFAULT_ALLOWED_ORIGINS;
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string, patterns: string[]): boolean {
  if (!origin) return false;
  for (const pattern of patterns) {
    if (pattern === "*") return true;
    if (pattern.includes("*")) {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, "[^.]+");
      if (new RegExp(`^${escaped}$`).test(origin)) return true;
    } else {
      if (origin === pattern) return true;
    }
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build CORS headers for a specific request origin.
 *
 * If the origin is on the allow-list it is reflected back; otherwise
 * Access-Control-Allow-Origin is omitted and the browser will block the
 * request.
 */
export function getCorsHeadersForOrigin(
  origin: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
  };

  if (isOriginAllowed(origin, getAllowedOrigins())) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * @deprecated Use `getCorsHeadersForOrigin(origin)` instead.
 *
 * Kept temporarily for backwards compatibility during migration.
 * Falls back to the first default origin so existing call-sites that
 * spread `corsHeaders` still produce a valid (but restrictive) header set.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": ALLOWED_METHODS,
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Max-Age": CORS_MAX_AGE,
  Vary: "Origin",
};

/**
 * Build a JSON Response with origin-aware CORS headers applied.
 *
 * @param body    - JSON-serialisable response body
 * @param init    - Optional ResponseInit (status, extra headers)
 * @param origin  - The request's Origin header value
 */
export function corsResponse(
  body: unknown,
  init?: ResponseInit,
  origin?: string,
): Response {
  const status = init?.status ?? 200;
  const cors = origin
    ? getCorsHeadersForOrigin(origin)
    : corsHeaders;

  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Return a 204 response for CORS preflight (OPTIONS) requests.
 *
 * @param origin - The request's Origin header value
 */
export function corsPreflightResponse(origin?: string): Response {
  const cors = origin
    ? getCorsHeadersForOrigin(origin)
    : corsHeaders;

  return new Response(null, { status: 204, headers: cors });
}
