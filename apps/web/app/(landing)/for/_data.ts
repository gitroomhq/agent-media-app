// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Industry / persona data for /for/[slug] programmatic landing pages.
 *
 * Each entry generates one fully-fleshed landing page with:
 *   - Hero (uppercase H1 + agent-loop subhead)
 *   - 3 use-case scenarios specific to the vertical
 *   - One code example tuned to the vertical's likely workflow
 *   - 5-question FAQ keyword-targeted to the vertical
 *   - @graph JSON-LD (Article + FAQPage + SoftwareApplication)
 *
 * To add a new vertical: append an entry below. The dynamic route picks
 * it up automatically; sitemap.ts re-exports the slug list.
 */

export type ForVertical = {
  /** URL slug (unique). Becomes /for/<slug>. */
  slug: string;
  /** Human-readable persona title used in nav, breadcrumbs, copy. */
  personaLabel: string;
  /** H1 hero. Keep terse + uppercase-friendly. */
  heroH1: string;
  /** Short purple-accent word in the H1, e.g. "SaaS founders". */
  heroH1Accent: string;
  /** Subhead under the hero — agent-loop framing for this vertical. */
  heroSubhead: string;
  /** Page <title> — keep under 60 chars. */
  metaTitle: string;
  /** Meta description — under 160 chars. */
  metaDescription: string;
  /** SEO keywords. */
  keywords: string[];
  /** 3 vertical-specific use-case scenarios. */
  scenarios: { title: string; desc: string }[];
  /** One code example tuned to this vertical. */
  codeExample: { title: string; lang: string; code: string };
  /** 5-Q FAQ. Question/answer strings — both rendered in HTML and in FAQPage schema. */
  faq: { q: string; a: string }[];
  /** Date strings for JSON-LD. */
  datePublished: string;
  dateModified: string;
};

