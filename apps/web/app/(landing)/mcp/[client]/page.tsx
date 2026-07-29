// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /mcp/<client> — public Skills & CLI hub, MCP tab with a specific client
 * preselected (claude-code | cursor | claude-desktop). Full-path deep links
 * (no query string) so they're clean + shareable.
 */

import { SkillsHub } from '@/components/skills-hub';

type Client = 'claude-code' | 'cursor' | 'claude-desktop' | 'codex';
const CLIENTS: Client[] = ['claude-code', 'cursor', 'claude-desktop', 'codex'];

export function generateStaticParams() {
  return CLIENTS.map((client) => ({ client }));
}

export default async function McpClientPage({
  params,
}: {
  params: Promise<{ client: string }>;
}) {
  const { client } = await params;
  const initialClient: Client = CLIENTS.includes(client as Client)
    ? (client as Client)
    : 'claude-code';
  return <SkillsHub initialTab="mcp" initialClient={initialClient} />;
}
