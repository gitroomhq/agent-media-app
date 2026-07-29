// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// C1: `GET /v2/characters` must only surface USABLE characters — it must apply
// the `portrait_url IS NOT NULL` filter so legacy/partial rows (which the
// public_id backfill made addressable) never appear as usable.

import { describe, it, expect, vi } from 'vitest';

/** Chainable Supabase query-builder stub that records `.not()` filter calls and
 *  resolves (thenable terminal) to the seeded rows. */
function makeQuery(rows: unknown[]) {
  const notCalls: unknown[][] = [];
  const qb: Record<string, unknown> = {};
  const chain = () => qb;
  Object.assign(qb, {
    _notCalls: notCalls,
    select: vi.fn(chain),
    eq: vi.fn(chain),
    is: vi.fn(chain),
    not: vi.fn((...args: unknown[]) => {
      notCalls.push(args);
      return qb;
    }),
    order: vi.fn(chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  });
  return qb;
}

const ROWS = [
  {
    public_id: 'char_good', name: 'Has Portrait', description: 'ok',
    portrait_url: 'https://r2/p.png', voice_brief: null, preset_default: null,
    created_at: '2026-06-01T00:00:00Z',
  },
];

const query = makeQuery(ROWS);
const fromSpy = vi.fn(() => query);
vi.mock('../server.js', () => ({ supabase: { from: fromSpy } }));

const { listCharactersRoute } = await import('../routes/v2/characters.js');

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.body = b; return res; },
  };
  return res;
}

describe('C1: character list filters out broken/partial characters', () => {
  it('applies IS NOT NULL on both public_id and portrait_url', async () => {
    const res = mockRes();
    await listCharactersRoute({ userId: 'user-1' } as never, res as never);

    expect(fromSpy).toHaveBeenCalledWith('user_characters');
    // The route must exclude rows with no public_id AND rows with no portrait.
    expect(query._notCalls as unknown[][]).toContainEqual(['public_id', 'is', null]);
    expect(query._notCalls as unknown[][]).toContainEqual(['portrait_url', 'is', null]);
  });

  it('maps DB rows to the CLI-facing shape', async () => {
    const res = mockRes();
    await listCharactersRoute({ userId: 'user-1' } as never, res as never);
    const body = res.body as { characters: Array<{ character_id: string; display_name: string; portrait_url: string }> };
    expect(res.statusCode).toBe(200);
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0].character_id).toBe('char_good');
    expect(body.characters[0].display_name).toBe('Has Portrait');
    expect(body.characters[0].portrait_url).toBe('https://r2/p.png');
  });
});
