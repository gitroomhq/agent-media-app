// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function call(
  name = 'get_run_status',
  args: Record<string, unknown> = { run_id: 'existing-job' },
) {
  vi.stubEnv('AGENT_SURFACE', 'loose');
  const { buildMcpServer } = await import('../routes/mcp.js');
  const server = buildMcpServer('ma_test');
  const client = new Client({ name: 'recovery-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const result = await client.callTool({ name, arguments: args });
    return {
      isError: result.isError,
      text: (result.content as { text?: string }[]).map((c) => c.text ?? '').join('\n'),
    };
  } finally {
    await client.close();
    await server.close();
  }
}
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('MCP recovery guidance', () => {
  it.each([401, 403, 429, 503])(
    'preserves HTTP %s and never reports an unverified missing job',
    async (status) => {
      const fetch = vi.fn(async () =>
        response(status, { error: { message: 'Request unavailable' } }),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await call();
      expect(result.isError).toBe(true);
      expect(result.text).toContain(`Error (${status})`);
      expect(result.text).not.toContain('No run found');
      expect(result.text).toContain('same run_id');
      expect(result.text).toContain('Do not resubmit');
      expect(result.text).toMatch(
        status === 401 || status === 403 ? /Reconnect/ : /temporarily unavailable/,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('passes the server retry delay to the agent instead of probing again immediately', async () => {
    const fetch = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    vi.stubGlobal('fetch', fetch);
    expect((await call()).text).toContain('Wait at least 30 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not start another pipeline probe after the response budget is spent', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetch = vi.fn(async () => {
      now += 21_000;
      return response(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    expect((await call()).text).toContain('temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps network failures distinct from a missing job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection reset');
      }),
    );
    const result = await call();
    expect(result.text).toContain('temporarily unavailable');
    expect(result.text).not.toContain('No run found');
  });

  it('probes other pipelines after confirmed 404 responses and returns the existing output', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(
        response(200, { status: 'completed', output_url: 'https://example.com/done.mp4' }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await call();
    expect(result.isError).toBe(false);
    expect(result.text).toContain('https://example.com/done.mp4');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reports a missing job only when every pipeline returns 404', async () => {
    const fetch = vi.fn(async () => response(404, {}));
    vi.stubGlobal('fetch', fetch);
    expect((await call()).text).toContain('No run found');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('preserves nested validation paths and legacy flattened field messages', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            issues: [{ path: ['refs', 0], message: 'Use an https image URL' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        response(400, {
          error: 'invalid_input',
          detail: {
            fieldErrors: { model: ['Choose a live model'] },
            formErrors: ['Check the input'],
          },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await call('generate_image', { prompt: 'A product photo' })).text).toContain(
      'refs.0: Use an https image URL',
    );
    const legacy = await call('generate_image', { prompt: 'A product photo' });
    expect(legacy.text).toContain('model: Choose a live model');
    expect(legacy.text).toContain('Check the input');
  });

  it('does not tell an agent to blindly resubmit a generation after a lost response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );
    const result = await call('generate_video', { prompt: 'A person waving' });
    expect(result.text).toContain('Do not automatically resubmit');
    expect(result.text).toContain('dashboard');
    expect(result.text).not.toContain('otherwise submit again');
  });
});
