// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// The OAuth surface must be rate limited.
//
// /authorize, /token, /register and /revoke mount very early in server.ts so they
// beat the /functions/v1/* catch-all. That put them ABOVE the general
// `app.use(ipFloodLimiter)` guarding the API route table, so they had no rate
// limiting at all — an attacker could hammer token exchange or spray dynamic
// client registrations unthrottled.
//
// These are source-structure assertions rather than live HTTP calls: importing
// server.ts boots Temporal/Supabase clients, and what actually matters here is
// ORDER (limiter mounted before the router), which a request-level test on a
// stubbed app would not prove.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'server.ts'),
  'utf-8',
);
const lineOf = (needle: string): number => {
  const i = SERVER.split('\n').findIndex((l) => l.includes(needle));
  if (i === -1) throw new Error(`not found in server.ts: ${needle}`);
  return i + 1;
};

describe('OAuth endpoints are rate limited', () => {
  it('defines a limiter for each sensitive OAuth route', () => {
    expect(SERVER).toContain('const oauthRegisterLimiter');
    expect(SERVER).toContain('const oauthTokenLimiter');
    expect(SERVER).toContain('const oauthAuthorizeLimiter');
  });

  it('mounts every limiter BEFORE the OAuth router handles the request', () => {
    const router = lineOf('app.use(createMcpOAuthRouter())');
    for (const mount of [
      "app.use(['/register'], oauthRegisterLimiter)",
      "app.use(['/token', '/revoke'], oauthTokenLimiter)",
      "app.use(['/authorize'], oauthAuthorizeLimiter)",
    ]) {
      expect(lineOf(mount)).toBeLessThan(router);
    }
  });

  it('declares the limiters before they are mounted (no temporal dead zone)', () => {
    expect(lineOf('const oauthRegisterLimiter')).toBeLessThan(
      lineOf("app.use(['/register'], oauthRegisterLimiter)"),
    );
    expect(lineOf('const oauthAuthorizeLimiter')).toBeLessThan(
      lineOf("app.use(['/authorize'], oauthAuthorizeLimiter)"),
    );
  });

  it('covers all four sensitive routes', () => {
    const mounts = SERVER.slice(
      SERVER.indexOf('const oauthRegisterLimiter'),
      SERVER.indexOf('app.use(createMcpOAuthRouter())'),
    );
    for (const route of ['/register', '/token', '/revoke', '/authorize']) {
      expect(mounts).toContain(`'${route}'`);
    }
  });

  it('keys on IP — these routes are pre-auth so there is no userId yet', () => {
    expect(SERVER).toContain('const oauthIpKey');
    expect(SERVER).toMatch(/oauthIpKey[\s\S]{0,120}ipKeyGenerator/);
  });

  it('rations registration hardest (a real client registers once)', () => {
    const block = SERVER.slice(
      SERVER.indexOf('const oauthRegisterLimiter'),
      SERVER.indexOf('const oauthTokenLimiter'),
    );
    const max = Number(block.match(/max:\s*(\d+)/)?.[1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(20);
  });

  it('leaves .well-known discovery unthrottled — clients fetch it before anything else', () => {
    // Look ONLY at limiter mount statements. The nearby OAuth *logging*
    // middleware legitimately matches /.well-known, so scanning the whole block
    // would be a false positive.
    const limiterMounts = SERVER.split('\n').filter((l) =>
      /app\.use\(\[.*\],\s*oauth\w+Limiter\)/.test(l),
    );
    expect(limiterMounts.length).toBe(3);
    for (const line of limiterMounts) {
      expect(line).not.toContain('.well-known');
    }
  });
});
