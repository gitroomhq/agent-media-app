// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Programmatic "competitor × integration" pages (the /compare/[slug] family).
// Search demand for these is real (Google Search Console, 3 mo): e.g.
// "arcads mcp" 409 impressions @ pos 9.6, "synthesia mcp" 80 @ 8.1,
// "makeugc api" 40 @ 8.7. AgentMedia's differentiator is that it ships an
// MCP server, CLI, and REST/SDK surface, so every one of these queries has a
// genuine, non-doorway answer: here is {competitor}'s integration status, and
// here is the agent-native way to do it with AgentMedia.
//
// Pages are pure functions of the data below. Slugs that already exist as
// hand-written static folders under /compare (arcads-api, creatify-api) are
// excluded so the dynamic route never collides with them.

export interface Competitor {
  slug: string;
  name: string;
  /** Factual integration status as of the `asOf` date. Conservative wording. */
  api: string;
  mcp: string;
  cli: string;
  autoPublish: string;
  pricingModel: string;
  /** One-line, honest characterization used in the intro. */
  positioning: string;
}

export interface IntegrationType {
  slug: string; // url suffix, e.g. "mcp"
  label: string; // "MCP server"
  /** Query intent phrase, e.g. "MCP server". */
  phrase: string;
  blurb: string; // what this integration is / why an agent needs it
}

export const AS_OF = 'July 2026';

