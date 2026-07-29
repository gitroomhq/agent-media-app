// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mandatoryToolRunner } from '../tooling/tool-registry.js';

const ctx = {
  runId: 'run-test',
  userId: 'user-test',
  authToken: 'token-test',
  priorOutputs: {},
};

describe('tooling primitive registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps portrait_gpt2 disabled unless the vNext primitive worker is configured', async () => {
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_URL', '');
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_SECRET', '');

    await expect(
      mandatoryToolRunner.run('portrait_gpt2', {
        description: '30-year-old woman in soft home window light',
      }, ctx),
    ).rejects.toThrow('portrait_gpt2 primitive worker is not configured');
  });

  it('submits portrait_gpt2 to the fresh primitive worker with validated input', async () => {
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_URL', 'https://primitive-worker.test/');
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_SECRET', 'secret-test');
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({
      job_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'submitted',
      portrait_url: null,
      provider: 'gpt-image-2',
      credits_deducted: 25,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const output = await mandatoryToolRunner.run('portrait_gpt2', {
      description: '30-year-old woman in soft home window light',
      aspect_ratio: '9:16',
      realism_target: 'raw_iphone',
    }, ctx);

    expect(output).toEqual({
      job_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'submitted',
      portrait_url: null,
      provider: 'gpt-image-2',
      credits_deducted: 25,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://primitive-worker.test/v1/primitives/portrait_gpt2');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Primitive-Worker-Secret': 'secret-test',
      'X-Tooling-Run-Id': 'run-test',
      'X-Tooling-User-Id': 'user-test',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      description: '30-year-old woman in soft home window light',
      aspect_ratio: '9:16',
      realism_target: 'raw_iphone',
    });
  });

  it('rejects unsafe portrait reference URLs before contacting the primitive worker', async () => {
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_URL', 'https://primitive-worker.test');
    vi.stubEnv('VNEXT_PRIMITIVE_WORKER_SECRET', 'secret-test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      mandatoryToolRunner.run('portrait_gpt2', {
        description: '30-year-old woman in soft home window light',
        reference_photo_url: 'https://[::ffff:169.254.169.254]/latest/meta-data/',
      }, ctx),
    ).rejects.toThrow('reference_photo_url must use https and must not target private/internal addresses');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
