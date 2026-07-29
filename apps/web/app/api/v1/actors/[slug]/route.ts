import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params;
  return gateway(req, 'actors', { method: 'GET', query: { slug } });
}
