import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

export async function POST(req: NextRequest) {
  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    input = {};
  }
  return gateway(req, 'apikey-manage', {
    body: { action: 'create', ...input },
  });
}

export async function GET(req: NextRequest) {
  return gateway(req, 'apikey-manage', { body: { action: 'list' } });
}
