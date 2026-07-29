import { NextRequest, NextResponse } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await gateway(req, 'job-status', { body: { jobId: id } });

  // Add Retry-After for non-terminal statuses
  const data = await res.clone().json().catch(() => null);
  const terminal = new Set(['completed', 'failed', 'canceled']);
  if (data && !data.error && !terminal.has(data.status)) {
    const headers = new Headers(res.headers);
    headers.set('Retry-After', '5');
    return new NextResponse(res.body, { status: res.status, headers });
  }

  return res;
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return gateway(req, 'gallery-delete', { body: { jobId: id } });
}
