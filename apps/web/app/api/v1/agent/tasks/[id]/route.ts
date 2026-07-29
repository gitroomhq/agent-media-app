// Copyright 2026 agent-media contributors. Apache-2.0 license.

/** Same-origin proxy for /v1/agent/tasks/:id — task + steps (GET). Durable-loop Phase 1. */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return forwardToAgentApi(`/v1/agent/tasks/${encodeURIComponent(id)}`, { method: 'GET' });
}
