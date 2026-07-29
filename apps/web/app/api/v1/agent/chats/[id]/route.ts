// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Same-origin proxy for /v1/agent/chats/:id — reopen (GET), rename/pin/archive
 * /move (PATCH), soft-archive (DELETE). Chat persistence Phase 1.
 */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const qs = req.nextUrl.searchParams.toString();
  return forwardToAgentApi(`/v1/agent/chats/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.text();
  return forwardToAgentApi(`/v1/agent/chats/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forwardToAgentApi(`/v1/agent/chats/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
