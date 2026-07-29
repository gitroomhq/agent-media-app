// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Public connect guide — higgsfield.ai/{mcp,cli,skills}-style. A big hero
 * headline that reflects the selected target, MCP / CLI / Skill tabs + a
 * per-client selector (MCP), and path-based routing (/mcp, /cli, /skills).
 * All commands are REAL, verified agent-media connect methods.
 */

import { useEffect, useState } from 'react';
import { Check, Copy, Terminal, FileText, Server, ExternalLink } from 'lucide-react';
import { ClaudeIcon, CursorIcon, AnthropicIcon, OpenAIIcon } from '@/components/brand-icons';

type Surface = 'mcp' | 'cli' | 'skill';
type Client = 'claude-code' | 'cursor' | 'claude-desktop' | 'codex';

const PATHS: Record<Surface, string> = { mcp: '/mcp', cli: '/cli', skill: '/skills' };
const CLIENT_LABEL: Record<Client, string> = { 'claude-code': 'Claude Code', cursor: 'Cursor', 'claude-desktop': 'Claude Desktop', codex: 'Codex' };
const CLIENT_HERO: Record<Client, string> = { 'claude-code': 'Claude Code', cursor: 'Cursor', 'claude-desktop': 'Claude', codex: 'Codex' };

const MCP_JSON = `{
  "mcpServers": {
    "agent-media": {
      "command": "npx",
      "args": ["-y", "-p", "@agentmedia/mcp-server@latest", "agent-media-mcp"],
      "env": { "AGENT_MEDIA_API_KEY": "ma_..." }
    }
  }
}`;

// Codex reads MCP servers from ~/.codex/config.toml (TOML, not JSON).
const CODEX_TOML = `[mcp_servers.agent-media]
command = "npx"
args = ["-y", "-p", "@agentmedia/mcp-server@latest", "agent-media-mcp"]
env = { AGENT_MEDIA_API_KEY = "ma_..." }`;

