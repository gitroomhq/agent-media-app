// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// LLM enrichment pass for pSEO pages. Generates a unique ~150-word intro and
// 2 extra FAQ items per page via the Claude API and writes them to
// seo/overrides/<locale>.json. The engine merges overrides at build time.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx seo/enrich.ts [--locale en] [--days 14] [--dry-run]
//
//   --locale   which locale to enrich (default: en)
//   --days     enrich pages publishing within the next N days (default: 14)
//   --dry-run  compose prompts and write nothing; prints what would be sent
//
// Run it ahead of the publish schedule (e.g. weekly, enriching the next 14
// days of pages). Pages without overrides fall back to template content, so
// this script is safe to run partially or not at all. Spot-check ~10% of
// output before committing — the overrides file is reviewed content, in git.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SPECS, buildPage, publishAt, type PageSpec } from './pseo-engine';
import { LOCALES } from './pseo-data';

const ROOT = dirname(fileURLToPath(import.meta.url));

interface Args {
  locale: string;
  days: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    locale: get('--locale') ?? 'en',
    days: Number(get('--days') ?? 14),
    dryRun: argv.includes('--dry-run'),
  };
}

function upcomingSpecs(days: number): PageSpec[] {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + days);
  return ALL_SPECS.filter((s) => publishAt(s) <= horizon);
}

function promptFor(spec: PageSpec, locale: string): string {
  const page = buildPage(spec.family, spec.slug, locale);
  if (!page) throw new Error(`page failed to build: ${spec.family}:${spec.slug}`);
  const language = LOCALES[locale].name;
  return [
    `You are writing for agent-media.ai (AgentMedia), an AI UGC video platform: realistic 9:16 UGC videos generated from one CLI command / API call / MCP tool, with auto-publishing to TikTok, Instagram, and YouTube. Plans from $39/mo.`,
    ``,
    `Page: "${page.h1}" (${page.path})`,
    `Current template intro: "${page.intro[0]}"`,
    ``,
    `Write in ${language}. Return STRICT JSON: {"intro": string, "extraFaqs": [{"q": string, "a": string}, {"q": string, "a": string}]}`,
    ``,
    `Requirements:`,
    `- intro: ~150 words, must NOT paraphrase the template intro. Open with a concrete, specific observation about this exact audience/format/platform (a cost, a timeframe, a workflow detail). No hype words ("revolutionary", "game-changing"). Mention AgentMedia once, naturally.`,
    `- extraFaqs: two questions this audience actually searches, not covered by: ${page.faqs.map((f) => f.q).join(' | ')}. Answers 2-3 sentences, specific, honest (concede limits where real).`,
  ].join('\n');
}

async function callClaude(prompt: string, apiKey: string): Promise<{ intro: string; extraFaqs: Array<{ q: string; a: string }> }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.find((b) => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`no JSON in response: ${text.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const { locale, days, dryRun } = parseArgs();
  if (!LOCALES[locale]) throw new Error(`unknown locale: ${locale}`);

  const outDir = join(ROOT, 'overrides');
  const outFile = join(outDir, `${locale}.json`);
  const existing: Record<string, unknown> = existsSync(outFile)
    ? JSON.parse(readFileSync(outFile, 'utf8'))
    : {};

  const targets = upcomingSpecs(days).filter((s) => !existing[`${s.family}:${s.slug}`]);
  console.log(`locale=${locale} horizon=${days}d pages_to_enrich=${targets.length} already_done=${Object.keys(existing).length}`);

  if (dryRun) {
    if (targets[0]) {
      console.log('\n--- sample prompt (first target) ---\n');
      console.log(promptFor(targets[0], locale));
    }
    console.log(`\n[dry-run] would write ${targets.length} overrides to ${outFile}`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set (use --dry-run to test without it)');

  mkdirSync(outDir, { recursive: true });
  let done = 0;
  for (const spec of targets) {
    const key = `${spec.family}:${spec.slug}`;
    try {
      existing[key] = await callClaude(promptFor(spec, locale), apiKey);
      done++;
      if (done % 10 === 0) {
        writeFileSync(outFile, JSON.stringify(existing, null, 1));
        console.log(`  ${done}/${targets.length} (checkpoint saved)`);
      }
    } catch (err) {
      console.error(`  FAIL ${key}: ${(err as Error).message}`);
    }
  }
  writeFileSync(outFile, JSON.stringify(existing, null, 1));
  console.log(`wrote ${done} new overrides → ${outFile} (total ${Object.keys(existing).length})`);
  console.log('Spot-check a 10% sample, then commit the overrides file.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
