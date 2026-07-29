// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { NextRequest } from 'next/server';
import { proxy } from '../../_proxy';
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxy('DELETE', `/v1/social/channels/${encodeURIComponent(id)}`);
}
