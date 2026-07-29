// Copyright 2026 agent-media contributors. Apache-2.0 license.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title:
    'MCP Server for AI Video Generation: Use agent-media in Claude Code and Cursor',
  description:
    'Install the agent-media MCP server to generate AI UGC videos directly from Claude Code, Cursor, and Windsurf. Three tools: create_video, list_actors, get_video_status.',
  keywords: [
    'mcp server video generation',
    'mcp server for video',
    'claude code video',
    'cursor video generation',
    'model context protocol video',
    'ai video mcp',
    'agent-media mcp server',
    'windsurf video generation',
    'mcp server ai',
    'ai ugc mcp',
  ],
  openGraph: {
    title:
      'MCP Server for AI Video Generation: Use agent-media in Claude Code and Cursor',
    description:
      'Install the agent-media MCP server to generate AI UGC videos directly from Claude Code, Cursor, and Windsurf.',
    type: 'article',
    url: 'https://agent-media.ai/blog/mcp-server-ai-video-generation',
    publishedTime: '2026-04-14T00:00:00Z',
  },
  alternates: {
    canonical:
      'https://agent-media.ai/blog/mcp-server-ai-video-generation',
  },
};

/* -- JSON-LD --------------------------------------------------------- */

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline:
    'MCP Server for AI Video Generation: Use agent-media in Claude Code and Cursor',
  description:
    'Install the agent-media MCP server to generate AI UGC videos directly from Claude Code, Cursor, and Windsurf.',
  datePublished: '2026-04-14T00:00:00Z',
  author: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  publisher: {
    '@type': 'Organization',
    name: 'agent-media',
    url: 'https://agent-media.ai',
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://agent-media.ai/blog/mcp-server-ai-video-generation',
  },
};

/* -- Page ------------------------------------------------------------ */

