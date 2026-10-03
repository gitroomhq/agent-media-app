// Copyright 2026 agent-media contributors. Apache-2.0 license.
// One-click unsubscribe from lifecycle emails (GET from the link, POST from
// the List-Unsubscribe-Post header). Billing notices still go out.

import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyUnsubscribe } from '@/lib/lifecycle/unsubscribe';

export const dynamic = 'force-dynamic';

async function unsubscribe(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret || !u || !verifyUnsubscribe(u, t, secret)) {
    return new NextResponse('Invalid unsubscribe link.', { status: 400 });
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await admin.from('lifecycle_emails').upsert({ user_id: u, kind: 'unsubscribed' }, { onConflict: 'user_id,kind' });
  return new NextResponse(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;padding:40px;text-align:center"><h1 style="font-size:20px">You\'re unsubscribed</h1><p>You won\'t get these emails from agent-media anymore.</p></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export const GET = unsubscribe;
export const POST = unsubscribe;
