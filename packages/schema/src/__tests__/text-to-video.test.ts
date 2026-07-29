// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Validation tests for TextToVideoSchema — the pure-prompt generator
 * used by the "Use prompts" batch mode and the one-shot
 * POST /v1/generate/text_to_video endpoint.
 *
 * The schema is intentionally simple: prompt (20-1000 chars), duration
 * (5/10/15), aspect_ratio (9:16/16:9/1:1), generate_audio (default true).
 */

import { describe, it, expect } from 'vitest';
import { TextToVideoSchema, TEXT_TO_VIDEO_DURATIONS, TEXT_TO_VIDEO_RATIOS } from '../video.js';

const VALID_PROMPT = 'Handcrafted stylized stop-motion aesthetic with miniature practical sets, animation on 2s, warm magical lighting.';

describe('TextToVideoSchema', () => {
  it('accepts minimum valid input (prompt only — defaults fill in)', () => {
    const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.duration).toBe(10);
      expect(r.data.aspect_ratio).toBe('9:16');
      expect(r.data.generate_audio).toBe(true);
    }
  });

  it('rejects prompt shorter than 20 characters', () => {
    const r = TextToVideoSchema.safeParse({ prompt: 'too short' });
    expect(r.success).toBe(false);
  });

  it('rejects prompt longer than 1000 characters', () => {
    const r = TextToVideoSchema.safeParse({ prompt: 'A'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('accepts each supported duration', () => {
    for (const d of TEXT_TO_VIDEO_DURATIONS) {
      const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, duration: d });
      expect(r.success).toBe(true);
    }
  });

  it('rejects duration outside the allowed set', () => {
    const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, duration: 7 });
    expect(r.success).toBe(false);
  });

  it('accepts each supported aspect_ratio', () => {
    for (const a of TEXT_TO_VIDEO_RATIOS) {
      const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, aspect_ratio: a });
      expect(r.success).toBe(true);
    }
  });

  it('rejects unsupported aspect_ratio', () => {
    const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, aspect_ratio: '21:9' });
    expect(r.success).toBe(false);
  });

  it('accepts generate_audio=false', () => {
    const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, generate_audio: false });
    expect(r.success).toBe(true);
  });

  it('accepts a webhook_url that is HTTPS', () => {
    const r = TextToVideoSchema.safeParse({
      prompt: VALID_PROMPT,
      webhook_url: 'https://example.com/hook',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid webhook_url', () => {
    const r = TextToVideoSchema.safeParse({ prompt: VALID_PROMPT, webhook_url: 'not-a-url' });
    expect(r.success).toBe(false);
  });
});