export default function McpServerAiVideoGenerationPage() {
  return (
    <article className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 sm:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* -- Hero ------------------------------------------------------ */}
      <header className="rounded-lg bg-[#ededed] px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex items-center gap-3 text-sm text-[#6b6b76]">
          <Link href="/blog" className="hover:text-[#121212]">
            Blog
          </Link>
          <span>/</span>
          <time dateTime="2026-04-14">April 14, 2026</time>
          <span className="ml-auto">8 min read</span>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-[#121212] sm:text-4xl lg:text-5xl">
          MCP Server for AI Video Generation: Use agent-media in Claude Code
          and Cursor
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-[#6b6b76]">
          The agent-media MCP server lets your AI coding assistant create UGC
          videos, browse actors, and check render status — without leaving your
          editor. Install it in Claude Code, Cursor, or Windsurf and generate
          videos with natural language.
        </p>
      </header>

      {/* -- What is MCP? ---------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          What is MCP?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          MCP stands for Model Context Protocol. It is an open standard that
          lets AI coding assistants — like Claude Code, Cursor, and Windsurf —
          use external tools. Instead of copy-pasting API keys and writing
          fetch calls, you install an MCP server and your AI assistant can call
          it directly. Think of it as a plugin system for AI tools.
        </p>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          When you install an MCP server, your assistant gets access to new
          capabilities. It can read the tool descriptions, understand the
          parameters, and call the tools on your behalf. You just describe what
          you want in plain English.
        </p>
      </section>

      {/* -- What is the agent-media MCP server? ----------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          What is the agent-media MCP server?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The agent-media MCP server exposes three tools that let your AI
          assistant interact with the agent-media video generation API:
        </p>
        <div className="mt-6 space-y-4">
          {[
            {
              name: 'create_video',
              desc: 'Generate a UGC video with a specific actor, script, and optional settings like subtitle style and duration.',
            },
            {
              name: 'list_actors',
              desc: 'Browse all available AI actors with their names, genders, and preview images. Your assistant can help you pick the right one.',
            },
            {
              name: 'get_video_status',
              desc: 'Check the status of a video render. Returns the current state (queued, processing, completed, failed) and the download URL when ready.',
            },
          ].map((tool) => (
            <div
              key={tool.name}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="font-mono text-sm font-bold text-[#121212]">
                {tool.name}
              </p>
              <p className="mt-2 text-sm text-[#6b6b76] leading-relaxed">
                {tool.desc}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          That is all you need. Three tools cover the full workflow: pick an
          actor, create a video, and poll until it is done.
        </p>
      </section>

      {/* -- How to install -------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          How to install the MCP server
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The MCP server is published as an npm package. You do not need to
          clone anything — your AI assistant downloads and runs it
          automatically via{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            npx
          </code>
          . All you need is your agent-media API key, which you can get from
          the{' '}
          <Link
            href="/settings"
            className="text-[#121212] underline hover:text-[#6b6b76]"
          >
            settings page
          </Link>
          .
        </p>

        {/* Claude Code */}
        <h3 className="mt-8 text-lg font-bold text-[#121212]">Claude Code</h3>
        <p className="mt-3 text-sm text-[#6b6b76] leading-relaxed">
          Add this to your{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            ~/.claude/settings.json
          </code>{' '}
          file:
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg bg-[#0d0d0d] p-5">
          <pre className="font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": {
        "AGENT_MEDIA_API_KEY": "ma_YOUR_KEY"
      }
    }
  }
}`}
          </pre>
        </div>

        {/* Cursor */}
        <h3 className="mt-8 text-lg font-bold text-[#121212]">Cursor</h3>
        <p className="mt-3 text-sm text-[#6b6b76] leading-relaxed">
          Open Cursor Settings, go to MCP, click &quot;Add new MCP server&quot;,
          and paste:
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg bg-[#0d0d0d] p-5">
          <pre className="font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": {
        "AGENT_MEDIA_API_KEY": "ma_YOUR_KEY"
      }
    }
  }
}`}
          </pre>
        </div>

        {/* Windsurf */}
        <h3 className="mt-8 text-lg font-bold text-[#121212]">Windsurf</h3>
        <p className="mt-3 text-sm text-[#6b6b76] leading-relaxed">
          Open Windsurf Settings, navigate to MCP configuration, and add:
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg bg-[#0d0d0d] p-5">
          <pre className="font-mono text-sm leading-relaxed text-[#e0e0e0]">
{`{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "@agentmedia/mcp-server"],
      "env": {
        "AGENT_MEDIA_API_KEY": "ma_YOUR_KEY"
      }
    }
  }
}`}
          </pre>
        </div>

        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          Replace{' '}
          <code className="rounded bg-[#f0f0f3] px-1.5 py-0.5 text-sm">
            ma_YOUR_KEY
          </code>{' '}
          with your actual API key. Restart your editor after saving. The MCP
          server will start automatically when your AI assistant needs it.
        </p>
      </section>

      {/* -- Example usage --------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Example: generate a video with one sentence
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Once the MCP server is installed, you can ask your AI assistant to
          create videos in natural language. Here is a real example:
        </p>
        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white p-5">
          <p className="text-sm font-semibold text-[#121212]">You:</p>
          <p className="mt-2 text-sm text-[#6b6b76] leading-relaxed italic">
            &quot;Make a 10-second UGC video about Postiz with actor sofia&quot;
          </p>
        </div>

        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          Here is what your AI assistant does behind the scenes:
        </p>
        <ol className="mt-6 space-y-3">
          {[
            {
              step: 'Calls list_actors',
              desc: 'Finds the actor named "sofia" and confirms she is available.',
            },
            {
              step: 'Writes a script',
              desc: 'Generates a natural-sounding 10-second script about Postiz based on your prompt.',
            },
            {
              step: 'Calls create_video',
              desc: 'Sends the script, actor ID, and duration to the agent-media API. Returns a video ID.',
            },
            {
              step: 'Polls get_video_status',
              desc: 'Checks the render status every few seconds until the video is complete.',
            },
            {
              step: 'Returns the URL',
              desc: 'Gives you a direct download link to the finished MP4 file.',
            },
          ].map((item, i) => (
            <li key={item.step} className="flex items-start gap-3 text-[#6b6b76]">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#121212] text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <strong className="text-[#121212]">{item.step}.</strong>{' '}
                {item.desc}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-[#6b6b76] leading-relaxed">
          The entire process takes about 60 seconds. You type one sentence and
          get back a finished video. No API docs, no boilerplate code, no
          manual HTTP requests.
        </p>

        <div className="mt-6 rounded-lg border border-[#d4d4d4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#d4d4d4] px-4 py-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <div className="space-y-1 p-5 font-mono text-sm">
            <p className="text-[#6b6b76]">
              <span className="text-[#121212] font-semibold">Assistant:</span>{' '}
              I found actor &quot;Sofia&quot; (ID: sofia-01). Let me create the video.
            </p>
            <p className="mt-2 text-[#6b6b76]">
              <span className="text-[#121212] font-semibold">Tool call:</span>{' '}
              create_video(actor: &quot;sofia-01&quot;, script: &quot;...&quot;, duration: 10)
            </p>
            <p className="mt-2 text-[#6b6b76]">
              <span className="text-[#121212] font-semibold">Tool call:</span>{' '}
              get_video_status(id: &quot;vid_abc123&quot;) → processing...
            </p>
            <p className="text-[#6b6b76]">
              <span className="text-[#121212] font-semibold">Tool call:</span>{' '}
              get_video_status(id: &quot;vid_abc123&quot;) → completed
            </p>
            <p className="mt-2 text-[#121212]">
              Your video is ready: https://agent-media.ai/v/vid_abc123
            </p>
          </div>
        </div>
      </section>

      {/* -- Why MCP over raw API? ------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Why MCP over the raw API?
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          agent-media has a full REST API. You can call it directly with fetch
          or curl. But the MCP server adds a layer that makes the workflow
          significantly better for developers who use AI assistants:
        </p>
        <div className="mt-6 space-y-4">
          {[
            {
              title: 'Natural language interface',
              desc: 'Say "make a video about X with actor Y" instead of constructing JSON payloads and managing auth headers.',
            },
            {
              title: 'No boilerplate',
              desc: 'The MCP server handles authentication, request formatting, error handling, and response parsing. You never write a single line of integration code.',
            },
            {
              title: 'Automatic polling',
              desc: 'Your AI assistant polls get_video_status automatically and waits for the render to finish. No manual status checking.',
            },
            {
              title: 'Actor discovery',
              desc: 'Ask your assistant to "list all female actors" or "find an actor that looks professional" and it will browse the catalog for you.',
            },
            {
              title: 'Context-aware scripts',
              desc: 'Your assistant can read your project files, understand your product, and write video scripts that match your brand voice — all in one step.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-[#d4d4d4] bg-white p-5"
            >
              <p className="text-sm font-bold text-[#121212]">{item.title}</p>
              <p className="mt-2 text-sm text-[#6b6b76] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* -- Available tools table ------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          Available tools reference
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          Here is the full list of tools exposed by the agent-media MCP server,
          with their parameters and descriptions.
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg border border-[#d4d4d4]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#d4d4d4] bg-[#f0f0f3]">
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Tool
                </th>
                <th className="px-4 py-3 font-mono font-semibold text-[#121212]">
                  Parameters
                </th>
                <th className="px-4 py-3 font-semibold text-[#121212]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#d4d4d4]">
                <td className="px-4 py-3 font-mono text-[#121212]">
                  create_video
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#6b6b76]">
                  actor, script, duration?, subtitle_style?
                </td>
                <td className="px-4 py-3 text-[#6b6b76]">
                  Start a new video render with the specified actor and script.
                  Returns a video ID for status polling.
                </td>
              </tr>
              <tr className="border-b border-[#d4d4d4]">
                <td className="px-4 py-3 font-mono text-[#121212]">
                  list_actors
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#6b6b76]">
                  gender?, search?
                </td>
                <td className="px-4 py-3 text-[#6b6b76]">
                  List all available AI actors. Optionally filter by gender or
                  search by name.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-[#121212]">
                  get_video_status
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#6b6b76]">
                  video_id
                </td>
                <td className="px-4 py-3 text-[#6b6b76]">
                  Check the current render status. Returns state (queued,
                  processing, completed, failed) and the download URL when done.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* -- Use cases ------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold text-[#121212]">
          What developers are building with it
        </h2>
        <p className="mt-4 text-[#6b6b76] leading-relaxed">
          The MCP server is useful anywhere a developer wants to generate video
          content as part of their workflow:
        </p>
        <ul className="mt-4 space-y-2">
          {[
            'Generating product demo videos while building features',
            'Creating UGC ad variations for A/B testing campaigns',
            'Building video content pipelines in CI/CD',
            'Producing onboarding videos for new product features',
            'Generating changelog videos from git commit history',
            'Creating social media content batches from a spreadsheet of scripts',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[#6b6b76]">
              <span className="mt-1 text-[#121212]">*</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* -- CTA ------------------------------------------------------- */}
      <section className="mt-20 rounded-lg border border-[#121212]/30 bg-[#121212]/5 p-8 text-center">
        <h2 className="text-2xl font-bold text-[#121212]">
          Start generating videos from your editor
        </h2>
        <p className="mt-3 text-[#6b6b76]">
          Install the MCP server, get your API key, and create your first video
          in under a minute.
        </p>
        <div className="mt-6 overflow-x-auto rounded-lg bg-[#0d0d0d] px-6 py-3 text-left font-mono text-sm text-[#e0e0e0]">
          npx -y @agentmedia/mcp-server
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/login">
            <Button size="lg">
              <Plug className="mr-2 h-4 w-4" />
              Get API Key
            </Button>
          </Link>
          <Link href="/integrations">
            <Button variant="secondary" size="lg">
              View Integrations <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-[#6b6b76]">
          <a
            href="https://www.npmjs.com/package/@agentmedia/mcp-server"
            className="hover:text-[#121212]"
            target="_blank"
            rel="noopener noreferrer"
          >
            npm package
          </a>
          <a
            href="https://mcp.so/server/agent-media"
            className="hover:text-[#121212]"
            target="_blank"
            rel="noopener noreferrer"
          >
            MCP Registry
          </a>
          <Link href="/integrations" className="hover:text-[#121212]">
            Integrations
          </Link>
        </div>
      </section>
    </article>
  );
}
