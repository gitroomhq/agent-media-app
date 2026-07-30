// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Programmatic "/pricing/{competitor}" pages + the /cheapest-ai-ugc-video hub.
// Search demand (GSC + Semrush): "heygen pricing" ~9,900/mo, "synthesia pricing"
// ~6,600/mo, plus "ai ugc cost", "cheapest video model" etc. that AgentMedia
// already ranks page 1-2 for.
//
// AgentMedia numbers are exact (from the published plans). Competitor entry
// prices are approximate, publicly-reported ballparks as of AS_OF and are always
// shown with a "verify on vendor site" disclaimer. The page's real, non-doorway
// value is the cost-per-video math and the subscription-vs-credits comparison,
// neither of which is fabricated.

import { AS_OF } from './integration-data';

export { AS_OF };

export interface PlanRow {
  name: string;
  price: string;
  detail: string;
  perVideo: string;
}

// AgentMedia, exact. 3,900 credits ≈ 13 ten-second videos → ~300 credits/video,
// $0.01/credit → ~$3 per 10s video, cheaper as you scale up plans.
export const AGENTMEDIA_PLANS: PlanRow[] = [
  { name: 'Creator', price: '$39/mo', detail: '3,900 credits (~13×10s videos)', perVideo: '~$3.00' },
  { name: 'Pro', price: '$69/mo', detail: '6,900 credits (~23×10s videos)', perVideo: '~$3.00' },
  { name: 'Pro Plus', price: '$129/mo', detail: '12,900 credits (~43×10s videos)', perVideo: '~$3.00' },
];

export interface PricingCompetitor {
  slug: string;
  name: string;
  model: string;
  entryPrice: string; // approximate, verify
  perVideoNote: string;
  hasDeveloperSurface: string;
  note: string;
}

export const PRICING_COMPETITORS: PricingCompetitor[] = [
  { slug: 'heygen', name: 'HeyGen', model: 'Subscription + pay-as-you-go API', entryPrice: '~$29/mo (Creator); API from $5 PAYG', perVideoNote: 'API billed per second (~$1-4 per minute by avatar type)', hasDeveloperSurface: 'REST API + official MCP server, no CLI', note: 'Avatar-first; has an MCP for avatar clips, but UGC-style ads and auto-publishing are not native.' },
  { slug: 'synthesia', name: 'Synthesia', model: 'Per-seat subscription + enterprise API', entryPrice: '~$29/mo ($18 annual, Starter)', perVideoNote: 'Video-minute limits per seat (~10 min/mo on Starter); API on higher tiers', hasDeveloperSurface: 'Enterprise API (approval), no CLI/MCP', note: 'Enterprise L&D focus; ad-style UGC is not the core use case.' },
  { slug: 'arcads', name: 'Arcads', model: 'Subscription (API on Enterprise)', entryPrice: '~$110/mo (self-serve)', perVideoNote: 'Generation limits per plan; API access requires Enterprise', hasDeveloperSurface: 'Public API on Enterprise, no CLI/MCP', note: 'UGC ads focus; API exists but is gated to Enterprise plans.' },
  { slug: 'creatify', name: 'Creatify', model: 'Subscription + Enterprise API', entryPrice: '~$33/mo (Starter)', perVideoNote: 'Credit-based; API on Enterprise plan', hasDeveloperSurface: 'API on Enterprise, no CLI/MCP', note: 'Has an Enterprise API tier; no CLI or MCP for agent workflows.' },
  { slug: 'makeugc', name: 'MakeUGC', model: 'Subscription + API plans', entryPrice: '~$49/mo (self-serve); API from ~$99/mo', perVideoNote: 'Credit-based; API Starter ~2,000 credits/mo', hasDeveloperSurface: 'API on paid plans, no CLI/MCP', note: 'Has an API on higher-priced plans; no CLI or MCP.' },
  { slug: 'runway', name: 'Runway', model: 'Credits + subscription', entryPrice: '~$12/mo (Standard, annual)', perVideoNote: 'Credit-based; API billed separately at ~$0.01/credit', hasDeveloperSurface: 'Developer API (per-credit), no UGC pipeline', note: 'A generative-video model, not a script-to-published-UGC pipeline.' },
  { slug: 'topview', name: 'Topview', model: 'Subscription (API on paid plans)', entryPrice: '~$16/mo (Pro, annual)', perVideoNote: 'Credit-based; API shares your web credits', hasDeveloperSurface: 'API on paid plans, no CLI/MCP', note: 'UGC ad tool; API shares web credits, no CLI or MCP.' },
  { slug: 'captions', name: 'Captions', model: 'Subscription', entryPrice: '~$9.99/mo (Pro)', perVideoNote: 'Credit-based on Max/Scale tiers', hasDeveloperSurface: 'No public UGC API, no CLI/MCP', note: 'Mobile-first editor; no public UGC API or agent surface.' },
  { slug: 'invideo', name: 'InVideo', model: 'Subscription', entryPrice: '~$25/mo ($20 annual, Plus)', perVideoNote: 'Monthly credits (Plus ~75/mo); no token API', hasDeveloperSurface: 'No public UGC API', note: 'Template editor; subscription only, no programmatic UGC surface.' },
];