// Single-pass, non-overlapping highlighter for our (static, author-controlled)
// shell + JSON snippets. Strings green, comments gray, commands violet, flags blue.
function highlight(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|(#.*$)|(\b(?:npx|npm|claude|curl)\b)|(\bagent-media(?:-mcp|-cli)?\b)|(--?[A-Za-z][\w-]*)|([{}\[\],])/gm,
    (m, str, colon, cmt, cmd, brand, flag, punct) => {
      if (str) {
        // A string followed by ":" is a JSON key (cyan); otherwise a value (green).
        if (colon) return `<span style='color:#56B6F2'>${str}</span><span style='color:#8B98A8'>${colon}</span>`;
        return `<span style='color:#98C379'>${str}</span>`;
      }
      if (cmt) return `<span style='color:#6B7280'>${cmt}</span>`;
      if (cmd) return `<span style='color:#E5C07B'>${cmd}</span>`;      // commands: amber
      if (brand) return `<span style='color:#C4B5FD'>${brand}</span>`;  // agent-media: violet
      if (flag) return `<span style='color:#61AFEF'>${flag}</span>`;    // flags: blue
      if (punct) return `<span style='color:#8B98A8'>${punct}</span>`;  // braces/commas: muted
      return m;
    },
  );
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3" style={{ background: '#08080B', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8 }}>
      <pre className="overflow-x-auto px-3.5 py-3 pr-10 text-[12.5px] leading-relaxed font-mono whitespace-pre-wrap" style={{ color: '#C9D1D9' }} dangerouslySetInnerHTML={{ __html: highlight(text) }} />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center text-white/55 transition-colors hover:bg-white/10 hover:text-white" style={{ borderRadius: 6 }} aria-label="Copy">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-7 w-7 items-center justify-center text-[12px] font-semibold text-white/70" style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6 }}>{n}</span>
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      </div>
      <div className="mt-2 text-[13.5px] leading-relaxed text-white/65">{children}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium transition-colors ${active ? 'bg-white text-black' : 'text-white/65 hover:text-white'}`}
      style={{ borderRadius: 6 }}>
      {children}
    </button>
  );
}

export function ConnectGuide({ initialTab = 'skill', initialClient = 'claude-code', routePaths = true }: { initialTab?: Surface; initialClient?: Client; routePaths?: boolean }) {
  const [surface, setSurface] = useState<Surface>(initialTab);
  const [client, setClient] = useState<Client>(initialClient);

  useEffect(() => {
    // Inside the dashboard (routePaths=false) the guide is self-contained:
    // tabs switch via state only and must NOT push the public /mcp /cli /skills
    // URLs (that would navigate the user out to the marketing site).
    if (!routePaths) return;
    const sync = () => {
      const p = window.location.pathname;
      if (p === '/cli') setSurface('cli');
      else if (p === '/skills') setSurface('skill');
      else if (p === '/mcp' || p.startsWith('/mcp/')) {
        setSurface('mcp');
        // Client lives in the path now (/mcp/<client>), not a query param.
        const seg = p.split('/')[2];
        if (seg === 'claude-code' || seg === 'cursor' || seg === 'claude-desktop' || seg === 'codex') setClient(seg);
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [routePaths]);

  const pick = (s: Surface) => {
    setSurface(s);
    if (!routePaths) return;
    // MCP keeps a full-path client segment (/mcp/<client>) — no query string.
    const url = s === 'mcp' ? `${PATHS.mcp}/${client}` : PATHS[s];
    try { window.history.pushState(null, '', url); } catch { /* ignore */ }
  };
  const pickClient = (c: Client) => {
    setClient(c);
    if (!routePaths) return;
    try { window.history.pushState(null, '', `${PATHS.mcp}/${c}`); } catch { /* ignore */ }
  };

  const heroName = surface === 'mcp' ? CLIENT_HERO[client] : 'your agent';
  const CLIENTS: { id: Client; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
    { id: 'claude-code', label: 'Claude Code', icon: ClaudeIcon, color: '#D97757' },
    { id: 'cursor', label: 'Cursor', icon: CursorIcon, color: '#7DD3FC' },
    { id: 'claude-desktop', label: 'Claude Desktop', icon: AnthropicIcon, color: '#D97757' },
    { id: 'codex', label: 'Codex', icon: OpenAIIcon, color: '#10A37F' },
  ];

  return (
    <div>
      {/* Hero */}
      <div className="text-center">
        <h1 className="mx-auto max-w-2xl text-[34px] font-normal sm:text-5xl lg:text-6xl"
          style={{ color: 'var(--cryptix-text)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Turn {heroName} into a creative engine
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: 'var(--cryptix-text-muted)' }}>
          Connect agent-media to Claude Code, Cursor, and Claude Desktop — and generate lip-synced UGC videos right from your chat - add captions when you want them.
        </p>
      </div>

      {/* Tabs (left) + client selector (right, brand-colored) */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="inline-flex p-1" style={{ background: '#08080B', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}>
          <Tab active={surface === 'mcp'} onClick={() => pick('mcp')}><Server className="h-3.5 w-3.5" /> MCP</Tab>
          <Tab active={surface === 'cli'} onClick={() => pick('cli')}><Terminal className="h-3.5 w-3.5" /> CLI</Tab>
          <Tab active={surface === 'skill'} onClick={() => pick('skill')}><FileText className="h-3.5 w-3.5" /> Skill</Tab>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {surface === 'mcp' && (
            <div className="inline-flex flex-wrap p-1" style={{ background: '#08080B', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}>
              {CLIENTS.map((c) => {
                const isActive = client === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => pickClient(c.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-all"
                    style={{
                      borderRadius: 6,
                      background: isActive ? `${c.color}22` : 'transparent',
                      boxShadow: isActive ? `inset 0 0 0 1px ${c.color}` : 'none',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}>
                    <c.icon className="h-3.5 w-3.5" style={{ color: c.color }} /> {c.label}
                  </button>
                );
              })}
            </div>
          )}
          <a href="https://github.com/gitroomhq/agent-media" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-white/55 hover:text-white">
            GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Panel */}
      <div className="mt-4 grid grid-cols-1 gap-7 p-5 sm:p-6 md:grid-cols-3" style={{ background: '#17171D', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        {surface === 'skill' && (
          <>
            <Step n={1} title="Add the skills">One command pulls every agent-media skill into your agent.<Code text="npx skills add gitroomhq/agent-media" /></Step>
            <Step n={2} title="Sign in">Connect your account so the skills can run jobs.<Code text="npm i -g agent-media-cli && agent-media login" /></Step>
            <Step n={3} title="Just ask in chat">Say it in plain words — the agent calls make_ugc:<Code text={`"Make a UGC video of a friendly woman saying '…'."`} /></Step>
          </>
        )}
        {surface === 'cli' && (
          <>
            <Step n={1} title="Install the CLI">One line — auth, uploads, and polling are handled for you.<Code text="npm install -g agent-media-cli" /></Step>
            <Step n={2} title="Sign in">Opens a browser, takes 5 seconds. The token is stored locally.<Code text="agent-media login" /></Step>
            <Step n={3} title="Run it"><code className="text-white/85">agent-media skills list</code> (one skill: make_ugc), then run and wait:<Code text={`agent-media skills run make_ugc \\\n  --input '{"script":"this app changed my mornings","person":"a friendly woman"}' \\\n  --wait`} /></Step>
          </>
        )}
        {surface === 'mcp' && (
          <>
            <Step n={1} title="Get your API key">Grab a <code className="text-white/85">ma_…</code> key from the dashboard (API Keys) or run <code className="text-white/85">agent-media login</code>.</Step>
            {client === 'claude-code' ? (
              <Step n={2} title="Add the MCP server">One command registers agent-media in Claude Code:<Code text={`claude mcp add agent-media \\\n  -e AGENT_MEDIA_API_KEY=ma_... \\\n  -- npx -y -p @agentmedia/mcp-server@latest agent-media-mcp`} /></Step>
            ) : client === 'codex' ? (
              <Step n={2} title="Edit ~/.codex/config.toml">Add the agent-media server (paste your <code className="text-white/85">ma_…</code> key):<Code text={CODEX_TOML} /></Step>
            ) : (
              <Step n={2} title={client === 'cursor' ? 'Edit ~/.cursor/mcp.json' : 'Edit claude_desktop_config.json'}>Add the agent-media server (paste your <code className="text-white/85">ma_…</code> key):<Code text={MCP_JSON} /></Step>
            )}
            <Step n={3} title="Generate from chat">Restart {CLIENT_LABEL[client]}, then ask: <span className="text-white/85">&quot;Make a UGC video with agent-media.&quot;</span> The make_ugc tool self-describes via <code className="text-white/85">tools/list</code>.</Step>
          </>
        )}
      </div>

      {surface === 'mcp' && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => pick('cli')} className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium"
            style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.35)', color: '#C4B5FD', borderRadius: 8 }}>
            Using Claude Code or Codex? The CLI is the smoothest path →
          </button>
        </div>
      )}
    </div>
  );
}
