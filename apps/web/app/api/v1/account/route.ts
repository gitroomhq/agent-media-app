import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

export async function GET(req: NextRequest) {
  return gateway(req, 'credits-check', { method: 'GET' });
}