// Facts verified against vendor sources as of AS_OF (July 2026). AgentMedia's
// durable differentiator is not "we alone have an MCP" (HeyGen now ships one for
// avatar clips) but the full UGC pipeline through MCP + CLI + REST that also
// auto-publishes. Keep these fields accurate; they drive the tables and FAQs.
export const COMPETITORS: Competitor[] = [
  { slug: 'arcads', name: 'Arcads', api: 'Public API on Enterprise plans (webhooks)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Subscription (API on Enterprise)', positioning: 'a UGC ad generator whose API is gated to Enterprise plans, with no CLI or MCP' },
  { slug: 'synthesia', name: 'Synthesia', api: 'Enterprise API (approval required)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Per-seat subscription + enterprise API', positioning: 'an enterprise avatar-video tool gated behind sales and seat licensing' },
  { slug: 'creatify', name: 'Creatify', api: 'API on Enterprise plan', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'Limited', pricingModel: 'Subscription + Enterprise API', positioning: 'a UGC ad tool with an Enterprise API tier but no CLI or MCP for agents' },
  { slug: 'makeugc', name: 'MakeUGC', api: 'API on paid plans (from ~$99/mo)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'TikTok / Meta (native)', pricingModel: 'Subscription + API plans', positioning: 'a UGC generator with an API on higher-priced plans, but no CLI or MCP' },
  { slug: 'heygen', name: 'HeyGen', api: 'REST API (pay-as-you-go)', mcp: 'Official MCP server (avatar clips)', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Subscription + pay-as-you-go API', positioning: 'an avatar-video platform with an API and MCP for avatar clips, not a full UGC pipeline with auto-publishing' },
  { slug: 'runway', name: 'Runway', api: 'Developer API (per-credit)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Credits + subscription', positioning: 'a generative-video model API, not a UGC pipeline with publishing' },
  { slug: 'topview', name: 'Topview', api: 'API on paid plans (shares web credits)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Subscription (API on paid plans)', positioning: 'a UGC ad tool whose API shares web credits, with no CLI or MCP' },
  { slug: 'captions', name: 'Captions', api: 'No public UGC API', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Subscription', positioning: 'a mobile-first editor without a public UGC API or MCP' },
  { slug: 'invideo', name: 'InVideo', api: 'No public UGC API', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Subscription', positioning: 'a template video editor without a programmatic UGC surface' },
  { slug: 'hedra', name: 'Hedra', api: 'Platform API (image + video)', mcp: 'No MCP server', cli: 'No CLI', autoPublish: 'No', pricingModel: 'Credits + subscription', positioning: 'a character-video API without a UGC publishing pipeline' },
];

export const INTEGRATION_TYPES: IntegrationType[] = [
  { slug: 'mcp', label: 'MCP server', phrase: 'MCP server', blurb: 'An MCP (Model Context Protocol) server lets AI agents like Claude Code, Cursor, and Windsurf call the tool directly as a native capability, with no glue code.' },
  { slug: 'api', label: 'API', phrase: 'API', blurb: 'A REST API lets you generate video programmatically from any backend, worker, or automation.' },
  { slug: 'cli', label: 'CLI', phrase: 'CLI', blurb: 'A CLI lets you generate and publish video from your terminal, a script, or a CI job. One command, no dashboard.' },
  { slug: 'claude-code', label: 'Claude Code skill', phrase: 'Claude Code integration', blurb: 'A Claude Code skill/MCP lets the agent script, render, caption, and publish video inside your coding session.' },
];

// Slugs already served by hand-written static folders. Never generate these.
const EXISTING_STATIC = new Set(['arcads-api', 'creatify-api', 'arcads-alternative', 'creatify-alternative', 'heygen-alternative', 'synthesia-alternative', 'makeugc-alternative', 'topview-alternative', 'cheapest-ai-video', 'fastest-ai-video']);

export interface IntegrationPair {
  competitor: Competitor;
  integration: IntegrationType;
  slug: string;
}

export const INTEGRATION_PAIRS: IntegrationPair[] = COMPETITORS.flatMap((competitor) =>
  INTEGRATION_TYPES.map((integration) => ({
    competitor,
    integration,
    slug: `${competitor.slug}-${integration.slug}`,
  })),
).filter((p) => !EXISTING_STATIC.has(p.slug));

export const INTEGRATION_SLUGS: string[] = INTEGRATION_PAIRS.map((p) => p.slug);

export function integrationPairBySlug(slug: string): IntegrationPair | undefined {
  return INTEGRATION_PAIRS.find((p) => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Content composition. One page = pure function of a pair.
// ---------------------------------------------------------------------------

export interface Faq {
  q: string;
  a: string;
}

export interface IntegrationPage {
  slug: string;
  path: string;
  competitorName: string;
  integrationLabel: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  h1Lead: string; // shown before the highlighted competitor phrase
  h1Highlight: string; // "{Competitor} {phrase}"
  intro: string;
  statusTitle: string;
  statusBody: string;
  agentTitle: string;
  agentSteps: Array<{ title: string; command: string }>;
  tableTitle: string;
  tableRows: Array<{ name: string; api: string; cli: string; mcp: string; autoPublish: string; pricing: string }>;
  faqTitle: string;
  faqs: Faq[];
  ctaTitle: string;
  ctaBody: string;
  related: Array<{ path: string; label: string }>;
}

const AGENT_MEDIA_ROW = {
  name: 'AgentMedia',
  api: 'REST + TS/Python SDKs',
  cli: 'Yes (30+ commands)',
  mcp: 'Yes',
  autoPublish: 'TikTok / IG / YouTube / X',
  pricing: 'Credits, from $39/mo',
};

function stepsFor(type: IntegrationType): Array<{ title: string; command: string }> {
  const install = { title: 'Install', command: 'npm install -g agent-media-cli && agent-media login' };
  const generate = {
    title: 'Generate a UGC video',
    command: `agent-media ugc "Ever wonder why some videos go viral? Here's the secret..." \\
  --actor naomi --style hormozi --sync`,
  };
  const publish = { title: 'Auto-publish', command: 'agent-media publish --channels tiktok,instagram,youtube' };
  if (type.slug === 'mcp' || type.slug === 'claude-code') {
    return [
      { title: 'Add the MCP server', command: 'npx @agentmedia/mcp-server' },
      { title: 'Or install the Claude skill', command: 'npx skills add gitroomhq/agent-media' },
      { title: 'Ask your agent', command: '"Create a TikTok UGC ad about our new pricing and publish it."' },
    ];
  }
  if (type.slug === 'api') {
    return [
      { title: 'Call the REST API', command: `curl -X POST https://agent-media.ai/api/v1/generate \\
  -H "Authorization: Bearer $AGENTMEDIA_KEY" \\
  -d '{"type":"ugc","script":"...","actor":"naomi","publish":["tiktok"]}'` },
      { title: 'Or use an SDK', command: 'npm install @agentmedia/sdk   # or: pip install agent-media' },
      publish,
    ];
  }
  return [install, generate, publish];
}

export function buildIntegrationPage(slug: string): IntegrationPage | null {
  const pair = integrationPairBySlug(slug);
  if (!pair) return null;
  const { competitor: c, integration: t } = pair;
  const cName = c.name;
  const path = `/compare/${slug}`;

  const statusField = t.slug === 'api' ? c.api : t.slug === 'cli' ? c.cli : c.mcp;

  const faqs: Faq[] = [
    {
      q: `Does ${cName} have ${t.slug === 'api' ? 'an API' : `a ${t.phrase}`}?`,
      a: `As of ${AS_OF}, ${cName} offers: ${statusField}. ${cName} is ${c.positioning}. AgentMedia is the agent-native alternative. It ships a REST API, TypeScript and Python SDKs, a CLI, and an MCP server.`,
    },
    {
      q: `What is the best ${cName} alternative with ${t.phrase} support?`,
      a: `AgentMedia. It exposes the same render pipeline through MCP, CLI, REST, and SDKs, and can auto-publish to TikTok, Instagram, YouTube, and X. Plans start at $39/month.`,
    },
    {
      q: `How do I generate UGC video from an AI agent?`,
      a: `Install the AgentMedia MCP server (\`npx @agentmedia/mcp-server\`) or the Claude skill (\`npx skills add gitroomhq/agent-media\`), then ask your agent to create and publish a video in one prompt.`,
    },
    {
      q: `How much does AgentMedia cost versus ${cName}?`,
      a: `AgentMedia is credit-based from $39/month (3,900 credits). ${cName} uses ${c.pricingModel.toLowerCase()}. See the comparison table above.`,
    },
  ];

  const related = INTEGRATION_PAIRS
    .filter((p) => p.slug !== slug && (p.competitor.slug === c.slug || p.integration.slug === t.slug))
    .slice(0, 6)
    .map((p) => ({ path: `/compare/${p.slug}`, label: `${p.competitor.name} ${p.integration.phrase}` }));

  return {
    slug,
    path,
    competitorName: cName,
    integrationLabel: t.label,
    metaTitle: `${cName} ${t.phrase}: status + the agent-native alternative | AgentMedia`,
    metaDescription: `Does ${cName} have ${t.slug === 'api' ? 'an API' : `a ${t.phrase}`}? Status as of ${AS_OF}, and how to generate + auto-publish UGC video from an ${t.label} with AgentMedia. From $39/mo.`,
    keywords: [
      `${c.slug} ${t.slug}`,
      `${c.slug} ${t.phrase}`.toLowerCase(),
      `${c.slug} ${t.slug} alternative`,
      `ai ugc ${t.slug}`,
      `${c.slug} vs agent-media`,
    ],
    eyebrow: `${cName} · ${t.label}`,
    h1Lead: 'Looking for the',
    h1Highlight: `${cName} ${t.phrase}`,
    intro: `${t.blurb} As of ${AS_OF}, ${cName} offers: ${statusField.toLowerCase()}. If you want to generate UGC video programmatically and auto-publish it, AgentMedia is the agent-native alternative: a REST API, TypeScript and Python SDKs, a CLI, and an MCP server, all on the $39 Creator plan.`,
    statusTitle: `${cName} ${t.label}: the current status`,
    statusBody: `${cName} is ${c.positioning}. ${t.label} status as of ${AS_OF}: ${statusField}. AgentMedia ships the full developer surface so any agent on your team can create, caption, and publish video without a designer in the loop.`,
    agentTitle: `Generate + publish UGC video with the AgentMedia ${t.label}`,
    agentSteps: stepsFor(t),
    tableTitle: `${cName} vs AgentMedia: developer surface`,
    tableRows: [
      AGENT_MEDIA_ROW,
      { name: cName, api: c.api, cli: c.cli, mcp: c.mcp, autoPublish: c.autoPublish, pricing: c.pricingModel },
    ],
    faqTitle: 'Frequently asked questions',
    faqs,
    ctaTitle: 'Put your agent on the social grind',
    ctaBody: 'Script, render, caption, and auto-publish UGC video in one command, from your terminal, API, or AI agent.',
    related,
  };
}
