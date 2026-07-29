// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the OpenAI SDK so no network call is made; `createMock` is the moderations.create stub.
const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class {
    moderations = { create: createMock };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: unknown) {}
  },
}));

import { moderateImageOrThrow, ModerationError } from '../lib/image-moderation.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function scores(s: Record<string, number>) {
  return { results: [{ flagged: true, categories: {}, category_scores: s }] };
}

describe('image moderation gate', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_API_KEY = 'sk-test';
    delete process.env.IMAGE_MODERATION_DISABLED;
    delete process.env.IMAGE_MODERATION_FAILCLOSED;
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('is a no-op (no provider call) when disabled by kill switch', async () => {
    process.env.IMAGE_MODERATION_DISABLED = '1';
    await expect(moderateImageOrThrow(PNG, 'image/png')).resolves.toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('is a no-op when no OPENAI_API_KEY is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(moderateImageOrThrow(PNG, 'image/png')).resolves.toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('BLOCKS sexual/minors at low score (zero tolerance)', async () => {
    createMock.mockResolvedValue(scores({ 'sexual/minors': 0.3, sexual: 0.1 }));
    await expect(moderateImageOrThrow(PNG, 'image/png')).rejects.toBeInstanceOf(ModerationError);
  });

  it('BLOCKS explicit sexual content over threshold', async () => {
    createMock.mockResolvedValue(scores({ 'sexual/minors': 0.0, sexual: 0.9 }));
    await expect(moderateImageOrThrow(PNG, 'image/png')).rejects.toThrow(/sexual/);
  });

  it('ALLOWS ordinary content below thresholds', async () => {
    createMock.mockResolvedValue(scores({ 'sexual/minors': 0.01, sexual: 0.2, 'violence/graphic': 0.05 }));
    await expect(moderateImageOrThrow(PNG, 'image/png')).resolves.toBeUndefined();
  });

  it('fails OPEN on a provider error by default (does not block legit uploads)', async () => {
    createMock.mockRejectedValue(new Error('openai 503'));
    await expect(moderateImageOrThrow(PNG, 'image/png')).resolves.toBeUndefined();
  });

  it('fails CLOSED on a provider error when IMAGE_MODERATION_FAILCLOSED=1', async () => {
    process.env.IMAGE_MODERATION_FAILCLOSED = '1';
    createMock.mockRejectedValue(new Error('openai 503'));
    await expect(moderateImageOrThrow(PNG, 'image/png')).rejects.toBeInstanceOf(ModerationError);
  });

  it('sends an image_url data URL to omni-moderation-latest', async () => {
    createMock.mockResolvedValue(scores({ sexual: 0.0 }));
    await moderateImageOrThrow(PNG, 'image/png');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'omni-moderation-latest',
        input: [expect.objectContaining({ type: 'image_url' })],
      }),
    );
  });
});
