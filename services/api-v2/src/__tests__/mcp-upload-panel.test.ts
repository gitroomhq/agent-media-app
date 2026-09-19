// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function connect(enabled: boolean) {
  vi.stubEnv('TEMP_UPLOADS_ENABLED', String(enabled));
  const { buildMcpServer } = await import('../routes/mcp.js');
  const server = buildMcpServer('ma_fixture');
  const client = new Client({ name: 'upload-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}
describe('MCP upload panel', () => {
  it('advertises an MCP Apps resource and returns a useful browser fallback without exposing an account credential', async () => {
    const session = await connect(true);
    try {
      const tools = (await session.client.listTools()).tools;
      expect(session.client.getInstructions()).toContain('open_upload_panel');
      expect(session.client.getInstructions()).toContain('wait for the user to finish');
      for (const name of ['generate_image', 'generate_video', 'upload_image']) {
        expect(tools.find((tool) => tool.name === name)?.description).toContain('open_upload_panel');
        expect(tools.find((tool) => tool.name === name)?.description).toContain('24 hours');
      }
      expect(tools.find((t) => t.name === 'open_upload_panel')?._meta).toMatchObject({
        ui: { resourceUri: 'ui://agent-media/image-upload-v1.html' },
      });
      const resources = await session.client.listResources();
      expect(resources.resources).toHaveLength(1);
      const resource = await session.client.readResource({ uri: resources.resources[0].uri });
      expect(resource.contents[0].mimeType).toBe('text/html;profile=mcp-app');
      expect('text' in resource.contents[0] && resource.contents[0].text).toContain(
        'Drop images here or browse',
      );
      expect('text' in resource.contents[0] && resource.contents[0].text).toContain(
        'window.__UPLOAD_CONFIG__ = {"apiBase":',
      );
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              session_id: '11111111-1111-1111-1111-111111111111',
              upload_token: 'panel-only',
              upload_url: 'https://example.test/upload#session=fixture',
              images: [],
              expires_at: '2026-09-20T00:00:00Z',
            }),
            { status: 201 },
          ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const result = await session.client.callTool({ name: 'open_upload_panel', arguments: {} });
      expect(result.structuredContent).not.toHaveProperty('upload_token');
      expect(result._meta).toMatchObject({ upload_token: 'panel-only' });
      expect(JSON.stringify(result)).toContain('https://example.test/upload#session=fixture');
      expect(JSON.stringify(result)).not.toContain('ma_fixture');
      expect(fetchMock.mock.calls).toHaveLength(1);
      await session.client.callTool({
        name: 'get_uploads',
        arguments: { session_id: '11111111-1111-1111-1111-111111111111' },
      });
      expect(fetchMock.mock.calls).toHaveLength(2);
    } finally {
      await session.close();
    }
  });
  it('does not advertise unconfigured upload tools', async () => {
    const session = await connect(false);
    try {
      expect((await session.client.listTools()).tools.map((t) => t.name)).not.toContain(
        'open_upload_panel',
      );
      expect((await session.client.listResources()).resources).toEqual([]);
    } finally {
      await session.close();
    }
  });
});


