// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The generated part of a docs/models/<id>.md page, rendered from the
 * catalog: the fact table, the video modes table and the usage card.
 * Pure: no I/O. scripts/generate-model-docs.ts writes pages with it; the
 * models-catalog test asserts every page on disk still matches.
 *
 * What we pay providers is internal and never rendered here.
 */

import { V2_DEFAULT_MODEL } from './generate.js';
import { V2_VIDEO_QUALITIES, type V2ModelRecord, type V2VideoModeSpec } from './models.js';

export const TABLE_START = '| | |';
export const GENERATED_END = '<!-- /generated -->';

function price(m: V2ModelRecord): string {
  if (!m.credits) return 'none (candidate)';
  if (m.kind === 'video' && m.video?.creditsPerSecond) {
    return V2_VIDEO_QUALITIES.filter((q) => m.video!.creditsPerSecond![q] !== undefined)
      .map((q) => `${m.video!.creditsPerSecond![q]} credits/s at ${q}`)
      .join(', ') + '. Reference video seconds are billed at the same rate.';
  }
  const std = `${m.credits.perUnit} credits per ${m.credits.unit}`;
  if (m.kind === 'image') return `${std} (\`generate_image\`)`;
  if (m.kind === 'audio') return `${m.credits.perUnit * 100} credit per 100 characters (\`generate_audio\`), rounded up`;
  return std;
}

function limits(m: V2ModelRecord): string {
  if (m.kind === 'video' && m.video) {
    const secs = Object.values(m.video.modes).map((s) => s.seconds);
    const min = Math.min(...secs.map((s) => s[0]));
    const max = Math.max(...secs.map((s) => s[1]));
    return `${min} to ${max} s (per mode below); worker waits up to ${m.video.timeoutMinutes} min`;
  }
  const l = m.limits;
  const parts = [l.resolutions?.join(', ') ?? null, l.refsMax !== undefined ? `up to ${l.refsMax} refs` : null].filter(Boolean);
  return parts.length ? parts.join('; ') : '–';
}

function verifiedLine(v?: { date: string; runId?: string; note?: string }): string {
  if (!v) return 'no recorded run yet';
  return `${v.date}. ${v.note ?? ''}${v.runId ? ` (run ${v.runId})` : ''}`.trim();
}

function modeRow(mode: string, s: V2VideoModeSpec): string {
  const inputs =
    mode === 'text'
      ? 'prompt only'
      : mode === 'image'
        ? `first_frame${s.lastFrame ? ' (+ last_frame)' : ''}`
        : s.refs
          ? [s.refs.images ? `${s.refs.images} images` : null, s.refs.videos ? `${s.refs.videos} clips${s.refs.videoSecondsTotal ? ` (${s.refs.videoSecondsTotal} s total)` : ''}` : null, s.refs.audios ? `${s.refs.audios} audio${s.refs.audioSecondsTotal ? ` (${s.refs.audioSecondsTotal} s total)` : ''}` : null].filter(Boolean).join(', ')
          : '–';
  return `| ${mode} | \`${s.providerModel}\` | ${inputs} | ${s.seconds[0]} to ${s.seconds[1]} | ${s.aspects.join(', ')} (default ${s.aspectDefault}) | ${s.qualities.join(', ')} | ${s.seed ? 'yes' : 'no'} | ${verifiedLine(s.verified)} |`;
}

export function modesTable(m: V2ModelRecord): string {
  if (!m.video) return '';
  const rows = Object.entries(m.video.modes).map(([mode, s]) => modeRow(mode, s));
  const notes = Object.entries(m.video.modes).flatMap(([mode, s]) => [
    ...(s.promptSyntax ? [`- ${mode}: address references as ${s.promptSyntax}.`] : []),
    ...s.notes.map((n) => `- ${mode}: ${n}`),
  ]);
  return [
    '',
    '',
    '## Modes',
    '',
    'The mode is derived from the request: `first_frame` means image mode, `refs` / `video_refs` / `audio_refs` mean reference mode, neither means text mode.',
    '',
    '| Mode | Provider model | Inputs | Seconds | Aspect | Quality | Seed | Verified |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    ...(notes.length ? ['', ...notes] : []),
  ].join('\n');
}

export function usageCard(m: V2ModelRecord): string {
  if (!m.usage) return '';
  return [
    '',
    '',
    '## How to use it',
    '',
    `**Pick this when** ${m.usage.pickWhen}.`,
    '',
    `**Best for:** ${m.bestFor.join('; ')}.`,
    '',
    `**Avoid for:** ${m.avoidFor.join('; ') || '–'}.`,
    '',
    '**Prompting:**',
    '',
    ...m.usage.promptTips.map((t) => `- ${t}`),
    '',
    `**Latency:** ${m.usage.latency}.`,
  ].join('\n');
}

export function factTable(m: V2ModelRecord): string {
  const isDefault = V2_DEFAULT_MODEL[m.kind] === m.id;
  const verified = m.kind === 'video' && m.video ? Object.entries(m.video.modes).filter(([, s]) => s.verified).map(([mode]) => mode) : null;
  return [
    '| | |',
    '|---|---|',
    `| Kind | ${m.kind}${isDefault ? ' (default for `generate_' + m.kind + '`)' : ''} |`,
    `| Tier | ${m.tier} |`,
    `| Status | **${m.status}** |`,
    `| Provider | ${m.provider}${m.kind === 'video' ? '' : ` (\`${m.providerModel}\`)`} |`,
    `| Modes | ${m.modes.join(', ')} |`,
    `| Features | ${m.features.join(', ') || '–'} |`,
    `| Limits | ${limits(m)} |`,
    `| User price | ${price(m)} |`,
    `| Quality / speed | ${m.quality} / ${m.speed} |`,
    `| Verified | ${verified ? (verified.length ? `modes: ${verified.join(', ')} (see below)` : 'no recorded run yet') : verifiedLine(m.verified)} |`,
  ].join('\n');
}

/** Everything between the fact table start and the generated-end marker. */
export function generatedBlock(m: V2ModelRecord): string {
  return `${factTable(m)}${modesTable(m)}${usageCard(m)}\n${GENERATED_END}`;
}

/** Replace the generated block in a page's markdown; returns the new text. Exported for the test. */
export function refreshPage(md: string, m: V2ModelRecord): string {
  const start = md.indexOf(TABLE_START);
  if (start < 0) throw new Error(`${m.id}: no fact table found`);
  const endMark = md.indexOf(GENERATED_END, start);
  let end: number;
  if (endMark >= 0) {
    end = endMark + GENERATED_END.length;
  } else {
    // Legacy page: the table ended at its Verified row.
    const verifiedAt = md.indexOf('| Verified |', start);
    if (verifiedAt < 0) throw new Error(`${m.id}: fact table has no Verified row`);
    end = md.indexOf('\n', verifiedAt);
    if (end < 0) end = md.length;
  }
  return md.slice(0, start) + generatedBlock(m) + md.slice(end);
}
