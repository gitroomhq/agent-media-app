// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// The v1 UGC pipeline (ugc_video, saas_review and its product_review alias)
// rendered its talking head on a Kling model that Kling discontinued on
// 2026-09-21 (code 1203). It is retired: every entry point answers 410 with
// the replacement, creates no job and touches no credits.

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATOR_IDS, RETIRED_GENERATORS } from '@agentmedia/schema';

const insert = vi.fn();
vi.mock('../server.js', () => ({ supabase: { from: () => ({ insert }) } }));
vi.mock('../queue.js', () => ({ USE_DURABLE_QUEUE: false, enqueueDispatch: vi.fn() }));

const { generateRoute } = await import('../routes/generate.js');

function call(generatorId: string) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const req = { params: { generatorId }, body: { script: 'hello' }, userId: 'u1', authToken: 't' } as any;
  const res = { status, json } as any;
  return generateRoute(req, res).then(() => ({ status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] }));
}

describe('retired v1 generators', () => {
  it('ugc_video, saas_review and product_review are retired with selfie as the replacement', () => {
    expect(Object.keys(RETIRED_GENERATORS).sort()).toEqual(['product_review', 'saas_review', 'ugc_video']);
    for (const r of Object.values(RETIRED_GENERATORS)) expect(r.replacement).toBe('selfie');
    for (const id of Object.keys(RETIRED_GENERATORS)) expect(GENERATOR_IDS).not.toContain(id);
  });

  it.each(['ugc_video', 'saas_review', 'product_review'])('%s answers 410 without creating a job', async (id) => {
    insert.mockClear();
    const { status, body } = await call(id);
    expect(status).toBe(410);
    expect(body.error.code).toBe('GENERATOR_RETIRED');
    expect(body.error.replacement).toBe('selfie');
    expect(body.error.message).toContain('agent-media selfie');
    expect(insert).not.toHaveBeenCalled();
  });

  it('the CLI compatibility path /functions/v1/ugc-video goes through the same gate', () => {
    const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../server.ts'), 'utf8');
    expect(server).toMatch(/app\.post\('\/functions\/v1\/ugc-video'[\s\S]*?generatorId: 'ugc_video'[\s\S]*?generateRoute\(req, res\)/);
  });
});
