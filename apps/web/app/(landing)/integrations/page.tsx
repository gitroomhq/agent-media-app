// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Integrations — API, SDK, CLI, MCP Server | agent-media',
  description: 'Every way to integrate agent-media into your product. REST API, TypeScript SDK, Python SDK, CLI, MCP server, OpenAPI spec, webhooks.',
  keywords: ['agent-media API', 'video generation SDK', 'UGC API', 'MCP server', 'video CLI', 'OpenAPI'],
  openGraph: {
    title: 'agent-media Integrations — Build with AI Video',
    description: 'REST API, SDKs, CLI, MCP server, OpenAPI spec, webhooks.',
    type: 'website',
    url: 'https://agent-media.ai/integrations',
  },
  alternates: { canonical: 'https://agent-media.ai/integrations' },
};

function Code({ children }: { children: string }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-[#d4d4d4] bg-[#0d0d0d]">
      <pre className="p-4 text-sm leading-relaxed">
        <code className="text-gray-300">{children.trim()}</code>
      </pre>
    </div>
  );
}

const INTEGRATIONS = [
  {
    id: 'rest-api',
    title: 'REST API',
    desc: 'Full programmatic access. Submit generation jobs, poll status, list actors. OpenAPI 3.1 spec included.',
    install: '',
    example: `curl -X POST .../v1/generate/ugc_video \\
  -H "Authorization: Bearer ma_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"script": "Your script here...", "actor_slug": "sofia", "tone": "energetic"}'`,
    links: [
      { label: 'Interactive Docs', href: '/docs/api-reference' },
      { label: 'OpenAPI Spec', href: '/openapi.json' },
    ],
  },
  {
    id: 'typescript-sdk',
    title: 'TypeScript SDK',
    desc: 'Typed client with createVideo() that polls until complete. Works in Node.js and Edge runtimes.',
    install: 'npm install @agentmedia/sdk',
    example: `import { AgentMedia } from '@agentmedia/sdk';

const client = new AgentMedia({ apiKey: 'ma_YOUR_KEY' });
const video = await client.createVideo({
  script: 'Your script here...',
  actor_slug: 'sofia',
  tone: 'energetic',
});
console.log(video.video_url);`,
    links: [
      { label: 'npm', href: 'https://www.npmjs.com/package/@agentmedia/sdk' },
    ],
  },
  {
    id: 'python-sdk',
    title: 'Python SDK',
    desc: 'Sync and async clients. Works with FastAPI, Django, Flask, or standalone scripts.',
    install: 'pip install agent-media',
    example: `from agent_media import AgentMedia

client = AgentMedia(api_key="ma_YOUR_KEY")
video = client.create_video(
    script="Your script here...",
    actor_slug="sofia",
    tone="energetic",
)
print(video["video_url"])`,
    links: [
      { label: 'PyPI', href: 'https://pypi.org/project/agent-media/' },
    ],
  },
  {
    id: 'cli',
    title: 'CLI',
    desc: 'Generate videos from your terminal. Pipe scripts, integrate with shell workflows, automate with cron.',
    install: 'npm install -g agent-media-cli',
    example: `agent-media ugc "Stop scrolling. This tool changed everything." \\
  --actor sofia --style hormozi --duration 10 --sync`,
    links: [
      { label: 'npm', href: 'https://www.npmjs.com/package/agent-media-cli' },
      { label: 'CLI Docs', href: '/docs' },
    ],
  },
  {
    id: 'mcp-server',
    title: 'MCP Server',
    desc: 'Use agent-media from Claude Code, Cursor, or Windsurf. Three tools: create_video, list_actors, get_video_status.',
    install: '',
    example: `// Add to ~/.claude/settings.json
{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": { "AGENT_MEDIA_API_KEY": "ma_YOUR_KEY" }
    }
  }
}`,
    links: [
      { label: 'npm', href: 'https://www.npmjs.com/package/@agentmedia/mcp-server' },
      { label: 'MCP Registry', href: 'https://registry.modelcontextprotocol.io' },
    ],
  },
  {
    id: 'openapi',
    title: 'OpenAPI Spec',
    desc: 'Auto-generate SDKs in any language, import into Postman or Insomnia, build custom integrations.',
    install: '',
    example: `# Download the spec
curl https://agent-media.ai/openapi.json -o openapi.json

# Generate a Go client
npx @openapitools/openapi-generator-cli generate \\
  -i openapi.json -g go -o ./go-client

# Import into Postman: File > Import > paste the URL`,
    links: [
      { label: 'Download Spec', href: '/openapi.json' },
      { label: 'Interactive Docs', href: '/docs/api-reference' },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    desc: 'Get notified when videos complete. No polling. HTTPS only, 3x retry with exponential backoff.',
    install: '',
    example: `// Pass webhook_url when generating:
{ "script": "...", "webhook_url": "https://your-app.com/api/video-ready" }

// We POST when done:
{ "job_id": "uuid", "status": "completed", "video_url": "https://...mp4" }

// Or on failure:
{ "job_id": "uuid", "status": "failed", "error_message": "..." }`,
    links: [
      { label: 'Webhook Docs', href: '/docs/api-reference#webhooks' },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-[#ededed] pb-16 pt-12 sm:pb-20 sm:pt-16">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm uppercase tracking-widest text-[#6b6b76]">Developer</p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[#121212] sm:text-5xl">
            Integrations
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#6b6b76]">
            Every way to generate AI videos from your code. REST API, TypeScript &amp; Python SDKs,
            CLI, MCP server for AI agents, OpenAPI spec, and webhooks.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
            {INTEGRATIONS.map((i) => (
              <a
                key={i.id}
                href={`#${i.id}`}
                className="rounded-full border border-[#121212]/10 bg-white px-4 py-1.5 font-medium text-[#121212] transition-colors hover:bg-[#121212] hover:text-white"
              >
                {i.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Integration sections */}
      {INTEGRATIONS.map((integration, idx) => (
        <section
          key={integration.id}
          id={integration.id}
          className={`border-t border-[#d4d4d4] py-16 ${idx % 2 === 1 ? 'bg-[#f7f7f8]' : ''}`}
        >
          <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8">
            <div className="lg:flex lg:gap-12">
              {/* Left: description */}
              <div className="lg:w-1/3">
                <h2 className="text-2xl font-bold text-[#121212]">{integration.title}</h2>
                <p className="mt-3 text-[#6b6b76]">{integration.desc}</p>

                {integration.install && (
                  <div className="mt-4 inline-block rounded-lg border border-[#d4d4d4] bg-[#0d0d0d] px-4 py-2">
                    <code className="text-sm text-green-400">{integration.install}</code>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {integration.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target={link.href.startsWith('http') ? '_blank' : undefined}
                      rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="text-sm font-medium text-[#121212] underline underline-offset-2 hover:text-[#6b6b76]"
                    >
                      {link.label} &rarr;
                    </a>
                  ))}
                </div>
              </div>

              {/* Right: code example */}
              <div className="mt-6 lg:mt-0 lg:w-2/3">
                <Code>{integration.example}</Code>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Build Your Own CTA */}
      <section className="border-t border-[#d4d4d4] bg-[#121212] py-16">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-white">Build Your Own Integration</h2>
          <p className="mx-auto mt-3 max-w-lg text-[#a0a0a0]">
            Our OpenAPI spec lets you auto-generate an SDK in any language. Download the spec
            and use openapi-generator to create a client for Go, Ruby, PHP, Java, or anything else.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/openapi.json"
              download
              className="inline-flex items-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-[#121212] transition-colors hover:bg-[#f0f0f0]"
            >
              Download OpenAPI Spec
            </a>
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              View API Docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
