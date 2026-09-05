// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The loose surface, behaviourally: build the real MCP server, connect a
 * real client over an in-memory transport, and read tools/list under
 * both AGENT_SURFACE values. Then drive generate_* and quote through the
 * CallTool handler against a stubbed REST hop and check the forwarding
 * contract (path, body, bearer) and the agent-facing text.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));

const LOOSE = ['generate_video', 'generate_image', 'generate_audio', 'quote'];
const SHARED = ['list_characters', 'get_run_status', 'upload_image', 'list_models'];

async function connect(surface: string | undefined) {
  if (surface === undefined) delete process.env.AGENT_SURFACE;
  else process.env.AGENT_SURFACE = surface;
  vi.resetModules();
  const { buildMcpServer } = await import('../routes/mcp.js');
  const server = buildMcpServer('ma_test_key');
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientT);
  return { client, server };
}

describe('loose surface: tools/list', () => {
  const origEnv = { ...process.env };
  afterEach(() => { process.env = { ...origEnv }; vi.restoreAllMocks(); });

  it('is the default: only the three primitives + quote + the shared read tools', async () => {
    const { client } = await connect(undefined);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...LOOSE, ...SHARED].sort());
    expect(names).not.toContain('make_ugc');
    expect(names).not.toContain('create_character');
  });

  it('AGENT_SURFACE=fixed brings the recipe tools back and drops the primitives', async () => {
    process.env.MAKE_UGC_ENABLED = 'true';
    const { client } = await connect('fixed');
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of LOOSE) expect(names).not.toContain(n);
    expect(names).toContain('make_ugc');
    expect(names).toContain('create_character');
    for (const n of SHARED) expect(names).toContain(n);
  });

  it('every loose tool is annotated; generate_* are writes, quote is read-only', async () => {
    const { client } = await connect('loose');
    const tools = (await client.listTools()).tools;
    for (const n of LOOSE) {
      const t = tools.find((x) => x.name === n)!;
      expect(t.annotations?.title, n).toBeTruthy();
      expect(t.annotations?.readOnlyHint, n).toBe(n === 'quote');
    }
  });

  it('input schemas come from the shared zod schemas: model is a free string, refs are urls, no engine field', async () => {
    const { client } = await connect('loose');
    const tools = (await client.listTools()).tools;
    const video = tools.find((t) => t.name === 'generate_video')!.inputSchema as any;
    expect(video.properties.prompt).toBeTruthy();
    expect(video.properties.model.type).toBe('string');
    expect(video.properties.refs.items.format).toBe('uri');
    expect(video.properties.seconds.minimum).toBe(4);
    expect(video.properties.seconds.maximum).toBe(15);
    expect(video.properties.engine).toBeUndefined();
    expect(video.additionalProperties).toBe(false);
    const audio = tools.find((t) => t.name === 'generate_audio')!.inputSchema as any;
    expect(audio.properties.text).toBeTruthy();
    expect(audio.properties.voice).toBeTruthy();
  });

  it('tells the agent the model is its choice and where the recommendations are', async () => {
    const { client } = await connect('loose');
    const tools = (await client.listTools()).tools;
    const video = tools.find((t) => t.name === 'generate_video')!;
    expect(video.description).toMatch(/model YOU choose/);
    expect(video.description).toMatch(/list_models/);
    expect(video.description).toMatch(/seedance-2\.0/);
    expect(video.description).toMatch(/3x/);
    expect(video.description).toMatch(/get_run_status/);
    expect(video.description).toMatch(/upload_image/);
  });
});

describe('loose surface: tools/call forwarding', () => {
  const origEnv = { ...process.env };
  let calls: Array<{ url: string; init: any }>;
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      const isQuote = url.includes('/v2/quote/');
      const body = isQuote
        ? { kind: 'video', model: 'seedance-2.0', credits: 150, usd: 1.5, breakdown: '5s on seedance-2.0 at 30 credits/second' }
        : { job_id: 'job-1', status: 'submitted', kind: 'video', model: 'seedance-2.5', credits_deducted: 495, breakdown: '5s on seedance-2.5 at 99 credits/second' };
      return new Response(JSON.stringify(body), { status: isQuote ? 200 : 201, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => { process.env = { ...origEnv }; vi.unstubAllGlobals(); });

  it('generate_video → POST /v2/generate/video with the bearer and the arguments verbatim', async () => {
    const { client } = await connect('loose');
    const args = { prompt: 'a woman says "this serum changed my skin"', model: 'seedance-2.5', seconds: 5, refs: ['https://x/a.png'] };
    const r = await client.callTool({ name: 'generate_video', arguments: args });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/v2\/generate\/video$/);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer ma_test_key');
    expect(JSON.parse(calls[0].init.body)).toEqual(args);
    const text = (r.content as any)[0].text as string;
    expect(text).toMatch(/job-1/);
    expect(text).toMatch(/495 credits/);
    expect(text).toMatch(/get_run_status/);
    expect(r.isError).toBeFalsy();
  });

  it('quote → POST /v2/quote/:kind with the inner input, and says nothing was rendered', async () => {
    const { client } = await connect('loose');
    const r = await client.callTool({ name: 'quote', arguments: { kind: 'video', input: { prompt: 'x'.repeat(10), seconds: 5 } } });
    expect(calls[0].url).toMatch(/\/v2\/quote\/video$/);
    expect(JSON.parse(calls[0].init.body)).toEqual({ prompt: 'x'.repeat(10), seconds: 5 });
    const text = (r.content as any)[0].text as string;
    expect(text).toMatch(/150 credits/);
    expect(text).toMatch(/Nothing was rendered/);
  });

  it('a 400 from the API (e.g. a candidate model) reaches the agent with the issue text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: [{ path: ['model'], message: 'unknown or not-live video model "kling-o3". Live video models: seedance-2.0, seedance-2.5.' }] },
    }), { status: 400 })));
    const { client } = await connect('loose');
    const r = await client.callTool({ name: 'generate_video', arguments: { prompt: 'x'.repeat(10), model: 'kling-o3' } });
    expect(r.isError).toBe(true);
    expect((r.content as any)[0].text).toMatch(/Error \(400\)/);
  });

  it('on the fixed surface the loose tools are not callable', async () => {
    const { client } = await connect('fixed');
    const r = await client.callTool({ name: 'generate_video', arguments: { prompt: 'x'.repeat(10) } });
    expect(r.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
