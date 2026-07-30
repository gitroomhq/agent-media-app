// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// pSEO engine: expands facet data into page specs across template families,
// assigns a deterministic publish schedule (ramp: 20/day → 50/day → 100/day),
// and composes full page content at build time. No content files are stored —
// pages are pure functions of the data in pseo-data.ts (+ optional LLM
// overrides in seo/overrides/<locale>.json produced by seo/enrich.ts).
//
// Daily publishing = daily redeploy (Vercel cron → deploy hook). Each build
// statically generates only pages whose publishAt <= now, so every deploy
// releases that day's batch and the sitemap grows accordingly.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUDIENCES,
  COMPARISON_ROWS,
  FORMATS,
  HEAD_TERMS,
  LOCALES,
  LOCALE_SLUGS,
  PLATFORMS,
  VERTICALS,
  type LocaleStrings,
} from './pseo-data';

// ---------------------------------------------------------------------------
// Page specs
// ---------------------------------------------------------------------------

export type Family = 'best' | 'how-to';
export type TargetKind = 'vertical' | 'platform' | 'audience';

export interface PageSpec {
  family: Family;
  /** slug without locale/family prefix, e.g. "ai-ugc-video-generator-for-shopify" */
  slug: string;
  /** head term slug (best family) or format slug (how-to family) */
  subjectSlug: string;
  targetKind: TargetKind;
  targetSlug: string;
  /** 0-based index into the publish queue (master-level, across families) */
  queueIndex: number;
}

/** Launch date of the pSEO program. Day 0 of the publish schedule. */
export const PSEO_START = new Date('2026-06-15T00:00:00Z');

/** Ramp: first 7 days 20 pages/day, next 7 days 50/day, then 100/day. */
const RAMP: Array<{ days: number; perDay: number }> = [
  { days: 7, perDay: 20 },
  { days: 7, perDay: 50 },
  { days: Infinity, perDay: 100 },
];

const PAGES_PER_MASTER = LOCALE_SLUGS.length; // every master ships all locales same day

function expandMatrix(): PageSpec[] {
  const specs: PageSpec[] = [];
  let i = 0;
  const push = (family: Family, slug: string, subjectSlug: string, targetKind: TargetKind, targetSlug: string) =>
    specs.push({ family, slug, subjectSlug, targetKind, targetSlug, queueIndex: i++ });

  // Wave 1 — /best/: verticals (highest commercial intent), then platforms,
  // then audiences. Within each, head terms ordered by search volume.
  for (const target of VERTICALS) for (const term of HEAD_TERMS) push('best', `${term.slug}-for-${target.slug}`, term.slug, 'vertical', target.slug);
  for (const target of PLATFORMS) for (const term of HEAD_TERMS) push('best', `${term.slug}-for-${target.slug}`, term.slug, 'platform', target.slug);
  for (const target of AUDIENCES) for (const term of HEAD_TERMS) push('best', `${term.slug}-for-${target.slug}`, term.slug, 'audience', target.slug);

  // Wave 2 — /how-to/: formats × (platforms first — strongest search intent
  // for "how to make X for tiktok" — then verticals).
  for (const target of PLATFORMS) for (const f of FORMATS) push('how-to', `${f.slug}-for-${target.slug}`, f.slug, 'platform', target.slug);
  for (const target of VERTICALS) for (const f of FORMATS) push('how-to', `${f.slug}-for-${target.slug}`, f.slug, 'vertical', target.slug);

  return specs;
}

export const ALL_SPECS: PageSpec[] = expandMatrix();
const SPEC_BY_KEY = new Map(ALL_SPECS.map((s) => [`${s.family}:${s.slug}`, s]));

// ---------------------------------------------------------------------------
// Publish schedule
// ---------------------------------------------------------------------------

/** Day offset (0-based) on which a given master (by queue index) publishes. */
export function publishDayForMaster(queueIndex: number): number {
  let unitsBefore = queueIndex * PAGES_PER_MASTER;
  let day = 0;
  for (const phase of RAMP) {
    const phaseCapacity = phase.days * phase.perDay;
    if (unitsBefore < phaseCapacity) {
      return day + Math.floor(unitsBefore / phase.perDay);
    }
    unitsBefore -= phaseCapacity;
    day += phase.days;
  }
  return day;
}

