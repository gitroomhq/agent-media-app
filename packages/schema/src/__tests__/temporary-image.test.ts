// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { describe, it, expect } from 'vitest';
import { isTemporaryImageUrl } from '../v2/temporary-image.js';
const path = '/v1/uploads/temporary/12345678-1234-1234-1234-123456789abc/image';
const url = `https://api.agent-media.ai${path}?token=${'a'.repeat(64)}`;
describe('temporary image trust boundary', () => {
  it('accepts only the configured gateway with one well-formed capability', () => {
    expect(isTemporaryImageUrl(url)).toBe(true);
    for (const bad of [
      url.replace('api.agent-media.ai', 'api.agent-media.ai.evil.test'),
      url.replace('/image?', '/redirect?'),
      `${url}&next=https://evil.test`,
      `${url}#fragment`,
      url.replace('https://', 'https://user@'),
      url.replace('token=', 'wrong='),
      `${url}&token=${'b'.repeat(64)}`,
    ]) {
      expect(isTemporaryImageUrl(bad), bad).toBe(false);
    }
  });
  it('supports an explicit self-host API without trusting arbitrary local hosts', () => {
    const local = `http://localhost:3001${path}?token=${'a'.repeat(64)}`;
    expect(isTemporaryImageUrl(local)).toBe(false);
    expect(isTemporaryImageUrl(local, 'http://localhost:3001')).toBe(true);
    expect(isTemporaryImageUrl(url, 'https://selfhost.example')).toBe(false);
  });
});
