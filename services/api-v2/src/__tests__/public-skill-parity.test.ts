// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The drift gate. The public skill pack is what an agent reads; tools/list
 * is what it gets. They are generated from the same objects, and this
 * test proves the generated files on disk still match the server that
 * ships — so a code change without `pnpm --filter api-v2 gen:public-skill`
 * fails here, not in an agent's session.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PACK = join(ROOT, 'public-skill');
const read = (rel: string) => readFileSync(join(PACK, rel), 'utf8');

afterEach(() => vi.unstubAllEnvs());

async function liveTools(uploads = true) {
  vi.stubEnv('AGENT_SURFACE', 'loose');
  vi.stubEnv('MAKE_UGC_ENABLED', 'true');
  vi.stubEnv('TEMP_UPLOADS_ENABLED', String(uploads));
  vi.resetModules();
  const { buildMcpServer } = await import('../routes/mcp.js');
  const server = buildMcpServer('ma_test');
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

describe('public skill pack == hosted connector', () => {
  it('SKILL.md allowed-tools matches tools/list with optional uploads enabled', async () => {
    const tools = (await liveTools()).map((t) => t.name).sort();
    const skill = read('skills/agent-media/SKILL.md');
    const fm = skill.match(/^allowed-tools: \[(.*)\]$/m)![1];
    const allowed = [...fm.matchAll(/'mcp__agent-media__([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual(tools);
  });

  it('only the documented optional tools are absent when uploads are disabled', async () => {
    const enabled = (await liveTools(true)).map((t) => t.name);
    const disabled = new Set((await liveTools(false)).map((t) => t.name));
    expect(enabled.filter((name) => !disabled.has(name)).sort()).toEqual(['get_uploads', 'open_upload_panel']);
    expect(read('reference/tools.md')).toContain('only when temporary uploads are enabled');
  });

  it('reference/tools.md carries every tool with the exact live input schema', async () => {
    const tools = await liveTools();
    const doc = read('reference/tools.md');
    for (const t of tools) {
      const section = doc.split(`## ${t.name}\n`)[1]?.split('\n## ')[0];
      expect(section, `section for ${t.name}`).toBeTruthy();
      const json = section!.match(/```json\n([\s\S]*?)\n```/)![1];
      expect(JSON.parse(json), `${t.name} schema`).toEqual(t.inputSchema);
    }
  });

  it('the pack never mentions a tool the connector does not list', async () => {
    const live = await liveTools();
    const tools = new Set(live.map((t) => t.name));
    // Argument names are not tool names: `file_bytes` and `upload_key` are
    // fields of upload_image. Taking them from the live schemas keeps the
    // guard honest (an invented field still fails) without banning real ones.
    const fields = new Set(
      live.flatMap((t) => Object.keys(((t.inputSchema as { properties?: Record<string, unknown> })?.properties) ?? {})),
    );
    const files = ['README.md', 'skills/agent-media/SKILL.md', 'reference/recipes.md', 'reference/prompting.md', 'reference/models.md'];
    const known = new Set([...tools, ...fields, 'make_subtitles', 'social_connect', 'social_channels', 'social_publish']);
    for (const f of files) {
      const names = [...read(f).matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]).filter((n) => /^(generate|list|get|upload|quote|create|make|social)_/.test(n));
      for (const n of names) expect(known.has(n), `${f} mentions ${n}`).toBe(true);
      // REST-only names may appear only as "REST still exists" notes, never as MCP tools to call.
      for (const fixed of ['make_subtitles']) {
        const hits = read(f).split('`' + fixed + '`').length - 1;
        if (hits) expect(read(f)).toMatch(new RegExp(`REST[^\\n]*\`${fixed}\`|\`${fixed}\`[^\\n]*REST`));
      }
    }
  });

  it('the plugin manifest names the loose surface and version 2', () => {
    const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
    expect(plugin.version).toMatch(/^2\.\d+\.\d+$/);
    expect(read('skills/agent-media/SKILL.md')).toContain(`x-skill-version: '${plugin.version}'`);
    expect(plugin.description).toMatch(/generate_video/);
    expect(existsSync(join(PACK, 'skills/make-ugc'))).toBe(false);
  });

  it('the prompting page carries the worker rubric verbatim', () => {
    const realism = readFileSync(join(ROOT, 'services/media-worker-v2/src/v2/realism.js'), 'utf8');
    const rubric = realism.match(/export const REALISM_RUBRIC = `([\s\S]*?)`;/)![1].trim();
    expect(read('reference/prompting.md')).toContain(rubric);
    expect(read('skills/agent-media/SKILL.md')).toContain(rubric);
  });
});