export function publishAt(spec: PageSpec): Date {
  const d = new Date(PSEO_START);
  d.setUTCDate(d.getUTCDate() + publishDayForMaster(spec.queueIndex));
  return d;
}

export function isPublished(spec: PageSpec, now: Date = new Date()): boolean {
  return publishAt(spec) <= now;
}

/** Specs published as of `now` — used by generateStaticParams and sitemap. */
export function publishedSpecs(now: Date = new Date()): PageSpec[] {
  return ALL_SPECS.filter((s) => isPublished(s, now));
}

/** Specs whose publish date is exactly `date` (UTC) — used by IndexNow ping. */
export function specsPublishedOn(date: Date): PageSpec[] {
  const dayStr = date.toISOString().slice(0, 10);
  return ALL_SPECS.filter((s) => publishAt(s).toISOString().slice(0, 10) === dayStr);
}

// ---------------------------------------------------------------------------
// LLM enrichment overrides (optional, produced by seo/enrich.ts)
// ---------------------------------------------------------------------------

export interface PageOverride {
  intro?: string; // replaces intro[0]
  extraFaqs?: Array<{ q: string; a: string }>;
}

type OverrideMap = Record<string, PageOverride>; // key: `${family}:${slug}`

const overrideCache = new Map<string, OverrideMap>();

function overridesFor(locale: string): OverrideMap {
  const cached = overrideCache.get(locale);
  if (cached) return cached;
  let map: OverrideMap = {};
  try {
    map = JSON.parse(
      readFileSync(join(process.cwd(), 'seo', 'overrides', `${locale}.json`), 'utf8'),
    ) as OverrideMap;
  } catch {
    // no overrides generated yet — template content is used as-is
  }
  overrideCache.set(locale, map);
  return map;
}

// ---------------------------------------------------------------------------
// Content composition
// ---------------------------------------------------------------------------

export interface FaqItem {
  q: string;
  a: string;
}

export interface PageContent {
  spec: PageSpec;
  locale: string; // key into LOCALES
  hreflang: string;
  path: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  whyTitle: string;
  whyBullets: string[];
  compareTitle?: string;
  tableHeaders?: LocaleStrings['tableHeaders'];
  tableRows?: typeof COMPARISON_ROWS;
  exampleTitle?: string;
  exampleScript?: string;
  howTitle: string;
  steps: Array<{ title: string; command: string }>;
  faqTitle: string;
  faqs: FaqItem[];
  relatedTitle: string;
  related: Array<{ path: string; label: string }>;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  publishAtISO: string;
  alternates: Array<{ hreflang: string; path: string }>;
}

function targetData(spec: PageSpec): { name: string; bullets: string[]; script: string; scene: string; extra: string } {
  if (spec.targetKind === 'vertical') {
    const v = VERTICALS.find((x) => x.slug === spec.targetSlug)!;
    return { name: v.name, bullets: [...v.pains], script: v.exampleScript, scene: v.exampleScene, extra: v.hook };
  }
  if (spec.targetKind === 'platform') {
    const p = PLATFORMS.find((x) => x.slug === spec.targetSlug)!;
    return {
      name: p.name,
      bullets: [
        `${p.name} native format: ${p.aspect} — generated output matches without cropping`,
        `Optimal length: ${p.maxDuration}`,
        `Captions: ${p.captionNorm}; ad surface: ${p.adFormat}`,
      ],
      script: 'I keep getting asked how I post every single day — this is how',
      scene: 'casual selfie framing, natural light, talking directly to camera',
      extra: `publish straight to ${p.name} from one command`,
    };
  }
  const a = AUDIENCES.find((x) => x.slug === spec.targetSlug)!;
  return {
    name: a.name,
    bullets: [
      a.angle,
      'No creator sourcing, briefs, or revision cycles — output in minutes',
      'Web app for hands-on work; API, CLI, and MCP when you want it automated',
    ],
    script: 'Nobody believes this took me under a minute to make',
    scene: 'desk setting, confident delivery to camera',
    extra: 'creative volume without creative headcount',
  };
}

export function pathFor(spec: Pick<PageSpec, 'family' | 'slug'>, locale: string): string {
  const base = `/${spec.family}/${spec.slug}`;
  return locale === 'en' ? base : `/${locale}${base}`;
}

function selfieCommand(script: string, scene: string): string {
  return `agent-media selfie \\
  --description "25yo woman, warm smile, natural look" \\
  --script "${script}" \\
  --scene-action "${scene}" \\
  --duration 10`;
}

