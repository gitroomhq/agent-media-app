// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { NextResponse } from 'next/server';
import { INTEGRATION_PAIRS } from '@/seo/integration-data';
import { PRICING_COMPETITORS } from '@/seo/pricing-data';
import { VERSUS_PAIRS } from '@/seo/versus-data';

// Generated list of programmatic competitor × integration pages.
const INTEGRATION_SECTION =
  '\n## Competitor Integrations (API / MCP / CLI)\n\n' +
  'How each competitor integrates programmatically, and the agent-native AgentMedia alternative:\n\n' +
  INTEGRATION_PAIRS.map(
    (p) => `- [${p.competitor.name} ${p.integration.phrase}](https://agent-media.ai/compare/${p.slug})`,
  ).join('\n') +
  '\n\n## Head-to-Head Comparisons\n\n' +
  VERSUS_PAIRS.map(
    (p) => `- [${p.a.name} vs ${p.b.name}](https://agent-media.ai/compare/${p.slug})`,
  ).join('\n') +
  '\n\n## Pricing Comparisons\n\n' +
  '- [AI UGC hub](https://agent-media.ai/ai-ugc)\n' +
  '- [Cheapest AI UGC video tools](https://agent-media.ai/cheapest-ai-ugc-video)\n' +
  PRICING_COMPETITORS.map(
    (c) => `- [${c.name} pricing](https://agent-media.ai/pricing/${c.slug})`,
  ).join('\n') +
  '\n';

