import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_FUNCTIONS = new Set([
  'ugc-video',
  'job-status',
  'actors',
  'credits-check',
  'persona-list',
  'presigned-url',
  'upload-url',
  'usage-stats',
  'gallery-delete',
  'apikey-manage',
  'pricing',
  'checkout',
  'manage-subscription',
  'health-status',
  'cancel-subscription',
  'stripe-portal',
  'auto-topup',
  'subtitle-video',
  'billing-history',
  'feedback',
  'invite-redeem',
]);

const AUTH_REQUIRED_FUNCTIONS = new Set([
  'ugc-video',
  'job-status',
  'actors',
  'credits-check',
  'persona-list',
  'presigned-url',
  'upload-url',
  'usage-stats',
  'gallery-delete',
  'apikey-manage',
  'checkout',
  'manage-subscription',
  'health-status',
  'cancel-subscription',
  'stripe-portal',
  'auto-topup',
  'subtitle-video',
  'billing-history',
  'invite-redeem',
]);

async function edgeFunctionErrorResponse(error: unknown, fallbackStatus = 502) {
  const response = typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : null;

  if (response instanceof Response) {
    const status = response.status || fallbackStatus;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => null);
      if (body && typeof body === 'object') {
        return NextResponse.json(body, { status });
      }
    }

    const text = await response.text().catch(() => '');
    if (text) {
      return NextResponse.json(
        { error: 'edge_function_error', error_description: text.slice(0, 500) },
        { status },
      );
    }

    return NextResponse.json(
      { error: 'edge_function_error', error_description: `Edge Function returned HTTP ${status}` },
      { status },
    );
  }

  return NextResponse.json(
    {
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Edge Function invocation failed',
    },
    { status: fallbackStatus },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!ALLOWED_FUNCTIONS.has(name)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    if (AUTH_REQUIRED_FUNCTIONS.has(name)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: 'unauthorized', error_description: 'Please sign in again before continuing.' },
          { status: 401 },
        );
      }
    }
    const { data, error } = await supabase.functions.invoke(name, { method: 'GET' });
    if (error) {
      if (data && typeof data === 'object') return NextResponse.json(data, { status: 502 });
      return edgeFunctionErrorResponse(error);
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!ALLOWED_FUNCTIONS.has(name)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = await createClient();
    if (AUTH_REQUIRED_FUNCTIONS.has(name)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: 'unauthorized', error_description: 'Please sign in again before continuing.' },
          { status: 401 },
        );
      }
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      if (data && typeof data === 'object') return NextResponse.json(data, { status: 502 });
      return edgeFunctionErrorResponse(error);
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
