#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Refresh the fact table in every docs/models/<id>.md from V2_MODELS.
 *
 * Each page is two halves: the fact table (kind, tier, status, provider,
 * limits, cost, price, verified) which MUST equal the catalog, and the
 * hand-written prose below it (usage notes, how to select) which a human
 * owns. This script rewrites only the table, so the numbers can never
 * drift from the code while the notes stay editable. A missing page is
 * created with an empty notes section.
 *
 * Run: pnpm --filter @agentmedia/schema gen:model-docs
 * CI:  the models-catalog test asserts every page's table is current.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V2_MODELS, type V2ModelRecord } from '../src/v2/index.js';
import { factTable, refreshPage } from '../src/v2/model-docs.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function newPage(m: V2ModelRecord): string {
  return [
    `# ${m.id}`,
    '',
    '> Generated facts come from `packages/schema/src/v2/models.ts`. Edit numbers there, not here.',
    '',
    '_No notes yet._',
    '',
    factTable(m),
    '',
    '## Best for',
    '',
    ...m.bestFor.map((b) => `- ${b}`),
    '',
    '## Avoid for',
    '',
    ...(m.avoidFor.length ? m.avoidFor.map((b) => `- ${b}`) : ['- –']),
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let changed = 0;
  for (const m of Object.values(V2_MODELS)) {
    const path = resolve(ROOT, m.docs);
    const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
    const after = before ? refreshPage(before, m) : newPage(m);
    if (after !== before) {
      writeFileSync(path, after);
      changed += 1;
    }
  }
  console.log(`model docs: ${changed} page(s) refreshed`);
}
