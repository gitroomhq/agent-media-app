// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The fact table of a docs/models/<id>.md page, rendered from the catalog.
 * Pure: no I/O. scripts/generate-model-docs.ts writes pages with it; the
 * models-catalog test asserts every page on disk still matches.
 */

import { V2_DEFAULT_MODEL } from './generate.js';
import type { V2ModelRecord } from './models.js';

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

