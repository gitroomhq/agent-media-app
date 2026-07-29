import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { mapPrimitiveRunToJob, type AdminJob } from '@/lib/admin-generations';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [authUserRes, subRes, creditsRes, jobsRes, primitiveRunsRes] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('user_credits').select('*').eq('user_id', userId).maybeSingle(),
    admin
      .from('generation_jobs')
      .select('id, model_slug, operation, status, prompt, output_media_url, credit_cost, error_message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    // vNext skill activity (primitive_runs) + its output media (artifacts).
    admin
      .from('primitive_runs')
      .select('user_id, id, primitive_id, status, input, created_at, finished_at, primitive_artifacts(url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const authUser = authUserRes.data?.user;

  // Merge legacy generation_jobs with vNext primitive_runs, newest first.
  const legacyJobs = ((jobsRes.data ?? []) as Record<string, unknown>[]).map(
    (j) => ({ ...j, user_id: userId, operation: j.operation ?? 'legacy', error_code: null }) as AdminJob,
  );
  const vnextJobs = (primitiveRunsRes.data ?? []).map((r) =>
    mapPrimitiveRunToJob(r as Parameters<typeof mapPrimitiveRunToJob>[0]),
  );
  const jobs = [...legacyJobs, ...vnextJobs].sort(
    (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );

  return NextResponse.json({
    id: userId,
    email: authUser?.email ?? null,
    display_name: authUser?.user_metadata?.full_name ?? null,
    created_at: authUser?.created_at ?? null,
    subscription: subRes.data ?? null,
    credits: creditsRes.data ?? null,
    jobs,
  });
}
