// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// SSRF guard decision core for user-supplied URLs re-hosted to R2.

import { describe, it, expect } from 'vitest';
import { isPrivateIp, validateOutboundUrl } from '../lib/r2-upload.js';

describe('isPrivateIp', () => {
  it('blocks cloud metadata + all private/loopback/link-local/CGNAT/ULA', () => {
    for (const ip of [
      '169.254.169.254', // AWS/GCP metadata
      '127.0.0.1', '127.1.2.3', '0.0.0.0',
      '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255',
      '100.64.0.1', '100.127.0.1', // CGNAT
      '224.0.0.1', '255.255.255.255',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
      '::ffff:10.0.0.1', '::ffff:169.254.169.254', // IPv4-mapped
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('allows real public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '104.18.0.1', '172.15.0.1', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('validateOutboundUrl', () => {
  it('accepts a normal https URL', () => {
    expect(validateOutboundUrl('https://cdn.shop.com/a.png').hostname).toBe('cdn.shop.com');
    expect(validateOutboundUrl('https://cdn.shop.com:8443/a.png').port).toBe('8443');
  });
  it('rejects http, credentials, and disallowed ports', () => {
    expect(() => validateOutboundUrl('http://cdn.shop.com/a.png')).toThrow(/https/);
    expect(() => validateOutboundUrl('https://user:pw@cdn.shop.com/a.png')).toThrow(/credentials/);
    expect(() => validateOutboundUrl('https://cdn.shop.com:6379/a.png')).toThrow(/port/);
    expect(() => validateOutboundUrl('not-a-url')).toThrow(/invalid/);
  });
});

describe('uploadUserImageFromUrl / uploadUserVideoFromUrl — live guard path', () => {
  // Dummy R2 env so readEnv() passes; no network/R2 is reached because the guard
  // throws first. dns.lookup on a literal IP is offline + deterministic.
  process.env.R2_ACCOUNT_ID ??= 'x';
  process.env.R2_ACCESS_KEY_ID ??= 'x';
  process.env.R2_SECRET_ACCESS_KEY ??= 'x';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const load = async () => await import('../lib/r2-upload.js');

  it('rejects the cloud-metadata IP before fetching or writing R2', async () => {
    const { uploadUserImageFromUrl } = await load();
    await expect(uploadUserImageFromUrl('u1', 'https://169.254.169.254/latest/meta.png')).rejects.toThrow(
      /private\/internal address/,
    );
  });
  it('rejects a literal private IP for video', async () => {
    const { uploadUserVideoFromUrl } = await load();
    await expect(uploadUserVideoFromUrl('u1', 'https://10.0.0.5/x.mp4')).rejects.toThrow(
      /private\/internal address/,
    );
  });
  it('rejects http (no downgrade)', async () => {
    const { uploadUserImageFromUrl } = await load();
    await expect(uploadUserImageFromUrl('u1', 'http://example.com/a.png')).rejects.toThrow(/https/);
  });
});
