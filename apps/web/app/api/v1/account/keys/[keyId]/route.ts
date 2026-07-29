import { NextRequest } from 'next/server';
import { gateway } from '@/lib/api/v1/gateway';

type Params = { params: Promise<{ keyId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const { keyId } = await params;
  return gateway(req, 'apikey-manage', {
    body: { action: 'revoke', key_id: keyId },
  });
}
