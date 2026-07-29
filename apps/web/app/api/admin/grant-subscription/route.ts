import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isAdminEmail } from '@/lib/admin-allowlist';

const PLAN_CREDITS: Record<string, number> = {
  starter: 3900,
  creator: 6900,
  pro_plus: 12900,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const { user_id, plan_slug } = body;

  if (!user_id || !plan_slug) {
    return NextResponse.json(
      { error: 'user_id and plan_slug are required' },
      { status: 400 },
    );
  }

  if (!PLAN_CREDITS[plan_slug]) {
    return NextResponse.json(
      { error: `Invalid plan_slug. Must be one of: ${Object.keys(PLAN_CREDITS).join(', ')}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Upsert subscription record
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error: subError } = await admin
    .from('subscriptions')
    .upsert(
      {
        user_id,
        plan_slug,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (subError) {
    return NextResponse.json(
      { error: 'Failed to update subscription', details: subError.message },
      { status: 500 },
    );
  }

  // Reset monthly credits to the plan's allowance
  const { error: rpcError } = await admin.rpc('reset_monthly_credits', {
    p_user_id: user_id,
    p_allowance: PLAN_CREDITS[plan_slug],
  });

  if (rpcError) {
    // If rpc fails, try direct upsert on user_credits as fallback
    await admin
      .from('user_credits')
      .upsert(
        {
          user_id,
          monthly_credits_remaining: PLAN_CREDITS[plan_slug],
        },
        { onConflict: 'user_id' },
      );
  }

  return NextResponse.json({
    success: true,
    user_id,
    plan_slug,
    monthly_credits: PLAN_CREDITS[plan_slug],
  });
}
