// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Shared Sentry `beforeSend` scrubber. Strips PII / secrets from events before
 * they leave the browser or server: emails, agent-media API keys (ma_…),
 * bearer tokens, and Sentry/Supabase DSNs that might appear in messages or URLs.
 * Conservative by design — we'd rather over-redact than leak a customer email
 * or a key into the error backend.
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

const REDACTIONS: { re: RegExp; with: string }[] = [
  { re: /\bma_[A-Za-z0-9]{8,}\b/g, with: 'ma_[REDACTED]' },
  { re: /\bsk-[A-Za-z0-9]{8,}\b/g, with: 'sk-[REDACTED]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, with: 'Bearer [REDACTED]' },
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, with: '[email]' },
  { re: /https?:\/\/[^@\s]+@[^/\s]+/g, with: 'https://[REDACTED]@host' },
];

function redact(value: string): string {
  return REDACTIONS.reduce((acc, r) => acc.replace(r.re, r.with), value);
}

function deepRedact(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === 'string') return redact(obj);
  if (Array.isArray(obj)) return obj.map((v) => deepRedact(v, depth + 1));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = deepRedact(v, depth + 1);
    return out;
  }
  return obj;
}

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Never send cookies; redact the rest in place.
  if (event.request?.cookies) delete event.request.cookies;
  return deepRedact(event) as ErrorEvent;
}
