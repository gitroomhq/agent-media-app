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
