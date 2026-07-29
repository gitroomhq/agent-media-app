import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * GET /api/actors?preset=show_your_app&limit=200
 *
 * Public list of active actors. Queries Supabase PostgREST directly with
 * the anon key (actors table has a public read RLS policy). Supports
 * filtering by preset.
 */
export async function GET(req: NextRequest) {
  try {
    const preset = req.nextUrl.searchParams.get('preset');
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 500);

    const select = 'id,slug,name,portrait_url,green_screen_url,age,age_range,gender,nationality,actor_type,style,voice_id,lip_sync_engine,preset,presets';
    const params = new URLSearchParams({
      select,
      status: 'eq.active',
      order: 'name.asc',
      limit: String(limit),
    });
    if (preset) {
      params.set('or', `(preset.eq.${preset},presets.cs.{${preset}})`);
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/actors?${params.toString()}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Accept: 'application/json',
      },
      // Revalidate every 5 minutes — actor list doesn't change often
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `Upstream error (${res.status})`, detail: body }, { status: res.status });
    }

    const actors = await res.json();
    return NextResponse.json({ actors, total: actors.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
