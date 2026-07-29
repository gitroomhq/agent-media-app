// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Validation parity tests for the 3-step Content Machine character
 * pipeline schemas:
 *   - CharacterSheetSchema       (POST /v1/character/sheet-generate)
 *   - CharacterStoryboardSchema  (POST /v1/character/storyboard-generate)
 *   - StoryboardSuggestSchema    (POST /v1/character/storyboard-suggest)
 *   - CharacterVideoSchema       (POST /v1/generate/character_video)
 *
 * These exercise mutually-exclusive sources, length bounds, enum and
 * UUID validation, and default application — exactly the constraints
 * the api-v2 routes also enforce. If a route's schema diverges from
 * server-side validation in the future, this is where it gets caught
 * before shipping.
 */

import { describe, it, expect } from 'vitest';
import {
  CharacterSheetSchema,
  CharacterStoryboardSchema,
  StoryboardSuggestSchema,
  CharacterVideoSchema,
} from '../video.js';

const SHEET_URL = 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/x/character-sheet.png';
const STORYBOARD_URL = 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/x/storyboard.png';
const REF_URL = 'https://example.com/portrait.png';
const SESSION = '00000000-0000-4000-8000-000000000000';

// ── CharacterSheetSchema ─────────────────────────────────────────────────────

describe('CharacterSheetSchema', () => {
  it('accepts description-only', () => {
    const r = CharacterSheetSchema.safeParse({ description: 'Marco the chef' });
    expect(r.success).toBe(true);
  });

  it('accepts actor_slug-only', () => {
    const r = CharacterSheetSchema.safeParse({ actor_slug: 'mei' });
    expect(r.success).toBe(true);
  });

  it('accepts reference_image_url-only', () => {
    const r = CharacterSheetSchema.safeParse({ reference_image_url: REF_URL });
    expect(r.success).toBe(true);
  });

  it('accepts description + actor_slug (description adds context)', () => {
    const r = CharacterSheetSchema.safeParse({
      description: 'Marco the chef',
      actor_slug: 'mei',
    });
    expect(r.success).toBe(true);
  });

  it('accepts description + reference_image_url', () => {
    const r = CharacterSheetSchema.safeParse({
      description: 'Marco the chef',
      reference_image_url: REF_URL,
    });
    expect(r.success).toBe(true);
  });

  it('accepts session_id alongside any source', () => {
    const r = CharacterSheetSchema.safeParse({
      description: 'Marco',
      session_id: SESSION,
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty body (no source)', () => {
    const r = CharacterSheetSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects actor_slug + reference_image_url (mutex)', () => {
    const r = CharacterSheetSchema.safeParse({
      actor_slug: 'mei',
      reference_image_url: REF_URL,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/mutually exclusive/i);
    }
  });

  it('rejects description shorter than 3 chars', () => {
    const r = CharacterSheetSchema.safeParse({ description: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rejects description longer than 400 chars', () => {
    const r = CharacterSheetSchema.safeParse({ description: 'x'.repeat(401) });
    expect(r.success).toBe(false);
  });

  it('rejects non-URL reference_image_url', () => {
    const r = CharacterSheetSchema.safeParse({ reference_image_url: 'not-a-url' });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid session_id', () => {
    const r = CharacterSheetSchema.safeParse({ description: 'Marco', session_id: 'nope' });
    expect(r.success).toBe(false);
  });
});

// ── CharacterStoryboardSchema ────────────────────────────────────────────────

describe('CharacterStoryboardSchema', () => {
  const ok = (extra: Record<string, unknown>) => ({
    character_sheet_url: SHEET_URL,
    ...extra,
  });

  it('accepts beats[]', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      beats: ['walks in', 'takes a bite', 'thumbs up'],
    }));
    expect(r.success).toBe(true);
  });

  it('accepts script', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      script: 'Marco walks in, takes a bite, gives a thumbs up.',
    }));
    expect(r.success).toBe(true);
  });

  it('applies default ratio 9:16', () => {
    const r = CharacterStoryboardSchema.parse(ok({
      beats: ['a', 'bb', 'ccc'].map((s) => s.repeat(3)),
    }));
    expect(r.ratio).toBe('9:16');
  });

  it('accepts ratio overrides', () => {
    for (const ratio of ['9:16', '16:9', '1:1'] as const) {
      const r = CharacterStoryboardSchema.safeParse(ok({
        script: 'enough chars to pass min length',
        ratio,
      }));
      expect(r.success).toBe(true);
    }
  });

  it('rejects body with both beats and script (mutex)', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      beats: ['walks in', 'takes a bite', 'thumbs up'],
      script: 'a script over ten chars',
    }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/exactly one/i);
    }
  });

  it('rejects body with neither beats nor script', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({}));
    expect(r.success).toBe(false);
  });

  it('rejects beats with fewer than 3 entries', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({ beats: ['a', 'bb'] }));
    expect(r.success).toBe(false);
  });

  it('rejects beats with more than 10 entries', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      beats: Array.from({ length: 11 }, (_, i) => `beat ${i}`),
    }));
    expect(r.success).toBe(false);
  });

  it('rejects beat shorter than 3 chars', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      beats: ['ab', 'walks in', 'thumbs up'],
    }));
    expect(r.success).toBe(false);
  });

  it('rejects script shorter than 10 chars', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({ script: 'too short' }));
    expect(r.success).toBe(false);
  });

  it('rejects script longer than 1500 chars', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({ script: 'x'.repeat(1501) }));
    expect(r.success).toBe(false);
  });

  it('rejects bad ratio', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      script: 'a script over ten chars',
      ratio: '4:3',
    }));
    expect(r.success).toBe(false);
  });

  it('rejects missing character_sheet_url', () => {
    const r = CharacterStoryboardSchema.safeParse({
      script: 'a script over ten chars',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid session_id', () => {
    const r = CharacterStoryboardSchema.safeParse(ok({
      script: 'a script over ten chars',
      session_id: 'nope',
    }));
    expect(r.success).toBe(false);
  });
});

