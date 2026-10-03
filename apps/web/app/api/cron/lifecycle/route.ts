// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Lifecycle emails (welcome, free-video nudges, trial ending, failed payment,
// cancel win-back). Runs hourly from Vercel Cron, sends from info@ via Resend,
// at most one email per user per run, each kind once (ledger:
// public.lifecycle_emails). Rules: lib/lifecycle/rules.ts.

import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { dueEmail, LIFECYCLE_START, type EmailKind, type UserFacts } from '@/lib/lifecycle/rules';
import { renderEmail } from '@/lib/lifecycle/templates';
import { unsubscribeToken } from '@/lib/lifecycle/unsubscribe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FROM = 'agent-media <info@agent-media.ai>';
const REPLY_TO = 'info@agent-media.ai';

interface Candidate {
  user_id: string;
  email: string;
  created_at: string;
  status: UserFacts['status'];
  trial_ends_at: string | null;
  canceled_at: string | null;
  sent: string[];
  unsubscribed: boolean;
}

const ms = (s: string | null) => (s ? Date.parse(s) : null);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.rpc('lifecycle_candidates', { p_start: new Date(LIFECYCLE_START).toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resend = new Resend(resendKey);
  const now = Date.now();
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  const out: Array<{ kind: EmailKind; ok: boolean }> = [];

  for (const c of (data ?? []) as Candidate[]) {
    const kind = dueEmail(
      {
        createdAt: Date.parse(c.created_at),
        status: c.status,
        trialEndsAt: ms(c.trial_ends_at),
        canceledAt: ms(c.canceled_at),
        sent: c.sent as EmailKind[],
        unsubscribed: c.unsubscribed,
      },
      now,
    );
    if (!kind) continue;
    if (dryRun) {
      out.push({ kind, ok: true });
      continue;
    }

    // Claim first so a concurrent run can't double-send.
    const { error: claimErr } = await admin.from('lifecycle_emails').insert({ user_id: c.user_id, kind });
    if (claimErr) continue;

    const unsubscribeUrl = `https://app.agent-media.ai/api/email/unsubscribe?u=${c.user_id}&t=${unsubscribeToken(c.user_id, secret)}`;
    const email = renderEmail(kind, { unsubscribeUrl });
    const { error: sendErr } = await resend.emails.send({
      from: FROM,
      to: c.email,
      replyTo: REPLY_TO,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'lifecycle', value: kind }],
    });
    if (sendErr) {
      await admin.from('lifecycle_emails').delete().eq('user_id', c.user_id).eq('kind', kind);
    }
    out.push({ kind, ok: !sendErr });
  }

  const summary = out.reduce<Record<string, number>>((acc, r) => {
    const k = `${r.kind}${r.ok ? '' : '_failed'}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ dryRun, candidates: data?.length ?? 0, sent: summary });
}
