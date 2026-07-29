// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Edge Function: verify-attestation
 *
 * Verifies an iOS App Attest assertion or Android Play Integrity verdict
 * sent by the native mobile app. On success, returns a short-lived signed
 * "attested" claim the app passes alongside the Supabase JWT on sensitive
 * operations (signup, generation submit, IAP receipt verify).
 *
 * Route:
 *   POST /functions/v1/verify-attestation
 *
 * Body:
 *   {
 *     "platform": "ios" | "android",
 *     "user_id": "<supabase user id>",         // from the JWT, echoed for logging
 *     "nonce": "<server-issued nonce>",        // mint via /functions/v1/attestation-nonce (TODO)
 *     "attestation": "<base64 attestation>",   // App Attest assertion or Play Integrity token
 *     "key_id": "<App Attest key id>",         // iOS only — first call only
 *     "bundle_id": "ai.agentmedia.app"         // iOS bundle id or Android package name
 *   }
 *
 * Response (200):
 *   {
 *     "verified": true,
 *     "platform": "ios" | "android",
 *     "claim": "<JWT signed with ATTESTATION_SIGNING_KEY, exp=now+15m>",
 *     "exp": <unix-seconds>
 *   }
 *
 * Response (401):
 *   { "verified": false, "error": { "code": "ATTESTATION_FAILED", "message": "..." } }
 *
 * Status: STUB. Crypto verification is not wired up yet — implement the two
 * provider paths below before deploying to production. The function shape,
 * input validation, rate limit, CORS, and signed-claim contract are real and
 * production-ready; only the cryptographic verification calls are TODO.
 *
 * To finish:
 *   - iOS App Attest: fetch and pin Apple's App Attest root certificate, parse
 *     the CBOR attestation/assertion, validate the receipt chain against
 *     bundle_id and team_id, and verify the assertion signature against the
 *     stored public key for key_id (first call) or the cached one (subsequent).
 *     Spec: https://developer.apple.com/documentation/devicecheck/establishing_your_app_s_integrity
 *
 *   - Android Play Integrity: POST the integrity token to the Play Integrity
 *     API (https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken)
 *     using a Google service account, check appIntegrity.appRecognitionVerdict
 *     == "PLAY_RECOGNIZED" and deviceIntegrity.deviceRecognitionVerdict
 *     contains "MEETS_DEVICE_INTEGRITY". Reject otherwise.
 *     Spec: https://developer.android.com/google/play/integrity/verdicts
 *
 * Env vars (none of these exist yet — set before going live):
 *   APPLE_APP_ATTEST_TEAM_ID         — Apple Developer team id
 *   APPLE_APP_ATTEST_BUNDLE_ID       — e.g. ai.agentmedia.app
 *   GOOGLE_PLAY_INTEGRITY_PACKAGE    — Android package name
 *   GOOGLE_PLAY_INTEGRITY_SA_JSON    — base64-encoded service account JSON
 *   ATTESTATION_SIGNING_KEY          — HS256 secret for the returned claim
 *   ATTESTATION_NONCE_SECRET         — HMAC secret for nonce validation (separate function)
 */

import { getCorsHeaders, getSecurityHeaders } from "../_shared/security-headers.ts";

// ── Rate limiting (per IP, public-ish endpoint) ─────────────────────────────

const IP_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 30;

interface IpBucket {
  timestamps: number[];
}
const ipBuckets = new Map<string, IpBucket>();

function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoff = now - IP_WINDOW_MS;
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { timestamps: [] };
    ipBuckets.set(ip, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  if (bucket.timestamps.length >= IP_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  bucket.timestamps.push(now);
  return { allowed: true, remaining: IP_MAX_REQUESTS - bucket.timestamps.length };
}

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// ── Request shape ───────────────────────────────────────────────────────────

interface AttestationRequest {
  platform: "ios" | "android";
  user_id: string;
  nonce: string;
  attestation: string;
  key_id?: string;
  bundle_id: string;
}

function validateRequest(body: unknown): AttestationRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be JSON object" };
  const b = body as Record<string, unknown>;
  if (b.platform !== "ios" && b.platform !== "android") {
    return { error: 'platform must be "ios" or "android"' };
  }
  if (typeof b.user_id !== "string" || !b.user_id) {
    return { error: "user_id required" };
  }
  if (typeof b.nonce !== "string" || !b.nonce) {
    return { error: "nonce required" };
  }
  if (typeof b.attestation !== "string" || !b.attestation) {
    return { error: "attestation required" };
  }
  if (typeof b.bundle_id !== "string" || !b.bundle_id) {
    return { error: "bundle_id required" };
  }
  if (b.platform === "ios" && b.key_id !== undefined && typeof b.key_id !== "string") {
    return { error: "key_id must be string when present" };
  }
  return {
    platform: b.platform,
    user_id: b.user_id,
    nonce: b.nonce,
    attestation: b.attestation,
    bundle_id: b.bundle_id,
    ...(b.key_id ? { key_id: b.key_id as string } : {}),
  };
}