// ── StoryboardSuggestSchema ──────────────────────────────────────────────────

describe('StoryboardSuggestSchema', () => {
  it('accepts actor_slug only', () => {
    const r = StoryboardSuggestSchema.safeParse({ actor_slug: 'mei' });
    expect(r.success).toBe(true);
  });

  it('accepts character_description only', () => {
    const r = StoryboardSuggestSchema.safeParse({
      character_description: 'Marco the Italian chef',
    });
    expect(r.success).toBe(true);
  });

  it('applies default duration=10 and n_panels=6', () => {
    const r = StoryboardSuggestSchema.parse({ actor_slug: 'mei' });
    expect(r.duration).toBe(10);
    expect(r.n_panels).toBe(6);
  });

  it('accepts vibe + duration + n_panels overrides', () => {
    const r = StoryboardSuggestSchema.safeParse({
      actor_slug: 'mei', vibe: 'wholesome', duration: 5, n_panels: 4,
    });
    expect(r.success).toBe(true);
  });

  it('rejects both actor_slug and character_description (mutex)', () => {
    const r = StoryboardSuggestSchema.safeParse({
      actor_slug: 'mei', character_description: 'Marco',
    });
    expect(r.success).toBe(false);
  });

  it('rejects neither', () => {
    const r = StoryboardSuggestSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects character_description longer than 200 chars', () => {
    const r = StoryboardSuggestSchema.safeParse({
      character_description: 'x'.repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it('rejects duration not in {5, 10}', () => {
    const r = StoryboardSuggestSchema.safeParse({ actor_slug: 'mei', duration: 7 });
    expect(r.success).toBe(false);
  });

  it('rejects n_panels < 4', () => {
    const r = StoryboardSuggestSchema.safeParse({ actor_slug: 'mei', n_panels: 3 });
    expect(r.success).toBe(false);
  });

  it('rejects n_panels > 10', () => {
    const r = StoryboardSuggestSchema.safeParse({ actor_slug: 'mei', n_panels: 11 });
    expect(r.success).toBe(false);
  });
});

// ── CharacterVideoSchema ─────────────────────────────────────────────────────

describe('CharacterVideoSchema', () => {
  const minimal = {
    character_sheet_url: SHEET_URL,
    storyboard_url: STORYBOARD_URL,
  };

  it('accepts minimal body and applies defaults', () => {
    const r = CharacterVideoSchema.parse(minimal);
    expect(r.duration).toBe(10);
    expect(r.aspect_ratio).toBe('9:16');
    expect(r.generate_audio).toBe(true);
  });

  it('accepts full body', () => {
    const r = CharacterVideoSchema.safeParse({
      ...minimal,
      action_prompt: 'Scene: Marco in his Brooklyn kitchen at golden hour',
      duration: 5,
      aspect_ratio: '16:9',
      generate_audio: false,
      session_id: SESSION,
      webhook_url: 'https://hooks.example.com/cb',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing character_sheet_url', () => {
    const r = CharacterVideoSchema.safeParse({ storyboard_url: STORYBOARD_URL });
    expect(r.success).toBe(false);
  });

  it('rejects missing storyboard_url', () => {
    const r = CharacterVideoSchema.safeParse({ character_sheet_url: SHEET_URL });
    expect(r.success).toBe(false);
  });

  it('rejects non-URL character_sheet_url', () => {
    const r = CharacterVideoSchema.safeParse({
      character_sheet_url: 'not a url',
      storyboard_url: STORYBOARD_URL,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty action_prompt', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, action_prompt: '' });
    expect(r.success).toBe(false);
  });

  it('rejects action_prompt longer than 2000 chars', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, action_prompt: 'x'.repeat(2001) });
    expect(r.success).toBe(false);
  });

  it('rejects duration not in {5, 10}', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, duration: 7 });
    expect(r.success).toBe(false);
  });

  it('rejects bad aspect_ratio', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, aspect_ratio: '4:3' });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid session_id', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, session_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('rejects non-https webhook_url style invalid URL', () => {
    const r = CharacterVideoSchema.safeParse({ ...minimal, webhook_url: 'not a url' });
    expect(r.success).toBe(false);
  });
});
