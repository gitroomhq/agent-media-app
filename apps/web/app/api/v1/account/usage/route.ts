import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

export async function GET(req: NextRequest) {
  return gateway(req, 'usage-stats', { method: 'GET' });
}
