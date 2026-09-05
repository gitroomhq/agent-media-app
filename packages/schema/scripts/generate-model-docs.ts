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
import { V2_MODELS, V2_DEFAULT_MODEL, type V2ModelRecord } from '../src/v2/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const TABLE_START = '| | |';
export const TABLE_END_MARK = '| Verified |';

function price(m: V2ModelRecord): string {
  if (!m.credits) return 'none (candidate)';
  const std = `${m.credits.perUnit} credits per ${m.credits.unit}`;
  if (m.kind === 'image') return `${std} standalone (\`generate_image\`); included in the credits of the fixed video skills`;
  if (m.kind === 'audio') return `${m.credits.perUnit * 100} credit per 100 characters standalone (\`generate_audio\`), rounded up; included in the credits of the fixed skills`;
  return std;
}

function limits(m: V2ModelRecord): string {
  const l = m.limits;
  const parts = [
    l.minSeconds !== undefined || l.maxSeconds !== undefined ? `${l.minSeconds ?? '?'}–${l.maxSeconds ?? '?'} s` : null,
    l.aspect?.join(', ') ?? null,
    l.resolutions?.join(', ') ?? null,
    l.refs ? `refs: ${l.refs}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : '–';
}

export function factTable(m: V2ModelRecord): string {
  const isDefault = V2_DEFAULT_MODEL[m.kind] === m.id;
  return [
    '| | |',
    '|---|---|',
    `| Kind | ${m.kind}${isDefault ? ' (default for `generate_' + m.kind + '`)' : ''} |`,
    `| Tier | ${m.tier} |`,
    `| Status | **${m.status}** |`,
    `| Provider | ${m.provider} (\`${m.providerModel}\`) |`,
    `| Modes | ${m.modes.join(', ')} |`,
    `| Features | ${m.features.join(', ') || '–'} |`,
    `| Limits | ${limits(m)} |`,
    `| Our cost | $${m.cost.usd} per ${m.cost.unit}. ${m.cost.note} |`,
    `| User price | ${price(m)} |`,
    `| Quality / speed | ${m.quality} / ${m.speed} |`,
    `| Verified | ${m.verified ? `${m.verified.date}. ${m.verified.note ?? ''}${m.verified.runId ? ` (run ${m.verified.runId})` : ''}`.trim() : 'no recorded run yet'} |`,
  ].join('\n');
}

/** Replace the fact table in a page's markdown; returns the new text. Exported for the test. */
export function refreshPage(md: string, m: V2ModelRecord): string {
  const start = md.indexOf(TABLE_START);
  if (start < 0) throw new Error(`${m.id}: no fact table found`);
  const verifiedAt = md.indexOf(TABLE_END_MARK, start);
  if (verifiedAt < 0) throw new Error(`${m.id}: fact table has no Verified row`);
  const end = md.indexOf('\n', verifiedAt);
  return md.slice(0, start) + factTable(m) + md.slice(end);
}

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
