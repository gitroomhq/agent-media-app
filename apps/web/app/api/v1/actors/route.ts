import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams);
  return gateway(req, 'actors', { method: 'GET', query });
}
