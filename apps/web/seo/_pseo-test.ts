// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// pSEO engine smoke test. Run: npx tsx seo/_pseo-test.ts
// Prints inventory counts per family, the publish-ramp distribution, sample
// composed pages (best EN, how-to EN, how-to DE), and sitemap entry count.

import {
  ALL_SPECS,
  buildPage,
  hubGroups,
  pseoSitemapEntries,
  publishAt,
  publishedSpecs,
  specsPublishedOn,
} from './pseo-engine';
import { LOCALE_SLUGS } from './pseo-data';

const locales = LOCALE_SLUGS.length;
const byFamily = new Map<string, number>();
for (const s of ALL_SPECS) byFamily.set(s.family, (byFamily.get(s.family) ?? 0) + 1);
console.log(`masters=${ALL_SPECS.length} locales=${locales} total_pages=${ALL_SPECS.length * locales}`);
for (const [f, n] of byFamily) console.log(`  family=${f}: ${n} masters → ${n * locales} pages`);

const byDay = new Map<string, number>();
for (const s of ALL_SPECS) {
  const d = publishAt(s).toISOString().slice(0, 10);
  byDay.set(d, (byDay.get(d) ?? 0) + locales);
}
const days = [...byDay.entries()].sort();
console.log('publish schedule (first 16 days):');
for (const [d, n] of days.slice(0, 16)) console.log(`  ${d}  ${n}/day`);
console.log(`  ... last day: ${days[days.length - 1][0]}  (${days.length} publish days total)`);

console.log(`published as of now: ${publishedSpecs().length * locales} pages`);
console.log(`batch on 2026-07-01: ${specsPublishedOn(new Date('2026-07-01')).length * locales} pages`);

const p = buildPage('best', 'ai-ugc-video-generator-for-shopify', 'en');
if (!p) throw new Error('best EN sample failed');
console.log('\n--- best EN ---');
console.log('path:', p.path, '| title:', p.metaTitle);
console.log('table:', p.tableRows?.length, 'rows | faqs:', p.faqs.length, '| related:', p.related.length, '| alternates:', p.alternates.map((a) => a.hreflang).join(','));
console.log('related[0] (cross-family):', p.related[0]?.path);

const h = buildPage('how-to', 'product-demo-video-for-tiktok', 'en');
if (!h) throw new Error('how-to EN sample failed');
console.log('--- how-to EN ---');
console.log('path:', h.path, '| h1:', h.h1);
console.log('example block:', !!h.exampleScript, '| table:', h.tableRows ? 'yes' : 'no (correct)', '| faqs:', h.faqs.length);

const hd = buildPage('how-to', 'testimonial-video-for-beauty', 'de');
if (!hd) throw new Error('how-to DE sample failed');
console.log('--- how-to DE ---');
console.log('path:', hd.path, '| h1:', hd.h1);

const groups = hubGroups('how-to', new Date('2026-09-01'));
console.log(`\nhub /how-to (as of 2026-09-01): platform=${groups.platform.length} vertical=${groups.vertical.length}`);
console.log('sitemap entries now:', pseoSitemapEntries().length, '| on 2026-09-01:', pseoSitemapEntries(new Date('2026-09-01')).length);
console.log('OK');
