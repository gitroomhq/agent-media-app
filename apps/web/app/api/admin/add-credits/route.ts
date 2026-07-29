import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isAdminEmail } from '@/lib/admin-allowlist';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await req.json();
  const { user_id, amount } = body;

  if (!user_id || !amount) {
    return NextResponse.json(
      { error: 'user_id and amount are required' },
      { status: 400 },
    );
  }

  const credits = Number(amount);
  if (!Number.isInteger(credits) || credits < 1 || credits > 100000) {
    return NextResponse.json(
      { error: 'amount must be an integer between 1 and 100,000' },
      { status: 400 },
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Use the existing add_purchased_credits RPC function
  const { data, error: rpcError } = await admin.rpc('add_purchased_credits', {
    p_user_id: user_id,
    p_amount: credits,
    p_description: `Admin grant by ${user.email}`,
  });

  if (rpcError) {
    return NextResponse.json(
      { error: 'Failed to add credits', details: rpcError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    user_id,
    credits_added: credits,
    ...(data ?? {}),
  });
}
