// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The Cursor marketplace listing is a pair of generated manifests:
 * `/.cursor-plugin/marketplace.json` (the index, points at the plugin
 * directory) and `public-skill/.cursor-plugin/plugin.json` (the plugin).
 *
 * Cursor validates both against
 * https://cursor.com/schemas/cursor-plugin/{marketplace,plugin}.json with
 * `additionalProperties: false`, and every listed plugin is reviewed by a
 * human before it ships. A field the schema does not name, a name that is
 * not kebab-case, a `source` that does not exist, or an mcp.json that
 * points somewhere else are all delisting-grade mistakes that no other
 * test in this repo would catch: the pack generator would happily write
 * them and CI would stay green.
 *
 * So these assertions encode the parts of that schema we rely on, plus
 * the invariants Cursor's own validate-plugins.mjs checks (name match,
 * source exists, plugin.json present), offline.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string) => JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));

const KEBAB = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Every property Cursor's plugin schema allows. Anything else fails validation.
const PLUGIN_FIELDS = new Set([
  'name', 'displayName', 'description', 'version', 'minClientVersions', 'author', 'publisher',
  'homepage', 'repository', 'license', 'logo', 'keywords', 'category', 'tags',
  'commands', 'agents', 'skills', 'rules', 'hooks', 'variables', 'mcpServers',
]);
const MARKETPLACE_FIELDS = new Set(['name', 'owner', 'metadata', 'plugins']);
const ENTRY_FIELDS = new Set(['name', 'source', 'description', 'minClientVersions']);

describe('Cursor marketplace manifests', () => {
  const marketplace = read('.cursor-plugin/marketplace.json');
  const entry = marketplace.plugins[0];
  const plugin = read(`${entry.source}/.cursor-plugin/plugin.json`);

  it('the index names one plugin, in a directory that exists and carries a plugin manifest', () => {
    expect(Object.keys(marketplace).every((k) => MARKETPLACE_FIELDS.has(k))).toBe(true);
    expect(marketplace.plugins).toHaveLength(1);
    expect(Object.keys(entry).every((k) => ENTRY_FIELDS.has(k))).toBe(true);
    // Not './': the plugin lives in public-skill/, not at the monorepo root.
    expect(entry.source).toBe('public-skill');
    expect(entry.source.startsWith('/')).toBe(false);
    expect(entry.source.includes('..')).toBe(false);
    expect(existsSync(join(REPO_ROOT, entry.source, '.cursor-plugin/plugin.json'))).toBe(true);
    expect(entry.name).toBe(plugin.name);
  });

  it('the plugin manifest carries only fields the schema allows, in the shapes it demands', () => {
    const extra = Object.keys(plugin).filter((k) => !PLUGIN_FIELDS.has(k));
    expect(extra, `fields Cursor would reject: ${extra.join(', ')}`).toEqual([]);
    expect(plugin.name).toMatch(KEBAB);
    expect(plugin.version).toMatch(SEMVER);
    expect(plugin.minClientVersions.cursor).toMatch(SEMVER);
    expect(plugin.author.name).toBeTruthy();
    expect(Object.keys(plugin.author).every((k) => ['name', 'email'].includes(k))).toBe(true);
    expect(plugin.license).toBe('Apache-2.0');
    for (const url of [plugin.homepage, plugin.repository]) expect(url).toMatch(/^https:\/\//);
  });

  it('every path it points at is relative and really there', () => {
    const root = join(REPO_ROOT, entry.source);
    for (const p of [plugin.logo, plugin.skills, plugin.mcpServers]) {
      expect(p.startsWith('/'), `${p} is absolute`).toBe(false);
      expect(p.includes('..'), `${p} escapes the plugin`).toBe(false);
      expect(existsSync(join(root, p)), `${p} is missing`).toBe(true);
    }
    // The skill files themselves, not just the directory.
    const skills = readdirSync(join(root, 'skills'));
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) expect(existsSync(join(root, 'skills', s, 'SKILL.md')), `${s}/SKILL.md`).toBe(true);
    expect(existsSync(join(root, 'README.md'))).toBe(true);
    expect(existsSync(join(root, 'LICENSE'))).toBe(true);
    expect(existsSync(join(root, 'CHANGELOG.md'))).toBe(true);
  });

  it('installs the hosted connector, not a local process, and says so identically to the Claude manifest', () => {
    const mcp = read(`${entry.source}/mcp.json`);
    expect(mcp.mcpServers['agent-media']).toEqual({ type: 'http', url: 'https://api.agent-media.ai/mcp' });
    // Cursor reads mcp.json, Claude Code reads .mcp.json: same content, or the
    // two clients would connect to different servers.
    expect(mcp).toEqual(read(`${entry.source}/.mcp.json`));
  });

  it('keeps one version across both client manifests', () => {
    expect(plugin.version).toBe(read(`${entry.source}/.claude-plugin/plugin.json`).version);
  });

  it('the marketplace card text is short enough to read on the card', () => {
    expect(entry.description.length).toBeLessThanOrEqual(120);
    expect(plugin.description.length).toBeLessThanOrEqual(200);
    for (const t of [entry.description, plugin.description, marketplace.metadata.description]) {
      expect(t).not.toMatch(/[–—]/); // house style: no dashes
    }
  });
});
