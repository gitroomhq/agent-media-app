// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadUserImageFromUrl } from '../lib/r2-upload.js';
afterEach(() => vi.unstubAllGlobals());
const url = `https://api.agent-media.ai/v1/uploads/temporary/11111111-1111-1111-1111-111111111111/image?token=${'a'.repeat(64)}`;
describe('temporary generation input handoff', () => {
  it('retains the gateway reference without writing a permanent R2 copy', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { headers: { 'Content-Type': 'image/png', 'Content-Length': '100' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadUserImageFromUrl('owner', url)).toEqual({
      url,
      key: '',
      bytes: 100,
      mime: 'image/png',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'HEAD', redirect: 'error' }),
    );
  });
  it('rejects expired input before it enters the fixed workflow', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 410 }));
    await expect(uploadUserImageFromUrl('owner', url)).rejects.toThrow('expired');
  });
});
