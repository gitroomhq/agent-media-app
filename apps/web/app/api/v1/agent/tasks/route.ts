// Copyright 2026 agent-media contributors. Apache-2.0 license.

/** Same-origin proxy for /v1/agent/tasks — list (GET) + create (POST). Durable-loop Phase 1. */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return forwardToAgentApi(`/v1/agent/tasks${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return forwardToAgentApi('/v1/agent/tasks', { method: 'POST', body });
}
