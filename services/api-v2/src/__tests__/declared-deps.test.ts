// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Guards against the class of bug that took api-v2 down on 2026-07-26.
 *
 * A bare `import x from 'pkg'` resolved fine locally because pnpm had a HOISTED
 * transitive copy in the workspace root — `require.resolve('cors')` succeeded,
 * `tsc` passed, and every test went green. But the production image installs
 * only DECLARED dependencies, so the container crash-looped on boot with
 * ERR_MODULE_NOT_FOUND and every endpoint 502'd.
 *
 * Nothing in the existing pipeline could catch that: type-checking resolves
 * against node_modules, and unit tests run in the same hoisted workspace. This
 * test closes the gap by asserting every bare import in src/ is listed in this
 * package's own package.json.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** `@scope/name/deep/path` → `@scope/name`; `pkg/sub` → `pkg`. */
function packageNameOf(specifier: string): string {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

describe('runtime dependencies are declared', () => {
  it('every bare import in src/ is in package.json (not just hoisted in the workspace)', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);

    const offenders: string[] = [];
    for (const file of walk(join(pkgRoot, 'src'))) {
      const src = readFileSync(file, 'utf8');
      // Static `import ... from 'x'` and bare side-effect `import 'x'`.
      const specifiers = [
        ...[...src.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
        ...[...src.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
      ];
      for (const spec of specifiers) {
        // Relative imports and node: builtins are always fine.
        if (spec.startsWith('.') || spec.startsWith('node:')) continue;
        const name = packageNameOf(spec);
        if (!declared.has(name)) {
          offenders.push(`${file.replace(pkgRoot + '/', '')} → '${spec}'`);
        }
      }
    }

    expect(
      offenders,
      `Undeclared imports would crash the production image on boot:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