const LLMS_TXT = `# agent-media

> UGC for developers. Generate AI videos with talking heads, B-roll, voiceover, and subtitles via API, CLI, SDK, or MCP server.

## Overview

agent-media is a developer-first platform for AI UGC video generation. Write a script, pick an AI actor, get a polished video. Available as a REST API, TypeScript SDK, Python SDK, CLI, and MCP server for AI coding assistants. Plans start at $39/month.

## Links

- [Developer Hub](https://agent-media.ai/developers)
- [UGC Video API](https://agent-media.ai/ugc-video-api)
- [TypeScript SDK](https://agent-media.ai/sdk/typescript)
- [Python SDK](https://agent-media.ai/sdk/python)
- [CLI](https://agent-media.ai/cli)
- [MCP Server](https://agent-media.ai/mcp)
- [Integrations](https://agent-media.ai/integrations)
- [Interactive API Docs](https://agent-media.ai/docs/api-reference)
- [OpenAPI Spec](https://agent-media.ai/openapi.json)
- [API Changelog](https://agent-media.ai/docs/api-changelog)
- [Full LLM Context](https://agent-media.ai/llms-full.txt)

## Published Packages

- TypeScript SDK: \`npm install @agentmedia/sdk\`, [npm](https://www.npmjs.com/package/@agentmedia/sdk)
- Python SDK: \`pip install agent-media\`, [PyPI](https://pypi.org/project/agent-media/)
- CLI: \`npm install -g agent-media-cli\`, [npm](https://www.npmjs.com/package/agent-media-cli)
- MCP Server: \`npx @agentmedia/mcp-server\`, [npm](https://www.npmjs.com/package/@agentmedia/mcp-server)
- Schema: \`npm install @agentmedia/schema\`, [npm](https://www.npmjs.com/package/@agentmedia/schema)
- [GitHub](https://github.com/gitroomhq/agent-media)

## Quick Start

\`\`\`bash
npm install -g agent-media-cli
agent-media login
# Generate a UGC video from a script
agent-media ugc "Ever wonder why some videos go viral? Here's the secret..." --sync
# Or add subtitles to any video
agent-media subtitle ./video.mp4 --style hormozi --sync
\`\`\`

## UGC Pipeline

The UGC pipeline turns a script into a complete video:
- Script → scene splitting → TTS voiceover → AI talking heads + AI B-roll → crossfade assembly → animated subtitles → background music → end screen CTA
- Auto voice detection from face photo
- 200+ pre-made AI actors with face + voice
- 17 subtitle styles: hormozi, minimal, bold, karaoke, clean, tiktok, neon, fire, glow, pop, aesthetic, impact, pastel, electric, boxed, gradient, spotlight
- Flags: --voice, --face-url, --persona, --actor, --style, --duration, --aspect, --music, --cta, --broll, --broll-images, --sync

## SaaS Review Videos

Generate AI review videos for any SaaS product:
- \`agent-media saas-review --saas "Postiz" --screenshots url1,url2 --actor naomi --sync\`
- Provide product name + 1-3 screenshots → AI generates review script → video with talking heads + product B-roll
- Review angles: honest, enthusiastic, roast, tutorial, comparison

## Subtitle Command

Add animated subtitles to any video: \`agent-media subtitle <video-or-job-id> --style hormozi --sync\`

## Persona Management

Save voice + face combos for consistent UGC:
- \`agent-media persona create --name "brand-voice" --voice ./sample.mp3 --face ./photo.png\`
- \`agent-media persona list\`
- \`agent-media persona delete <id>\`

## Pricing

- Creator: $39/month (3,900 credits, ~13 10s videos)
- Pro: $69/month (6,900 credits, ~23 10s videos)
- Pro Plus: $129/month (12,900 credits, ~43 10s videos)
- Extra credit pack: 3,900 credits for $39

## Integrations

- REST API v2: Schema-driven API with OpenAPI spec, interactive Scalar docs
- TypeScript SDK: \`@agentmedia/sdk\`, typed Node.js client with submitVideo() and polling helpers (createShowYourApp, createLaptopUgc, createProductActing)
- Python SDK: \`agent-media\` on PyPI, sync (AgentMedia) and async (AsyncAgentMedia) clients with create_video() polling
- CLI: \`agent-media-cli\` with 30 commands (ugc, show-your-app, product-acting, laptop-ugc, review, actor, subtitle, jobs, account, profile, doctor, etc.)
- MCP Server: \`@agentmedia/mcp-server\`, one tool, make_ugc, that turns a script (plus an optional person, image, or saved character) into a finished vertical video, for Claude Code, Cursor, Windsurf
- OpenAPI Spec: Available at /openapi.json, auto-generate SDKs in any language
- Webhooks: Pass webhook_url in any submit call. We POST a job-completion event to your HTTPS endpoint when the video is ready (URLs are SSRF-validated).

## Comparison Pages

agent-media vs competitors: MakeUGC, Arcads, Creatify, HeyGen, Synthesia, Topview, Runway, Midjourney. Plus dedicated API-vs-API pages for Creatify and Arcads. Plus rankings for cheapest and fastest AI video tools.

- [MakeUGC Alternative](https://agent-media.ai/compare/makeugc-alternative)
- [Arcads Alternative](https://agent-media.ai/compare/arcads-alternative)
- [Arcads API Alternative](https://agent-media.ai/compare/arcads-api)
- [Creatify Alternative](https://agent-media.ai/compare/creatify-alternative)
- [Creatify API Comparison](https://agent-media.ai/compare/creatify-api)
- [HeyGen Alternative](https://agent-media.ai/compare/heygen-alternative)
- [Synthesia Alternative](https://agent-media.ai/compare/synthesia-alternative)
- [Topview Alternative](https://agent-media.ai/compare/topview-alternative)
- [Cheapest AI Video](https://agent-media.ai/compare/cheapest-ai-video)
- [Fastest AI Video](https://agent-media.ai/compare/fastest-ai-video)

## Use Cases

- [TikTok UGC Ads](https://agent-media.ai/use-cases/tiktok-ugc-ads)
- [Facebook UGC Ads](https://agent-media.ai/use-cases/facebook-ugc-ads)
- [Shopify Product Videos](https://agent-media.ai/use-cases/shopify-product-videos)
- [SaaS Review Videos](https://agent-media.ai/use-cases/saas-review-videos)
- [UGC Video API](https://agent-media.ai/use-cases/ugc-video-api)
- [AI Video CLI](https://agent-media.ai/use-cases/ai-video-cli)
- [E-commerce](https://agent-media.ai/use-cases/ecommerce)
- [Agencies](https://agent-media.ai/use-cases/agencies)

## Tools

- [UGC Cost Calculator](https://agent-media.ai/tools/ugc-cost-calculator) - Compare per-video costs across platforms
- [UGC Script Generator](https://agent-media.ai/tools/ugc-script-generator) - AI-powered script writing for UGC videos

## Blog

- [MCP Server for AI Video Generation](https://agent-media.ai/blog/mcp-server-ai-video-generation)
- [Automate UGC Video Ads with the API](https://agent-media.ai/blog/automate-ugc-video-ads-api)
- [Generate AI Videos with GitHub Actions](https://agent-media.ai/blog/ai-video-github-action)
- [AI UGC Pricing Comparison 2026](https://agent-media.ai/blog/ai-ugc-pricing-comparison-2026)
- [Best AI UGC Generator for Developers](https://agent-media.ai/blog/best-ai-ugc-generator-for-developers)
- [Generate AI Video from Terminal in 60 Seconds](https://agent-media.ai/blog/generate-ai-video-terminal-60-seconds)
`;

export async function GET() {
  return new NextResponse(LLMS_TXT + INTEGRATION_SECTION, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
