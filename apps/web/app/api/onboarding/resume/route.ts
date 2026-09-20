// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { creationReturnTo, encodeCreationReturn, readCreationReturn, RETURN_COOKIE, RETURN_TTL_SECONDS } from '@/lib/navigation/return-to';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ destination: readCreationReturn(request.cookies.get(RETURN_COOKIE)?.value, user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const target = creationReturnTo(body?.destination);
  if (!target) return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  const response = NextResponse.json({ destination: target }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(RETURN_COOKIE, encodeCreationReturn(target, user.id), {
    httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: RETURN_TTL_SECONDS,
  });
  return response;
}