describe('cached connector catalogs', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  it('opens and retrieves a panel using only the existing upload_image schema', async () => {
    const session = await connect(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      session_id: id, upload_token: 'panel-only',
      upload_url: 'https://example.test/upload#session=fixture', images: [],
      expires_at: '2026-09-20T00:00:00Z',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const opened = await session.client.callTool({ name: 'upload_image', arguments: {} });
      expect(opened.isError).not.toBe(true);
      expect(opened.structuredContent).toMatchObject({ upload_key: `panel:${id}` });
      expect(opened.structuredContent).not.toHaveProperty('upload_token');
      expect(JSON.stringify(opened.content)).toContain('call upload_image');
      expect(fetchMock.mock.calls[0]).toEqual([
        expect.stringMatching(/\/v1\/upload-sessions$/),
        expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer ma_fixture' } }),
      ]);
      await session.client.callTool({ name: 'upload_image', arguments: { upload_key: `panel:${id}` } });
      expect(fetchMock.mock.calls[1]).toEqual([
        expect.stringContaining(`/v1/upload-sessions/${id}`),
        expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer ma_fixture' } }),
      ]);
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'UPLOAD_EXPIRED', message: 'These images expired.' } }), { status: 410 }));
      const expired = await session.client.callTool({ name: 'upload_image', arguments: { upload_key: `panel:${id}` } });
      expect(expired.isError).toBe(true);
      expect(JSON.stringify(expired.content)).toContain('expired');
    } finally { await session.close(); }
  });
  it('rejects malformed panel keys and mixed inputs without a backend request', async () => {
    const session = await connect(true);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    try {
      for (const args of [{ upload_key: 'panel:../../other' }, { upload_key: `panel:${id}`, file_bytes: 50 }]) {
        const result = await session.client.callTool({ name: 'upload_image', arguments: args });
        expect(result.isError).toBe(true);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
  it('preserves the ordinary file confirmation path', async () => {
    const session = await connect(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ image_url: 'https://example.test/image.png' })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await session.client.callTool({ name: 'upload_image', arguments: { upload_key: 'uploads/existing-file.png' } });
      expect((result.structuredContent as Record<string, unknown> | undefined)?.generation_handoff).toMatchObject({
        ready: true, input_examples: [
          { tool: 'generate_image', arguments: { refs: ['https://example.test/image.png'] } },
          { tool: 'generate_video', arguments: { refs: ['https://example.test/image.png'] } },
          { tool: 'generate_video', arguments: { first_frame: 'https://example.test/image.png' } },
        ],
      });
      expect(JSON.stringify(result.content)).toContain('continue that request');
      expect(fetchMock.mock.calls[0]).toEqual([
        expect.stringMatching(/\/v1\/uploads\/confirm$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ upload_key: 'uploads/existing-file.png' }) }),
      ]);
    } finally { await session.close(); }
  });
  it('teaches cached clients the compatibility workflow through list_models', async () => {
    const session = await connect(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [] }))));
    try {
      const result = await session.client.callTool({ name: 'list_models', arguments: {} });
      expect(JSON.stringify(result.content)).toContain('call upload_image with {}');
    } finally { await session.close(); }
  });
  it('keeps panel creation disabled when temporary uploads are disabled', async () => {
    const session = await connect(false);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await session.client.callTool({ name: 'upload_image', arguments: {} });
      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });
});

describe('uploaded references reach generation', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  const urls = ['https://example.test/product.png?token=exact-a', 'https://example.test/person.png?token=exact-b'];
  it.each(['get_uploads', 'upload_image'])('returns actionable multi-image inputs through %s, even with a cached catalog', async (name) => {
    const session = await connect(true);
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes('/upload-sessions/')
        ? { session_id: id, images: urls.map((image_url, i) => ({ image_url, filename: `${i}.png` })), expires_at: '2026-09-20T00:00:00Z' }
        : { job_id: 'fixture-job', status: 'submitted', model: 'fixture', credits_deducted: 20 },
    )));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await session.client.callTool({ name, arguments: name === 'get_uploads' ? { session_id: id } : { upload_key: `panel:${id}` } });
      const handoff = (result.structuredContent as Record<string, unknown> | undefined)?.generation_handoff as { ready: boolean; next_step: string; input_examples: Array<{ tool: string; arguments: { refs: string[] } }> };
      expect(handoff.ready).toBe(true);
      expect(handoff.input_examples[0].arguments.refs).toEqual(urls);
      expect(handoff.input_examples[1].arguments.refs).toEqual(urls);
      expect(handoff.input_examples.map(example => example.tool)).toEqual(['generate_image', 'generate_video']);
      expect(handoff.next_step).toContain('continue that request');
      expect(handoff.next_step).toContain('upload-only');
      expect(JSON.stringify(result.content)).toContain('NEXT STEP:');
      // Following the returned example must carry the exact references to the API.
      await session.client.callTool({ name: 'generate_image', arguments: { prompt: 'Place the product beside the person', ...handoff.input_examples[0].arguments, request_id: 'fixture-reference-request' } });
      const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ prompt: 'Place the product beside the person', refs: urls });
    } finally { await session.close(); }
  });
  it('does not suggest generation inputs when no images are ready', async () => {
    const session = await connect(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ session_id: id, images: [] }))));
    try {
      const result = await session.client.callTool({ name: 'get_uploads', arguments: { session_id: id } });
      expect((result.structuredContent as Record<string, unknown> | undefined)?.generation_handoff).toMatchObject({ ready: false });
      expect((result.structuredContent as Record<string, unknown> | undefined)?.generation_handoff).not.toHaveProperty('input_examples');
      expect(JSON.stringify(result.content)).toContain('Do not start the reference-dependent generation');
    } finally { await session.close(); }
  });
});
