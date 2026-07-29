// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for POST /v1/agent/chats/:id/messages — the idempotent
 * append (one row per message). Chat persistence Phase 1.
 */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.text();
  return forwardToAgentApi(`/v1/agent/chats/${encodeURIComponent(id)}/messages`, { method: 'POST', body });
}
