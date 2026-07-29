// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Map a thrown pipeline error to a stable error_code that the dashboard
 * and webhook consumers can switch on. The catch-all is PROVIDER_FAILURE
 * (matches today's webhook-provider default for back-compat).
 *
 * Codes (most specific first):
 *
 *   CONTENT_POLICY_BLOCKED   Provider's safety filter blocked the request.
 *                            User needs to change prompt/inputs. Refund.
 *
 *   TTS_FAILED               TTS upstream failed (OpenAI/ElevenLabs/Hume).
 *                            From error-classifier helpers in ugc-pipeline.
 *
 *   NO_AUDIO_AVAILABLE       Pipeline reached assembly with no audio for
 *                            any scene. Surfaced from ugc-pipeline pre-flight.
 *
 *   PROVIDER_QUOTA_EXHAUSTED Our EvoLink/Replicate account is out of credit
 *                            on the provider's side. Operations issue, not user.
 *
 *   PROVIDER_BUSY            Upstream returned "service busy / allocating
 *                            resources". Transient; user can retry.
 *
 *   PROVIDER_CIRCUIT_OPEN    Phase C circuit breaker tripped — too many
 *                            errors in our limiter window. Brief cool-down.
 *
 *   PROVIDER_TIMEOUT         Upstream poll didn't return a final status
 *                            inside our timeout window.
 *
 *   PROVIDER_FAILURE         Catch-all (matches today's default for back-compat).
 */

const CONTENT_POLICY_RE = /\b(content\s*policy|safety|moderation|inappropriate|explicit|suggestive|sexual|nudity|nsfw|disallowed|blocked\s*by\s*safety|content\s*violation)\b/i;
const QUOTA_RE = /insufficient[_\s-]*(quota|credits|balance)|account.*balance|out\s+of\s+credit/i;
const BUSY_RE = /service\s*busy|allocating\s*resources|capacity|overloaded|try\s+later|temporar(?:y|ily)/i;
const TIMEOUT_RE = /timed?\s*out|timeout/i;
const RATE_LIMIT_RE = /rate\s*limit|too\s+many\s+requests|429/i;

/**
 * @param {Error|unknown} err
 * @returns {{ code: string, message: string }}
 */
export function classifyError(err) {
  const message = err instanceof Error ? err.message : String(err ?? 'unknown error');

  // 1. Explicit code on the thrown error (set by ugc-pipeline / etc.)
  const explicitCode = err && typeof err === 'object' && typeof err.code === 'string' ? err.code : null;
  if (explicitCode === 'TTS_FAILED' || explicitCode === 'NO_AUDIO_AVAILABLE') {
    return { code: explicitCode, message };
  }

  // 2. Custom error class (from provider-limiter)
  if (err && err.name === 'CircuitOpenError') {
    return { code: 'PROVIDER_CIRCUIT_OPEN', message };
  }

  // 3. Pattern-match the message
  if (CONTENT_POLICY_RE.test(message)) {
    return { code: 'CONTENT_POLICY_BLOCKED', message };
  }
  if (QUOTA_RE.test(message)) {
    return { code: 'PROVIDER_QUOTA_EXHAUSTED', message };
  }
  if (RATE_LIMIT_RE.test(message)) {
    return { code: 'PROVIDER_RATE_LIMITED', message };
  }
  if (BUSY_RE.test(message)) {
    return { code: 'PROVIDER_BUSY', message };
  }
  if (TIMEOUT_RE.test(message)) {
    return { code: 'PROVIDER_TIMEOUT', message };
  }

  // 4. Fallback — matches today's webhook-provider default
  return { code: 'PROVIDER_FAILURE', message };
}