function relatedLinks(spec: PageSpec, locale: string, L: LocaleStrings): Array<{ path: string; label: string }> {
  const related: Array<{ path: string; label: string }> = [];
  const labelFor = (other: PageSpec): string => {
    const t = targetData(other);
    if (other.family === 'best') {
      const term = HEAD_TERMS.find((x) => x.slug === other.subjectSlug)!;
      return `${L.best} ${term.phrase} ${L.forWord} ${t.name}`;
    }
    const f = FORMATS.find((x) => x.slug === other.subjectSlug)!;
    return L.howToH1(f.name, t.name);
  };

  // Cross-family twin first (best ↔ how-to for the same target).
  const twin = ALL_SPECS.find(
    (o) => o.family !== spec.family && o.targetKind === spec.targetKind && o.targetSlug === spec.targetSlug,
  );
  if (twin) related.push({ path: pathFor(twin, locale), label: labelFor(twin) });

  for (const other of ALL_SPECS) {
    if (related.length >= 6) break;
    if (other.family !== spec.family || other.slug === spec.slug) continue;
    const sameTarget = other.targetSlug === spec.targetSlug && other.targetKind === spec.targetKind;
    const sameSubject = other.subjectSlug === spec.subjectSlug;
    if (sameTarget || (sameSubject && related.length >= 3)) {
      related.push({ path: pathFor(other, locale), label: labelFor(other) });
    }
  }
  return related;
}

export function buildPage(family: Family, slug: string, locale: string): PageContent | null {
  const spec = SPEC_BY_KEY.get(`${family}:${slug}`);
  const L = LOCALES[locale];
  if (!spec || !L) return null;

  const t = targetData(spec);
  const alternates = LOCALE_SLUGS.map((l) => ({ hreflang: LOCALES[l].code, path: pathFor(spec, l) }));
  const override = overridesFor(locale)[`${family}:${slug}`];

  let content: PageContent;

  if (family === 'best') {
    const term = HEAD_TERMS.find((x) => x.slug === spec.subjectSlug)!;
    const h1 = `${L.best} ${term.phrase} ${L.forWord} ${t.name} ${L.in2026}`;
    const faqs: FaqItem[] = [
      { q: `${L.best} ${term.phrase} ${L.forWord} ${t.name}?`, a: `${L.introAgent}` },
      { q: `${L.howTitle(term.phrase)}?`, a: `${L.step1} → ${L.step2} → ${L.step3}. ${L.ctaBody}` },
      { q: locale === 'en' ? `How much does an ${term.phrase} cost?` : `${L.tableHeaders[5]}?`, a: locale === 'en' ? 'AgentMedia plans start at $39/month (3,900 credits). Most competitors charge per-video or per-seat subscriptions; see the comparison table above.' : 'AgentMedia: $39/mo (3,900 credits). ' + L.introAgent.split('.')[0] + '.' },
      { q: locale === 'en' ? `Can I automate UGC video creation ${L.forWord} ${t.name}?` : L.whyTitle(t.name) + '?', a: locale === 'en' ? `Yes — AgentMedia is the only UGC tool with a full developer surface: REST API, TypeScript and Python SDKs, a CLI, and an MCP server, so you can ${t.extra}.` : L.introAgent },
    ];
    content = {
      spec,
      locale,
      hreflang: L.code,
      path: pathFor(spec, locale),
      metaTitle: `${h1} — AgentMedia`,
      metaDescription: L.metaDescription(term.phrase, t.name),
      h1,
      intro: [L.introLead(term.phrase, t.name), L.introAgent],
      whyTitle: L.whyTitle(t.name),
      whyBullets: t.bullets,
      compareTitle: L.compareTitle(term.pluralNoun),
      tableHeaders: L.tableHeaders,
      tableRows: COMPARISON_ROWS,
      howTitle: L.howTitle(term.phrase),
      steps: [
        { title: L.step1, command: 'npm install -g agent-media-cli && agent-media login' },
        { title: L.step2, command: selfieCommand(t.script, t.scene) },
        { title: L.step3, command: 'agent-media publish --channels tiktok,instagram,youtube' },
      ],
      faqTitle: L.faqTitle,
      faqs,
      relatedTitle: L.relatedTitle,
      related: relatedLinks(spec, locale, L),
      ctaTitle: L.ctaTitle,
      ctaBody: L.ctaBody,
      ctaButton: L.ctaButton,
      publishAtISO: publishAt(spec).toISOString(),
      alternates,
    };
  } else {
    const f = FORMATS.find((x) => x.slug === spec.subjectSlug)!;
    const h1 = L.howToH1(f.name, t.name);
    const faqs: FaqItem[] = [
      { q: `${h1}?`, a: `${L.howToIntro(f.name, t.name)}` },
      { q: `${L.whatMakesTitle(f.name)}?`, a: f.tips.join('. ') + '.' },
      { q: locale === 'en' ? `How long does it take to generate a ${f.name.toLowerCase()}?` : `${L.stepsTitle}?`, a: locale === 'en' ? 'About a minute end-to-end with AgentMedia: one CLI command generates the actor, video, and captions, and can auto-publish to TikTok, Instagram, and YouTube.' : L.introAgent },
      { q: locale === 'en' ? `Do I need actors or filming equipment?` : L.faqTitle, a: locale === 'en' ? 'No. AgentMedia generates a realistic AI actor from a text description — no photo, camera, or studio required. Persist a character to keep the same face across a whole campaign.' : L.ctaBody },
    ];
    content = {
      spec,
      locale,
      hreflang: L.code,
      path: pathFor(spec, locale),
      metaTitle: `${h1} — AgentMedia`,
      metaDescription: L.howToMeta(f.name, t.name),
      h1,
      intro: [L.howToIntro(f.name, t.name), L.introAgent],
      whyTitle: L.whatMakesTitle(f.name),
      whyBullets: [...f.tips, t.bullets[0]],
      exampleTitle: L.exampleTitle,
      exampleScript: `"${f.script}"\n\n— ${t.scene}`,
      howTitle: L.stepsTitle,
      steps: [
        { title: L.step1, command: 'npm install -g agent-media-cli && agent-media login' },
        { title: L.step2, command: selfieCommand(f.script, f.scene) },
        { title: L.step3, command: 'agent-media publish --channels tiktok,instagram,youtube' },
      ],
      faqTitle: L.faqTitle,
      faqs,
      relatedTitle: L.relatedTitle,
      related: relatedLinks(spec, locale, L),
      ctaTitle: L.ctaTitle,
      ctaBody: L.ctaBody,
      ctaButton: L.ctaButton,
      publishAtISO: publishAt(spec).toISOString(),
      alternates,
    };
  }

  if (override?.intro) content.intro[0] = override.intro;
  if (override?.extraFaqs?.length) content.faqs.push(...override.extraFaqs);
  return content;
}