export const PRICING_SLUGS: string[] = PRICING_COMPETITORS.map((c) => c.slug);

export function pricingCompetitorBySlug(slug: string): PricingCompetitor | undefined {
  return PRICING_COMPETITORS.find((c) => c.slug === slug);
}

export interface Faq {
  q: string;
  a: string;
}

export interface PricingPage {
  slug: string;
  path: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  h1: string;
  intro: string;
  competitor: PricingCompetitor;
  agentmediaPlans: PlanRow[];
  faqs: Faq[];
  related: Array<{ path: string; label: string }>;
}

export function buildPricingPage(slug: string): PricingPage | null {
  const c = pricingCompetitorBySlug(slug);
  if (!c) return null;
  const path = `/pricing/${slug}`;
  const faqs: Faq[] = [
    { q: `How much does ${c.name} cost?`, a: `As of ${AS_OF}, ${c.name} uses ${c.model.toLowerCase()}, starting around ${c.entryPrice} (approximate, verify on ${c.name}'s site). ${c.perVideoNote}.` },
    { q: `Is ${c.name} cheaper than AgentMedia?`, a: `AgentMedia starts at $39/month for 3,900 credits (~13 ten-second videos, ~$3/video) and gets cheaper per video on higher plans. Unlike ${c.name}, that includes a REST API, CLI, and MCP server, plus auto-publishing to TikTok, Instagram, and YouTube.` },
    { q: `What is the cheapest way to generate AI UGC videos at scale?`, a: `Credit-based pricing scales better than per-seat subscriptions for high volume. AgentMedia's credits work across API, CLI, MCP, and the web app, so one balance covers manual and automated generation.` },
    { q: `Does ${c.name} have an API for automation?`, a: `${c.hasDeveloperSurface}. AgentMedia ships the full developer surface (REST + SDKs + CLI + MCP), so agents can generate and publish video end-to-end.` },
  ];
  const related = PRICING_COMPETITORS
    .filter((x) => x.slug !== slug)
    .slice(0, 6)
    .map((x) => ({ path: `/pricing/${x.slug}`, label: `${x.name} pricing` }));
  related.push({ path: '/cheapest-ai-ugc-video', label: 'Cheapest AI UGC video tools' });
  return {
    slug,
    path,
    name: c.name,
    metaTitle: `${c.name} Pricing 2026: plans, true cost per video, and a cheaper alternative | AgentMedia`,
    metaDescription: `${c.name} pricing as of ${AS_OF}: ${c.model.toLowerCase()} from ${c.entryPrice}. See real cost-per-video math vs AgentMedia (from $39/mo, API + CLI + MCP included).`,
    keywords: [`${c.slug} pricing`, `${c.slug} pricing 2026`, `${c.slug} cost`, `${c.slug} price per video`, `${c.slug} vs agent-media pricing`, 'ai ugc cost'],
    h1: `${c.name} pricing (2026): plans, cost per video, and a cheaper alternative`,
    intro: `${c.name} uses ${c.model.toLowerCase()}, starting around ${c.entryPrice} as of ${AS_OF}. ${c.note} If you want lower cost per video plus programmatic access (a REST API, CLI, and MCP server), AgentMedia starts at $39/month with credits that work everywhere.`,
    competitor: c,
    agentmediaPlans: AGENTMEDIA_PLANS,
    faqs,
    related,
  };
}
