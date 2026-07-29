// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import {
  ActorRefToolOutputSchema,
  PortraitGpt2ToolInputSchema,
  PortraitGpt2ToolOutputSchema,
  V1_MANDATORY_TOOL_CONTRACTS,
  generateV1ToolContractSchemas,
} from '../tooling/contracts.js';

describe('v1 tooling contracts', () => {
  it('exports the mandatory tool contract set', () => {
    expect(Object.keys(V1_MANDATORY_TOOL_CONTRACTS)).toEqual([
      'actor_refs',
      'scene_continuity',
      'elevenlabs_audio',
      'portrait_gpt2',
      'character_sheet_gpt2',
      'wireframe_gpt2',
      'simple_selfie',
      'product_in_hands',
      'broll_talking_head',
      'subtitles_v2',
      'lip_sync',
      'selfie',
      'subtitles',
    ]);
  });

  it('generates aligned input/output json schemas for each tool', () => {
    const generated = generateV1ToolContractSchemas();
    for (const id of Object.keys(V1_MANDATORY_TOOL_CONTRACTS)) {
      expect(generated[id]).toBeDefined();
      expect(generated[id]?.input).toBeDefined();
      expect(generated[id]?.output).toBeDefined();
    }
  });

  it('accepts created actor_refs output with pending character_id', () => {
    const parsed = ActorRefToolOutputSchema.safeParse({
      source: 'created',
      character_id: null,
      job_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects created actor_refs output when both ids are missing', () => {
    const parsed = ActorRefToolOutputSchema.safeParse({
      source: 'created',
      character_id: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('defines portrait_gpt2 as one realistic gpt-image-2 portrait primitive', () => {
    const input = PortraitGpt2ToolInputSchema.parse({
      description: '30-year-old woman with natural skin in soft window light',
    });
    expect(input.aspect_ratio).toBe('1:1');
    expect(input.realism_target).toBe('natural');

    const output = PortraitGpt2ToolOutputSchema.parse({
      job_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'submitted',
      portrait_url: null,
      provider: 'gpt-image-2',
      credits_deducted: 25,
    });
    expect(output.provider).toBe('gpt-image-2');
  });

  it('rejects non-https portrait_gpt2 reference URLs', () => {
    const parsed = PortraitGpt2ToolInputSchema.safeParse({
      description: '30-year-old woman in soft home window light',
      reference_photo_url: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects private/internal portrait_gpt2 reference URLs', () => {
    const parsed = PortraitGpt2ToolInputSchema.safeParse({
      description: '30-year-old woman in soft home window light',
      reference_photo_url: 'https://169.254.169.254/latest/meta-data/',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 private portrait_gpt2 reference URLs', () => {
    const parsed = PortraitGpt2ToolInputSchema.safeParse({
      description: '30-year-old woman in soft home window light',
      reference_photo_url: 'https://[::ffff:169.254.169.254]/latest/meta-data/',
    });
    expect(parsed.success).toBe(false);
  });

  it('allows public https CDN hostnames for portrait_gpt2 reference URLs', () => {
    const parsed = PortraitGpt2ToolInputSchema.safeParse({
      description: '30-year-old woman in soft home window light',
      reference_photo_url: 'https://fcdn.example.com/photo.jpg',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects 0.0.0.0 portrait_gpt2 reference URLs', () => {
    const parsed = PortraitGpt2ToolInputSchema.safeParse({
      description: '30-year-old woman in soft home window light',
      reference_photo_url: 'https://0.0.0.0/photo.jpg',
    });
    expect(parsed.success).toBe(false);
  });

  it('publishes an https pattern for portrait_gpt2 reference URL schemas', () => {
    const generated = generateV1ToolContractSchemas();
    const ref = (generated.portrait_gpt2?.input as any).properties.reference_photo_url;
    expect(ref.pattern).toBe('^https:\\/\\/');
  });
});
