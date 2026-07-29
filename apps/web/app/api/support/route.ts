// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * POST /api/support
 *
 * Receives a support ticket from the in-app Support modal and emails
 * it to the operator inbox via Resend. Requires the user to be
 * signed in so we always have an authoritative email to reply to.
 *
 * Body: { subject: string, message: string }
 * Env:  RESEND_API_KEY
 */

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';

const SUPPORT_INBOX = 'yuvalsuede@gmail.com';
const FROM = 'agent-media support <support@agent-media.ai>';

interface Body {
  subject?: unknown;
  message?: unknown;
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email is not configured yet. Try again shortly.' },
      { status: 503 },
    );
  }

  let parsed: Body;
  try {
    parsed = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  if (!subject || subject.length > 200) {
    return NextResponse.json(
      { error: 'subject is required (≤ 200 chars)' },
      { status: 400 },
    );
  }
  if (!message || message.length < 5 || message.length > 4000) {
    return NextResponse.json(
      { error: 'message must be between 5 and 4000 characters' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fromEmail = user.email ?? 'unknown@agent-media.ai';
  const fromId = user.id;

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: SUPPORT_INBOX,
      replyTo: fromEmail,
      subject: `[support] ${subject}`,
      text: [
        `From:    ${fromEmail}`,
        `User ID: ${fromId}`,
        '',
        '─── Message ───',
        message,
      ].join('\n'),
    });
    if (error) {
      return NextResponse.json(
        { error: error.message ?? 'Email send failed' },
        { status: 502 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Email send failed' },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
