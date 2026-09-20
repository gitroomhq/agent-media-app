// Copyright 2026 agent-media contributors. Apache-2.0 license.
import type { Request, Response } from 'express';
import { supabase } from '../../server.js';
import { temporaryUploadsEnabled } from '../../uploads/types.js';
export async function accountReadinessRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  res.setHeader('Cache-Control', 'no-store');
  if (!userId) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Reconnect Agent Media to check your account.' } }); return; }
  try {
    // Read the same buckets deduct_credits locks; never use credits-check's refill path.
    const { data, error } = await supabase.from('user_credits')
      .select('monthly_credits_remaining,purchased_balance').eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Balance lookup unavailable');
    const monthly = data === null ? 0 : data?.monthly_credits_remaining;
    const purchased = data === null ? 0 : data?.purchased_balance;
    if (![monthly, purchased].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid balance');
    const workerConfigured = Boolean(process.env.WORKER_V2_URL && process.env.WORKER_SECRET);
    const total = monthly + purchased;
    if (!Number.isSafeInteger(total)) throw new Error('Invalid total');
    res.json({
      authenticated: true, account_id: userId, checked_at: new Date().toISOString(),
      credits: { monthly_remaining: monthly, purchased, total },
      generation: {
        status: !workerConfigured ? 'not_configured' : total === 0 ? 'needs_credits' : 'quote_required',
        next_step: !workerConfigured ? 'Generation service is not configured. Contact support; do not purchase credits to fix this service issue.' : total === 0 ? 'No generation credits are available. Open billing to check your payment or add credits; do not generate yet.' : 'Quote the intended generation and compare its cost with this balance before submitting.',
        balance_is_reserved: false, provider_availability_checked: false,
      },
      uploads: { enabled: temporaryUploadsEnabled(), storage_verified: false },
      billing_url: 'https://app.agent-media.ai/billing',
    });
  } catch {
    res.setHeader('Retry-After', '5');
    res.status(503).json({ error: { code: 'ACCOUNT_CHECK_UNAVAILABLE', message: 'Account balance is temporarily unavailable. Retry this check; do not assume you have no credits or purchase again.' } });
  }
}