// ── Stub verifiers ──────────────────────────────────────────────────────────

interface VerifyResult {
  ok: boolean;
  reason?: string;
}

async function verifyAppAttest(_req: AttestationRequest): Promise<VerifyResult> {
  // TODO: parse CBOR attestation/assertion, validate Apple cert chain,
  // confirm bundle_id + team_id, verify signature.
  // Until wired up, refuse on a clearly-named error so it cannot accidentally
  // succeed in production.
  return { ok: false, reason: "App Attest verification not yet implemented" };
}

async function verifyPlayIntegrity(_req: AttestationRequest): Promise<VerifyResult> {
  // TODO: call Play Integrity API with a Google service account, check
  // appIntegrity.appRecognitionVerdict and deviceIntegrity verdict.
  return { ok: false, reason: "Play Integrity verification not yet implemented" };
}

// ── Signed claim ────────────────────────────────────────────────────────────

const TEXT = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, TEXT.encode(data));
  return new Uint8Array(sig);
}

async function mintAttestedClaim(
  secret: string,
  payload: { sub: string; platform: "ios" | "android"; ttlSeconds: number },
): Promise<{ token: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + payload.ttlSeconds;
  const header = { alg: "HS256", typ: "JWT" };
  const body = { sub: payload.sub, platform: payload.platform, attested: true, iat: now, exp };
  const headerB64 = base64UrlEncode(TEXT.encode(JSON.stringify(header)));
  const bodyB64 = base64UrlEncode(TEXT.encode(JSON.stringify(body)));
  const signingInput = `${headerB64}.${bodyB64}`;
  const sigBytes = await hmacSha256(secret, signingInput);
  const sigB64 = base64UrlEncode(sigBytes);
  return { token: `${signingInput}.${sigB64}`, exp };
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    ...getCorsHeaders(origin),
    ...getSecurityHeaders(),
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const ip = getClientIp(req);
  const { allowed, remaining } = checkIpRateLimit(ip);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many attestation attempts. Try again in 60 seconds." } }),
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_JSON", message: "Body must be valid JSON." } }),
      { status: 400, headers },
    );
  }

  const validated = validateRequest(parsed);
  if ("error" in validated) {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_REQUEST", message: validated.error } }),
      { status: 400, headers },
    );
  }

  const signingSecret = Deno.env.get("ATTESTATION_SIGNING_KEY");
  if (!signingSecret) {
    console.error("[verify-attestation] ATTESTATION_SIGNING_KEY env var not set");
    return new Response(
      JSON.stringify({ error: { code: "NOT_CONFIGURED", message: "Attestation verification is not configured on this server." } }),
      { status: 503, headers },
    );
  }

  // TODO: also verify `nonce` against a server-issued nonce store
  // (mint via a separate /functions/v1/attestation-nonce endpoint, store in
  // Supabase with TTL keyed by user_id, single-use, HMAC-validated).

  const result =
    validated.platform === "ios"
      ? await verifyAppAttest(validated)
      : await verifyPlayIntegrity(validated);

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        verified: false,
        error: { code: "ATTESTATION_FAILED", message: result.reason ?? "Attestation rejected." },
      }),
      { status: 401, headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } },
    );
  }

  const { token, exp } = await mintAttestedClaim(signingSecret, {
    sub: validated.user_id,
    platform: validated.platform,
    ttlSeconds: 15 * 60,
  });

  return new Response(
    JSON.stringify({ verified: true, platform: validated.platform, claim: token, exp }),
    { status: 200, headers: { ...headers, "X-RateLimit-Remaining": String(remaining) } },
  );
});
