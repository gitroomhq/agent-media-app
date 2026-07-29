// Copyright 2026 agent-media contributors. Apache-2.0 license.

/** Same-origin proxy for /v1/agent/projects/:id — update (PATCH) + archive (DELETE). Phase 3. */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.text();
  return forwardToAgentApi(`/v1/agent/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forwardToAgentApi(`/v1/agent/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