// ---------------------------------------------------------------------------
// Sitemap / static params helpers
// ---------------------------------------------------------------------------

export function publishedParams(family: Family, now: Date = new Date()): Array<{ slug: string }> {
  return publishedSpecs(now)
    .filter((s) => s.family === family)
    .map((s) => ({ slug: s.slug }));
}

export function pseoSitemapEntries(now: Date = new Date()): Array<{ url: string; lastModified: Date }> {
  const entries: Array<{ url: string; lastModified: Date }> = [];
  for (const spec of publishedSpecs(now)) {
    const published = publishAt(spec);
    for (const locale of LOCALE_SLUGS) {
      entries.push({ url: `https://agent-media.ai${pathFor(spec, locale)}`, lastModified: published });
    }
  }
  return entries;
}

/** Published pages of a family grouped by target kind — used by hub pages. */
export function hubGroups(family: Family, now: Date = new Date()) {
  const L = LOCALES.en;
  const groups: Record<TargetKind, Array<{ path: string; label: string }>> = {
    vertical: [],
    platform: [],
    audience: [],
  };
  for (const spec of publishedSpecs(now)) {
    if (spec.family !== family) continue;
    const t = targetData(spec);
    let label: string;
    if (spec.family === 'best') {
      const term = HEAD_TERMS.find((x) => x.slug === spec.subjectSlug)!;
      label = `${L.best} ${term.phrase} ${L.forWord} ${t.name}`;
    } else {
      const f = FORMATS.find((x) => x.slug === spec.subjectSlug)!;
      label = L.howToH1(f.name, t.name);
    }
    groups[spec.targetKind].push({ path: pathFor(spec, 'en'), label });
  }
  return groups;
}
