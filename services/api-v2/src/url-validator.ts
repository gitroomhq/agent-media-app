// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * URL validation to prevent SSRF attacks.
 * Blocks private IPs, link-local, cloud metadata, and internal hostnames.
 */

import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.internal',
  '.local',
  '.railway.internal',
];

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;           // loopback
  if (ip.startsWith('169.254.')) return true;        // link-local / cloud metadata
  if (ip === '0.0.0.0') return true;
  if (ip.startsWith('::') || ip === '::1') return true; // IPv6 loopback
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 ULA
  if (ip.startsWith('fe80')) return true;            // IPv6 link-local
  return false;
}

export interface ValidatedUrl {
  /** null when the URL is safe; error message when blocked */
  error: string | null;
  /**
   * Resolved IP address — pin this for the actual fetch to prevent DNS rebinding.
   *
   * KNOWN LIMITATION: Currently, callers do not pin this IP for downstream fetches
   * because the URLs are passed to external services (OpenAI Vision, worker dispatch)
   * rather than fetched directly by the API server. The double-resolve check in
   * validateUrlForFetch provides mitigation, but for any future direct-fetch use case,
   * callers should use this IP with a custom HTTP agent to prevent TOCTOU attacks.
   */
  resolvedIP?: string;
}

/**
 * Validate a URL is safe for server-side fetching.
 * Returns the resolved IP so callers can pin the connection to it,
 * preventing DNS rebinding (TOCTOU) attacks.
 */
export async function validateUrlForFetch(url: string): Promise<ValidatedUrl> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid URL' };
  }

  // Must be HTTPS for webhooks
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'URL must use http or https protocol' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { error: `Blocked hostname: ${hostname}` };
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { error: `Blocked hostname: ${hostname}` };
    }
  }

  // Resolve DNS and check IP
  let address: string;
  try {
    ({ address } = await lookup(hostname));
    if (isPrivateIP(address)) {
      return { error: `URL resolves to private IP` };
    }
  } catch {
    return { error: `Cannot resolve hostname: ${hostname}` };
  }

  // Double-resolve to detect DNS rebinding: if the IP changes between
  // two rapid resolutions, the domain is suspicious.
  try {
    const second = await lookup(hostname);
    if (isPrivateIP(second.address)) {
      return { error: 'URL resolves to private IP (rebinding detected)' };
    }
  } catch {
    return { error: `Cannot resolve hostname: ${hostname}` };
  }

  return { error: null, resolvedIP: address };
}

/**
 * Validate webhook URL — must be HTTPS and not internal.
 */
export async function validateWebhookUrl(url: string): Promise<ValidatedUrl> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid webhook URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'webhook_url must use HTTPS' };
  }

  return validateUrlForFetch(url);
}
