// Copyright 2026 agent-media contributors. Apache-2.0 license.

/** Same-origin proxy for /v1/agent/projects — list (GET) + create (POST). Phase 3. */

import { NextRequest } from 'next/server';
import { forwardToAgentApi } from '@/lib/agent-chat-proxy';

export async function GET() {
  return forwardToAgentApi('/v1/agent/projects', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return forwardToAgentApi('/v1/agent/projects', { method: 'POST', body });
}
