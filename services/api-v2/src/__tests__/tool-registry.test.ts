// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import { mandatoryToolRunner } from '../tooling/tool-registry.js';

const ctx = {
  runId: 'run-test',
  userId: 'user-test',
  authToken: 'token',
  priorOutputs: {},
};

describe('mandatory tool runner', () => {
  it('returns disabled integration path when ElevenLabs key is missing', async () => {
    const result = await mandatoryToolRunner.run(
      'elevenlabs_audio',
      {
        voice_id: 'voice_123',
        script: 'hello world',
      },
      ctx,
    ) as { integration_enabled: boolean; request_payload: unknown };

    expect(result.integration_enabled).toBe(false);
    expect(result.request_payload).toBeNull();
  });

  it('builds explicit scene continuity output', async () => {
    const result = await mandatoryToolRunner.run(
      'scene_continuity',
      {
        explicit_last_frame_url: 'https://cdn.example/frame.png',
        scene_notes: 'keep wardrobe and lighting',
      },
      ctx,
    ) as { source: string; continuity_prompt_suffix: string };

    expect(result.source).toBe('explicit');
    expect(result.continuity_prompt_suffix).toContain('keep wardrobe and lighting');
  });

  it('throws for unknown tool ids', async () => {
    await expect(
      mandatoryToolRunner.run('missing-tool', {}, ctx),
    ).rejects.toThrow('Unknown toolId');
  });

  it('returns created actor_refs output without requiring character_id', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          job_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );

    try {
      const result = await mandatoryToolRunner.run(
        'actor_refs',
        {
          mode: 'create_new',
          display_name: 'Creator Persona',
          description: 'A creator persona with clear style constraints.',
          photo_url: 'https://cdn.example.com/creator.png',
        },
        ctx,
      ) as { source: string; character_id: string | null; job_id?: string };

      expect(result.source).toBe('created');
      expect(result.character_id).toBeNull();
      expect(result.job_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
