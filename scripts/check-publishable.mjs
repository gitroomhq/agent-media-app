#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Fail the build if a package we publish to npm cannot be installed from npm.
 *
 * WHY. @agentmedia/mcp-server@0.7.6 and @agentmedia/sdk@0.5.4 were published
 * carrying `"@agentmedia/schema": "workspace:*"`. `workspace:` is a pnpm
 * protocol; npm has no idea what it means, so every consumer got:
 *
 *     npm error code EUNSUPPORTEDPROTOCOL
 *     npm error Unsupported URL Type "workspace:": workspace:*
 *
 * That broke the exact `npx -y -p @agentmedia/mcp-server@latest agent-media-mcp`
 * command printed on /mcp, in every `claude mcp add` snippet, and in the docs —
 * for everyone, silently, until someone tried a clean install. `pnpm publish`
 * rewrites `workspace:` specs on pack; `npm publish` does not, and that is how
 * it escaped.
 *
 * This checks the manifests, so it catches the mistake at commit time rather
 * than after a version is burned on the registry (npm versions are immutable —
 * the only fix is publishing another one).
 *
 * A package counts as published unless it is marked `"private": true`.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WORKSPACE_DIRS = ['packages', 'apps', 'services'];

/** Dependency fields that end up in the published tarball's manifest. */
const PUBLISHED_DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

/** Specs npm cannot resolve from the public registry. */
const BAD_SPEC = /^(workspace:|link:|file:)/;

function manifests() {
  const out = [];
  for (const dir of WORKSPACE_DIRS) {
    const base = join(ROOT, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const pkgDir = join(base, name);
      if (!statSync(pkgDir).isDirectory()) continue;
      const pkgJson = join(pkgDir, 'package.json');
      if (!existsSync(pkgJson)) continue;
      out.push({ path: pkgJson, json: JSON.parse(readFileSync(pkgJson, 'utf8')) });
    }
  }
  return out;
}

const problems = [];

for (const { path, json } of manifests()) {
  if (json.private === true) continue; // not published, workspace: is fine
  const where = relative(ROOT, path);

  for (const field of PUBLISHED_DEP_FIELDS) {
    for (const [dep, spec] of Object.entries(json[field] ?? {})) {
      if (typeof spec === 'string' && BAD_SPEC.test(spec)) {
        problems.push(
          `${where}: ${field}.${dep} is "${spec}" — npm cannot resolve this. ` +
            `Pin the published version instead (e.g. "^${json.version}"-style range).`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error('\nPublishable packages carry specs npm cannot install:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    '\nMark the package "private": true if it is not meant for npm, otherwise\n' +
      'replace the spec with a registry range. See the header of this script for\n' +
      'what happened the last time this shipped.\n',
  );
  process.exit(1);
}

console.log('publishable packages: no workspace:/link:/file: specs in published deps');
