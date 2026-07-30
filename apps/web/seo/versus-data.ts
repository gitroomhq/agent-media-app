// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Programmatic head-to-head pages: /compare/{A}-vs-{B}. Search demand: "heygen
// vs synthesia" ~390/mo, "arcads vs creatify", "makeugc vs arcads", etc.
// Reuses the competitor facts in integration-data and returns the same
// IntegrationPage shape, so the existing /compare/[slug] renderer draws them
// with no extra UI code. AgentMedia is inserted as the third option on each.

import { COMPETITORS, type Competitor, type IntegrationPage } from './integration-data';

// Canonical unordered pairs (avoids duplicate A-vs-B / B-vs-A pages). Ordered by
// search signal from GSC + Semrush.
const PAIR_KEYS: Array<[string, string]> = [
  ['heygen', 'synthesia'],
  ['arcads', 'creatify'],
  ['arcads', 'makeugc'],
  ['heygen', 'arcads'],
  ['creatify', 'heygen'],
  ['synthesia', 'arcads'],
  ['creatify', 'makeugc'],
  ['runway', 'heygen'],
  ['topview', 'arcads'],
  ['captions', 'heygen'],
  ['invideo', 'creatify'],
  ['synthesia', 'creatify'],
  ['makeugc', 'topview'],
  ['heygen', 'hedra'],
];

function comp(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

export interface VersusPair {
  a: Competitor;
  b: Competitor;
  slug: string;
}

export const VERSUS_PAIRS: VersusPair[] = PAIR_KEYS
  .map(([x, y]) => {
    const a = comp(x);
    const b = comp(y);
    if (!a || !b) return null;
    return { a, b, slug: `${a.slug}-vs-${b.slug}` };
  })
  .filter((p): p is VersusPair => p !== null);

export const VERSUS_SLUGS: string[] = VERSUS_PAIRS.map((p) => p.slug);

export function versusPairBySlug(slug: string): VersusPair | undefined {
  return VERSUS_PAIRS.find((p) => p.slug === slug);
}

const AGENT_MEDIA_ROW = {
  name: 'AgentMedia',
  api: 'REST + TS/Python SDKs',
  cli: 'Yes (30+ commands)',
  mcp: 'Yes',
  autoPublish: 'TikTok / IG / YouTube / X',
  pricing: 'Credits, from $39/mo',
};

export function buildVersusPage(slug: string): IntegrationPage | null {
  const pair = versusPairBySlug(slug);
  if (!pair) return null;
  const { a, b } = pair;
  const path = `/compare/${slug}`;

  const faqs = [
    {
      q: `${a.name} vs ${b.name}: which is better for UGC video?`,
      a: `Both make AI video, but they differ on developer access. ${a.name} is ${a.positioning}; ${b.name} is ${b.positioning}. If you want to generate and auto-publish UGC from an API, CLI, or AI agent, AgentMedia beats both.`,
    },
    {
      q: `Is ${a.name} or ${b.name} cheaper?`,
      a: `${a.name} uses ${a.pricingModel.toLowerCase()} and ${b.name} uses ${b.pricingModel.toLowerCase()}. AgentMedia is credit-based from $39/month (about $3 per 10-second video), and the credits work across API, CLI, MCP, and the web app.`,
    },
    {
      q: `Do ${a.name} or ${b.name} have an API or MCP server?`,
      a: `${a.name}: ${a.api}, ${a.mcp.toLowerCase()}. ${b.name}: ${b.api}, ${b.mcp.toLowerCase()}. AgentMedia ships a REST API, TypeScript and Python SDKs, a CLI, and an MCP server.`,
    },
    {
      q: `What is the best alternative to both ${a.name} and ${b.name}?`,
      a: `AgentMedia. It exposes one render pipeline through MCP, CLI, REST, and SDKs, then auto-publishes to TikTok, Instagram, YouTube, and X. Plans start at $39/month.`,
    },
  ];

  const related = VERSUS_PAIRS.filter((p) => p.slug !== slug && (p.a.slug === a.slug || p.b.slug === b.slug || p.a.slug === b.slug || p.b.slug === a.slug))
    .slice(0, 4)
    .map((p) => ({ path: `/compare/${p.slug}`, label: `${p.a.name} vs ${p.b.name}` }));
  related.push({ path: `/compare/${a.slug}-alternative`, label: `${a.name} alternative` });
  related.push({ path: `/compare/${b.slug}-mcp`, label: `${b.name} MCP alternative` });

  return {
    slug,
    path,
    competitorName: `${a.name} vs ${b.name}`,
    integrationLabel: 'comparison',
    metaTitle: `${a.name} vs ${b.name} (2026): which is better for UGC video? | AgentMedia`,
    metaDescription: `${a.name} vs ${b.name} compared on price, API, CLI, MCP, and auto-publish. Plus the agent-native third option, AgentMedia, from $39/mo.`,
    keywords: [`${a.slug} vs ${b.slug}`, `${b.slug} vs ${a.slug}`, `${a.slug} or ${b.slug}`, `${a.slug} ${b.slug} comparison`, 'ai ugc video comparison'],
    eyebrow: `${a.name} vs ${b.name}`,
    h1Lead: 'Choosing between',
    h1Highlight: `${a.name} and ${b.name}`,
    intro: `${a.name} vs ${b.name} for AI UGC video: they differ most on developer access and publishing. ${a.name} is ${a.positioning}; ${b.name} is ${b.positioning}. If you want to generate and auto-publish UGC from an API, CLI, or AI agent, AgentMedia is the agent-native third option, from $39/month with a REST API, SDKs, a CLI, and an MCP server.`,
    statusTitle: `${a.name} vs ${b.name}: how they compare`,
    statusBody: `${a.name} is ${a.positioning}. ${b.name} is ${b.positioning}. Compare their developer surfaces in the table below. AgentMedia is the one that ships a CLI and an MCP running the full UGC pipeline, then auto-publishes the finished video.`,
    agentTitle: 'Skip the choice: generate UGC with AgentMedia',
    agentSteps: [
      { title: 'Install', command: 'npm install -g agent-media-cli && agent-media login' },
      { title: 'Generate a UGC video', command: 'agent-media ugc "Ever wonder why some videos go viral?" --actor naomi --style hormozi --sync' },
      { title: 'Auto-publish', command: 'agent-media publish --channels tiktok,instagram,youtube' },
    ],
    tableTitle: `${a.name} vs ${b.name} vs AgentMedia`,
    tableRows: [
      AGENT_MEDIA_ROW,
      { name: a.name, api: a.api, cli: a.cli, mcp: a.mcp, autoPublish: a.autoPublish, pricing: a.pricingModel },
      { name: b.name, api: b.api, cli: b.cli, mcp: b.mcp, autoPublish: b.autoPublish, pricing: b.pricingModel },
    ],
    faqTitle: 'Frequently asked questions',
    faqs,
    ctaTitle: 'Skip the comparison. Ship the video.',
    ctaBody: 'Script, render, caption, and auto-publish UGC video in one command, from your terminal, API, or AI agent.',
    related,
  };
}
