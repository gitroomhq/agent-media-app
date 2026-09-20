// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));
const { buildMcpServer } = await import('../routes/mcp.js');
afterEach(() => vi.restoreAllMocks());
async function call(name: string) {
  const server = buildMcpServer('test-account-key');
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientT);
  try { return await client.callTool({ name, arguments: {} }); }
  finally { await client.close(); await server.close(); }
}
describe('account discovery and cached connector compatibility', () => {
  it.each(['get_account', 'list_models'])('%s includes the authenticated balance without writing', async name => {
    const account = { authenticated: true, credits: { total: 17 }, generation: { status: 'quote_required' } };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-account-key');
      return new Response(JSON.stringify(String(url).includes('/me/readiness') ? account : { models: [] }), { status: 200 });
    });
    const result = await call(name);
    expect(JSON.stringify(result)).toContain('"total":17');
    expect(result.isError).not.toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/v1/me/readiness'))).toBe(true);
  });
  it.each([401, 503])('reports HTTP %s account failure explicitly', async status => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }));
    const result = await call('get_account');
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ status: status === 401 ? 'authentication_required' : 'unavailable' });
    expect(result.structuredContent).not.toHaveProperty('credits');
  });
  it('preserves the model catalog when the account lookup fails without inventing a balance', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(String(url).includes('/me/readiness') ? {} : { models: [] }), { status: String(url).includes('/me/readiness') ? 503 : 200 }));
    const result = await call('list_models');
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ account: { status: 'unavailable' } });
  });
});