export const FOR_VERTICALS: ForVertical[] = [
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'saas',
    personaLabel: 'SaaS Founders',
    heroH1Accent: 'SaaS Founders',
    heroH1: 'AI UGC Ads For SaaS Founders.',
    heroSubhead:
      'Generate UGC ads for your product without filming actors, hiring agencies, or spending $300/video. POST a script + your app screenshot to /v1/generate/show_your_app and get a finished MP4 with an AI actor holding your app, talking about it. Plans from $39/month.',
    metaTitle: 'AI UGC for SaaS Founders — agent-media',
    metaDescription:
      'Generate UGC video ads for your SaaS product programmatically. AI actor holds your app screenshot and talks about it. From $39/month with REST API, CLI, MCP server.',
    keywords: [
      'ai ugc for saas',
      'ugc ads saas',
      'show your app video',
      'saas ad generation',
      'ai video saas founder',
      'product hunt video',
    ],
    scenarios: [
      {
        title: 'Show-your-app ads from CI/CD',
        desc: 'Push a feature, GitHub Action calls /v1/generate/show_your_app with the new screenshot, ad URL flows into your launch playbook.',
      },
      {
        title: 'Launch-week creative',
        desc: 'Generate 10 hook variants from one product description; A/B test on TikTok, Reels, and Shorts the day you launch.',
      },
      {
        title: 'Founder-led talking head',
        desc: 'No camera-shy founder syndrome. Pick an AI actor that matches your tone, write the script in your editor, ship to ads in under 2 minutes.',
      },
    ],
    codeExample: {
      title: 'show-your-app.ts',
      lang: 'TypeScript',
      code: `import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({
  apiKey: process.env.AGENT_MEDIA_API_KEY!,
});

// Submit + poll. Returns finished MP4 URL.
const video = await client.createShowYourApp({
  app_screenshot_url: 'https://yourapp.com/og-image.png',
  script:
    'I built a tool that ships UGC ads from a single REST call. ' +
    'Watch how my SaaS launches campaigns now.',
  duration: 10,
  subtitle_style: 'hormozi',
});

console.log(video.video_url);
// Pipe into your ad-account uploader, Slack, or CMS.`,
    },
    faq: [
      {
        q: 'Can I generate UGC ads for my SaaS without hiring actors?',
        a: 'Yes. agent-media has 200+ AI actors. Pick one with /v1/actors, pass your app screenshot and script to /v1/generate/show_your_app, and get a finished 9:16 MP4 with the actor holding your app and speaking your words. No filming required.',
      },
      {
        q: 'How much does it cost per video?',
        a: 'Roughly $3 per 10-second video at 30 credits/sec. The Creator plan ($39/month) includes 3,900 credits — about 13 videos per month. Pay-as-you-go credit packs are also available and never expire.',
      },
      {
        q: 'Can I integrate this with my SaaS launch playbook?',
        a: 'Yes. The REST API, TypeScript SDK, and Python SDK are all production-ready. GitHub Actions, Vercel cron, FastAPI background tasks, and any CI/CD pipeline can call agent-media on a schedule or on a feature-launch event.',
      },
      {
        q: 'Will the AI actor hold my app screenshot accurately?',
        a: 'Yes. show_your_app uses an image-to-video model that places the screenshot in the actor\'s hand with stable framing. The screenshot must be vertical (portrait) PNG/JPEG/WebP. Best results with full app screenshots, not crops.',
      },
      {
        q: 'Does agent-media work with Claude Code or Cursor?',
        a: 'Yes. The MCP server (npx @agentmedia/mcp-server) exposes 6 tools to any MCP client. Drop one JSON block into Claude Code and tell your assistant "make 5 launch-week ad variants" — it writes the scripts, calls the API, and pipes URLs back into your editor.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'dropshipping',
    personaLabel: 'Dropshipping Sellers',
    heroH1Accent: 'Dropshipping',
    heroH1: 'AI UGC Ads For Dropshipping.',
    heroSubhead:
      'Generate winning product UGC ads programmatically — no actor budget, no shoots, no waiting on a $40 Fiverr gig. POST a product image and a script to /v1/generate/product_acting_ugc and get a 9:16 MP4 with an AI creator presenting your product. From $3 per video.',
    metaTitle: 'AI UGC Ads For Dropshipping — agent-media',
    metaDescription:
      'Generate UGC video ads for dropshipping products programmatically. AI creator + product image → finished MP4. $3/video. REST API + CLI + MCP for batch testing.',
    keywords: [
      'ai ugc dropshipping',
      'dropshipping video ads',
      'product ugc generation',
      'shopify product videos',
      'tiktok dropshipping ads',
      'cheap ugc videos',
    ],
    scenarios: [
      {
        title: 'Test 50 hooks before scaling spend',
        desc: 'Generate one hook variant per product image batch via CSV, upload to Meta and TikTok ad managers, kill losers fast.',
      },
      {
        title: 'New SKU? Same-day creative',
        desc: 'Drop a product image into your storefront, kick off product_acting_ugc with 3 acting styles (shocked, excited, weird-hook), pick the winner.',
      },
      {
        title: 'Geo-localized ad copy',
        desc: 'Same product image, multiple scripts targeted by language or region. Use --dub-language for native voiceover in 30+ languages.',
      },
    ],
    codeExample: {
      title: 'batch.py',
      lang: 'Python',
      code: `from agent_media import AgentMedia
import csv

client = AgentMedia(api_key="ma_…")

# CSV: product_image_url, hook_script
with open("hooks.csv") as f:
    for row in csv.DictReader(f):
        video = client.create_product_acting(
            product_image_url=row["product_image_url"],
            actor_slug="adaeze",
            script=row["hook_script"],
            template="bathroom-reaction",
            acting_style="shocked",
            duration=10,
        )
        print(video["video_url"])
        # Pipe into your Meta or TikTok ad uploader`,
    },
    faq: [
      {
        q: 'Can I generate dropshipping UGC ads without buying the product or hiring a creator?',
        a: 'Yes. agent-media product_acting_ugc takes a product image URL and an actor slug. The AI creator presents the product in a chosen scenario (bathroom reaction, kitchen counter, car selfie, mirror selfie, etc.). No shipping the product to a creator, no $40 Fiverr gig, no waiting.',
      },
      {
        q: 'How many ads can I generate to test winning products?',
        a: 'On the Creator plan ($39/mo, 3,900 credits) about 13 ten-second ads per month. Pro Plus ($129/mo, 12,900 credits) does about 43. Pay-as-you-go credits are $39 per 3,900-credit pack and never expire — ideal for testing burst.',
      },
      {
        q: 'Does the API support batch generation from a CSV?',
        a: 'Yes. Loop through your rows from any language; the API is stateless. The CLI also has --json output for shell-script batch automation.',
      },
      {
        q: 'Can I generate ads in multiple languages for international markets?',
        a: 'Yes. Pass --dub-language with a BCP-47 code (es, fr, de, pt, ja, etc.) and the API generates a native-voiced version. Or write per-language scripts manually for tighter control over local idioms.',
      },
      {
        q: 'How do I avoid the "AI-generated look" that hurts ad performance?',
        a: 'Use templates that match real UGC patterns (bathroom-reaction, mirror-selfie, car-selfie). Pair with acting-style flags (shocked, excited, weird-hook). Stick to 9:16 aspect ratio. Keep clips at 10 seconds or less for highest hook strength on Meta and TikTok algorithms.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'coaches',
    personaLabel: 'Coaches & Creators',
    heroH1Accent: 'Coaches & Creators',
    heroH1: 'AI UGC Ads For Coaches & Creators.',
    heroSubhead:
      'Build a content pipeline that ships testimonials, hooks, and offer ads for your coaching business — without a camera or production crew. Pick an AI actor, write the script, get a finished UGC MP4 in 2 minutes. From $3 per video.',
    metaTitle: 'AI UGC for Coaches & Creators — agent-media',
    metaDescription:
      'Generate UGC video ads for coaches, course creators, and personal brands. 200+ AI actors, $3/video, REST API + CLI. Skip the camera, ship the offer.',
    keywords: [
      'ai ugc coach',
      'ugc for coaches',
      'course creator ads',
      'personal brand ai video',
      'testimonial video ai',
      'cheap content for coaches',
    ],
    scenarios: [
      {
        title: 'Daily story-style hooks',
        desc: 'Pre-write 30 hooks for the month, batch-generate via CLI, schedule one per day on TikTok and Reels.',
      },
      {
        title: 'Multi-actor variation',
        desc: 'Same script, 5 different actors, pick the demographic that resonates with your audience. agent-media has actors across age, gender, ethnicity, accent.',
      },
      {
        title: 'Offer launch creatives',
        desc: 'Course launching? Generate a 15-second pitch from each angle (problem-solution, before-after, testimonial-style) — split-test on paid traffic.',
      },
    ],
    codeExample: {
      title: 'launch-week.sh',
      lang: 'bash',
      code: `#!/bin/bash
# Generate 5 launch-week ads with different actors
for actor in sofia adaeze marcus naomi mei; do
  agent-media ugc \\
    "Stop trading hours for dollars. My students earn $5K months without sales calls." \\
    --actor "$actor" \\
    --duration 10 \\
    --style hormozi \\
    --tone confident \\
    --sync \\
    --json | jq -r '.video_url' >> launch-urls.txt
done
echo "5 ads queued. URLs saved to launch-urls.txt"`,
    },
    faq: [
      {
        q: 'Can I generate UGC ads for my coaching offer without filming myself?',
        a: 'Yes. agent-media has 200+ AI actors. Pick one whose tone fits your brand, write the script, get a finished 9:16 UGC video. No camera, no editing, no studio.',
      },
      {
        q: 'How is this different from hiring a UGC creator on Fiverr?',
        a: 'Cost: ~$3 per finished video vs $30-150 from a real creator. Speed: 2 minutes vs 3-7 days. Variety: 200+ actors vs whoever is available. Tradeoff: AI UGC works best for ad creative and short-form hooks; real-creator UGC still wins for high-budget brand campaigns where authenticity is the entire value prop.',
      },
      {
        q: 'Will my audience tell it\'s AI?',
        a: 'Modern AI UGC is convincing for 9:16 short-form but discerning audiences may notice. The win is volume + cost: generate 50 hooks, find the 2 that resonate, double down on those. For brand-anchor content where authenticity matters most, mix AI ads with real-creator hero pieces.',
      },
      {
        q: 'Do I need technical skills to use agent-media?',
        a: 'No. The web dashboard at agent-media.ai works without any code. The CLI is one npm command if you prefer terminal. The MCP server lets you generate ads from Claude Code conversations.',
      },
      {
        q: 'What\'s the cheapest plan to get started?',
        a: 'The $39/month Creator plan gives you 3,900 credits — about 13 ten-second videos. For testing, pay-as-you-go packs ($39 for 3,900 credits) never expire and let you trial without subscribing.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'b2b',
    personaLabel: 'B2B SaaS Marketing',
    heroH1Accent: 'B2B Marketing Teams',
    heroH1: 'AI UGC Ads For B2B Marketing Teams.',
    heroSubhead:
      'Scale top-of-funnel content for B2B SaaS without burning out your content team. Generate AI talking-head ads, product walkthroughs, and Show-Your-App creatives via REST API or MCP. Plans from $39/month with full developer stack included.',
    metaTitle: 'AI UGC for B2B SaaS Marketing — agent-media',
    metaDescription:
      'Programmatic UGC video for B2B SaaS marketing teams. REST API, TypeScript and Python SDKs, MCP server for Claude Code. Scale ads without scaling headcount.',
    keywords: [
      'b2b ai video',
      'b2b saas ugc',
      'enterprise ai video',
      'developer-first ad generation',
      'b2b marketing automation',
      'ai video api enterprise',
    ],
    scenarios: [
      {
        title: 'ABM creative at scale',
        desc: 'Account-based marketing? Generate one custom-script ad per target account from your CRM, send via outbound. CSV in, MP4s out.',
      },
      {
        title: 'Webinar promotion auto-pilot',
        desc: 'Each new webinar registers a pipeline that generates 5 promo ad variants and posts them to your social ad accounts on a schedule.',
      },
      {
        title: 'Sales-rep talking-head briefs',
        desc: 'Replace "watch this Loom" with "watch this 30-second AI-generated rep intro." 200+ actors, picked to match each prospect\'s region or industry.',
      },
    ],
    codeExample: {
      title: 'abm-pipeline.ts',
      lang: 'TypeScript',
      code: `import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({ apiKey: process.env.AGENT_MEDIA_API_KEY! });

// Each target account from your CRM gets a custom-script video
async function generateForAccount(account: { name: string; pain: string }) {
  const job = await client.submitVideo({
    actor_slug: 'marcus',
    script:
      \`\${account.name}, every B2B team I talk to says \` +
      \`\${account.pain}. Here's how we fix that in 3 minutes.\`,
    target_duration: 15,
    style: 'hormozi',
    webhook_url: 'https://yourapp.com/hooks/abm-video-ready',
  });
  return job.job_id;
}

// Loop through CRM. Webhook fires when each MP4 is ready.
const accounts = await crm.getTargetAccounts({ limit: 100 });
await Promise.all(accounts.map(generateForAccount));`,
    },
    faq: [
      {
        q: 'Is agent-media a good fit for B2B SaaS marketing?',
        a: 'For high-volume top-of-funnel content (ABM ads, retargeting, webinar promos, product walkthroughs) — yes. For high-budget brand-anchor campaigns where authenticity is the entire value prop, pair AI UGC with real-creator hero content.',
      },
      {
        q: 'Can our marketing engineer integrate this into our existing martech stack?',
        a: 'Yes. REST API, TypeScript and Python SDKs, MCP server, webhooks (HTTPS callback). Wires into HubSpot workflows, Customer.io campaigns, Segment, Vercel cron jobs, GitHub Actions.',
      },
      {
        q: 'What about brand voice consistency across many videos?',
        a: 'Use the persona feature: lock voice + face + tone into a saved persona, reuse it across every generation. Run agent-media persona create or pin an actor_slug consistently in your script.',
      },
      {
        q: 'Does this comply with our AI disclosure policy?',
        a: 'Most B2B AI disclosure policies allow AI-generated marketing video as long as it\'s not impersonating a specific real person and clearly identified as marketing. Check with your legal team. agent-media\'s actors are all-AI personas, not deepfakes of real people.',
      },
      {
        q: 'How does this compare to HeyGen or Synthesia for B2B?',
        a: 'HeyGen and Synthesia lead for long-form corporate (training, webinars, internal comms). agent-media leads for short-form UGC ads + programmatic generation. Many B2B teams use both: Synthesia for training, agent-media for performance ad creative.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'd2c-brands',
    personaLabel: 'D2C Brands',
    heroH1Accent: 'D2C Brands',
    heroH1: 'AI UGC Ads For D2C Brands.',
    heroSubhead:
      'Replace your $40-150 per video creator-marketplace bill with $3 per video AI UGC. Generate product reviews, unboxings, before/afters, and testimonials at the cadence Meta\'s algorithm rewards. From $39/month.',
    metaTitle: 'AI UGC Ads For D2C Brands — agent-media',
    metaDescription:
      'AI UGC for D2C consumer brands. Product reviews, unboxings, testimonials, before/afters — $3 per video. REST API + CLI for batch ad testing.',
    keywords: [
      'd2c ai video',
      'consumer brand ugc',
      'product review ai',
      'unboxing ai video',
      'cheap dtc ads',
      'meta ad creative ai',
    ],
    scenarios: [
      {
        title: 'Daily creative refresh',
        desc: 'Meta\'s algorithm punishes ad fatigue. Generate 5 fresh hooks per week per top-performing product, keep the cadence the algorithm wants.',
      },
      {
        title: 'New launch — 50 ad variants',
        desc: 'Big launch coming up? Pre-generate 50 angle/hook combinations across 10 actors. A/B test on paid traffic. Scale the 3 winners.',
      },
      {
        title: 'Influencer-style without the contract',
        desc: 'Pick AI actors that match each customer segment (Gen Z, millennial moms, fitness enthusiasts), have them present your product UGC-style.',
      },
    ],
    codeExample: {
      title: 'meta-creative-refresh.ts',
      lang: 'TypeScript',
      code: `import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({ apiKey: process.env.AGENT_MEDIA_API_KEY! });

// Refresh creative for top 5 products, 5 hooks each = 25 fresh ads/week
const products = await db.products.findTopPerforming({ limit: 5 });
const hooks = await llm.generateHooks({ products, perProduct: 5 });

for (const { product, hookList } of hooks) {
  for (const hook of hookList) {
    const v = await client.createProductActing({
      product_image_url: product.heroImageUrl,
      actor_slug: pickActorForSegment(product.segment),
      script: hook,
      template: 'mirror-selfie',
      acting_style: 'excited',
      duration: 10,
    });
    await metaAds.upload({ video_url: v.video_url, product_id: product.id });
  }
}`,
    },
    faq: [
      {
        q: 'Can AI UGC really compete with creator-marketplace UGC for D2C ads?',
        a: 'For mid- and lower-funnel paid social, yes. AI UGC wins on cost ($3 vs $40-150) and speed (2 min vs 3-7 days), which lets you test 10x more hooks. For brand-anchor hero content where authentic creator voice is the value prop, real UGC still wins.',
      },
      {
        q: 'How do I keep my ads from getting flagged by Meta as AI-generated?',
        a: 'Meta currently allows AI-generated marketing video as long as it doesn\'t impersonate a real person without consent. agent-media actors are all-AI personas, not deepfakes. Disclose AI assist in your ad copy if your jurisdiction requires it (EU AI Act, some US states).',
      },
      {
        q: 'What templates work best for D2C product ads?',
        a: 'For consumer products: mirror-selfie, bathroom-reaction, kitchen-counter, couch-review. Pair with acting styles "excited," "shocked," or "honest-review" depending on the product category. Beauty/skincare: bathroom-reaction. Food/beverage: kitchen-counter. Apparel: mirror-selfie.',
      },
      {
        q: 'Can I generate hundreds of ads cost-effectively?',
        a: 'Yes. The Pro Plus plan ($129/mo, 12,900 credits) handles ~43 ten-second videos. For larger volume, pay-as-you-go credit packs are $39 per 3,900 credits, never expire. Batch through the CLI or run a CSV-to-API pipeline.',
      },
      {
        q: 'How do I integrate this with Shopify, Klaviyo, or Meta Ads Manager?',
        a: 'agent-media outputs MP4 URLs hosted on R2 — they work directly as Meta video sources, Klaviyo email video, or Shopify product page hero videos. Use webhooks to fire post-generation events into your stack.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
  // ────────────────────────────────────────────────────────────────────
  {
    slug: 'developers',
    personaLabel: 'Developers',
    heroH1Accent: 'Developers',
    heroH1: 'AI UGC Generation, Built For Developers.',
    heroSubhead:
      'Skip the dashboards. Generate AI UGC video ads from your terminal, code, or AI agent. REST API on $39/month, CLI with 30 commands, TypeScript + Python SDKs, MCP server for Claude Code, webhooks. Apache-2.0.',
    metaTitle: 'AI UGC For Developers — agent-media',
    metaDescription:
      'Developer-first AI UGC video platform. REST API, CLI, TypeScript + Python SDKs, MCP server. $39/mo with full stack. Apache-2.0 SDKs.',
    keywords: [
      'ai video for developers',
      'developer-first ugc',
      'ugc api developer',
      'ai video sdk',
      'mcp ugc',
      'cli ugc generation',
    ],
    scenarios: [
      {
        title: 'CI/CD ad refresh',
        desc: 'GitHub Action calls /v1/generate/ugc_video on every product copy change. Webhook posts the URL to your Slack #marketing channel.',
      },
      {
        title: 'AI-agent-driven generation',
        desc: 'Add @agentmedia/mcp-server to Claude Code. Tell your assistant "make 10 launch ad variants" — it writes, generates, and reports URLs back into your editor.',
      },
      {
        title: 'In-product video generation',
        desc: 'Let your customers click "make a UGC ad of this" in your dashboard. Use webhook callbacks to deliver the finished MP4 back to their account.',
      },
    ],
    codeExample: {
      title: 'github-action.yml',
      lang: 'YAML',
      code: `name: Generate ad on copy change
on:
  push:
    paths: ['marketing/copy.md']

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g agent-media-cli
      - run: |
          SCRIPT=$(cat marketing/copy.md)
          agent-media ugc "$SCRIPT" \\
            --actor sofia \\
            --duration 10 \\
            --style hormozi \\
            --webhook-url \${{ secrets.MARKETING_WEBHOOK }}
        env:
          AGENT_MEDIA_API_KEY: \${{ secrets.AGENT_MEDIA_API_KEY }}`,
    },
    faq: [
      {
        q: 'Is there an AI UGC video API I can use as a developer?',
        a: 'Yes. agent-media has a production REST API at https://api.agent-media.ai/v1/generate/ugc_video, native TypeScript SDK (@agentmedia/sdk on npm), Python SDK (agent-media on PyPI), 30-command CLI, and an MCP server (@agentmedia/mcp-server) for Claude Code, Cursor, and Windsurf. Available on the $39/month Creator plan.',
      },
      {
        q: 'Are the SDKs and CLI open source?',
        a: 'Yes. Apache-2.0. Source on GitHub. PRs welcome. The TypeScript SDK, Python SDK, CLI, and MCP server are all open packages on npm and PyPI.',
      },
      {
        q: 'Does the API support webhooks?',
        a: 'Yes. Pass webhook_url in any submit call. agent-media POSTs a job-completion event to that HTTPS endpoint when the video is ready. URLs are SSRF-validated.',
      },
      {
        q: 'How do I integrate with Claude Code, Cursor, or Windsurf?',
        a: 'Add the agent-media MCP block to your client\'s MCP config (~/.claude.json or equivalent). One tool becomes available, make_ugc, which turns a script (plus an optional person, image, or saved character) into a finished vertical video. Your AI assistant can then generate UGC ads directly from conversations.',
      },
      {
        q: 'What\'s the rate limit?',
        a: '10 generate requests per minute, 60 read requests per minute, keyed on user ID inside the JWT or API key. Higher limits available on enterprise plans.',
      },
    ],
    datePublished: '2026-05-06',
    dateModified: '2026-05-06',
  },
];

/** Helper for sitemap.ts and indexnow route. */
export const FOR_VERTICAL_SLUGS = FOR_VERTICALS.map((v) => v.slug);

export function findVertical(slug: string): ForVertical | undefined {
  return FOR_VERTICALS.find((v) => v.slug === slug);
}
