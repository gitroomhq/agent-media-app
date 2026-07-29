import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return gateway(req, 'job-status', { body: { jobId: id, cancel: true } });
}
