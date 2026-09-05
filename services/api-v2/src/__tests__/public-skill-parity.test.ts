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
import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../server.js', () => ({ supabase: {} }));
vi.mock('../routes/v1/primitives.js', () => ({ isPrimitivesRouteEnabled: () => true }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PACK = join(ROOT, 'public-skill');
const read = (rel: string) => readFileSync(join(PACK, rel), 'utf8');

async function liveTools() {
  delete process.env.AGENT_SURFACE;
  vi.resetModules();
  const { buildMcpServer } = await import('../routes/mcp.js');
  const server = buildMcpServer('ma_test');
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  return (await client.listTools()).tools;
}

describe('public skill pack == hosted connector', () => {
  it('SKILL.md allowed-tools is exactly tools/list', async () => {
    const tools = (await liveTools()).map((t) => t.name).sort();
    const skill = read('skills/agent-media/SKILL.md');
    const fm = skill.match(/^allowed-tools: \[(.*)\]$/m)![1];
    const allowed = [...fm.matchAll(/'mcp__agent-media__([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(allowed).toEqual(tools);
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
    const tools = new Set((await liveTools()).map((t) => t.name));
    const files = ['README.md', 'skills/agent-media/SKILL.md', 'reference/recipes.md', 'reference/prompting.md', 'reference/models.md'];
    const known = new Set([...tools, 'make_ugc', 'make_subtitles', 'social_connect', 'social_channels', 'social_publish']);
    for (const f of files) {
      const names = [...read(f).matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]).filter((n) => /^(generate|list|get|upload|quote|create|make|social)_/.test(n));
      for (const n of names) expect(known.has(n), `${f} mentions ${n}`).toBe(true);
      // The fixed names may appear only as "REST still exists" notes, never as MCP tools to call.
      for (const fixed of ['make_ugc', 'make_subtitles']) {
        const hits = read(f).split('`' + fixed + '`').length - 1;
        if (hits) expect(read(f)).toMatch(new RegExp(`REST[^\\n]*\`${fixed}\`|\`${fixed}\`[^\\n]*REST`));
      }
    }
  });

  it('the plugin manifest names the loose surface and version 2', () => {
    const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
    expect(plugin.version).toBe('2.0.0');
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
