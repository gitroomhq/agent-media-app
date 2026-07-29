import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ACTOR_VARIANTS_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
};

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/actors/:id/variants
 *
 * Public list of active generated looks for an actor. Queries Supabase
 * PostgREST directly with the anon key; actor_variants has public read RLS
 * for active rows.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    if (!SUPABASE_URL.trim() || !ANON_KEY.trim()) {
      return NextResponse.json(
        { error: 'server_misconfigured', detail: 'Supabase public env vars are missing' },
        { status: 503 },
      );
    }

    const { id } = await params;
    if (!id.trim()) {
      return NextResponse.json({ error: 'missing_actor_id' }, { status: 400 });
    }

    const select = 'id,actor_id,position,framing,outfit,background,expression,image_url,status';
    const query = new URLSearchParams({
      select,
      actor_id: `eq.${id}`,
      status: 'eq.active',
      order: 'position.asc,outfit.asc',
    });

    const res = await fetch(
      `${SUPABASE_URL.trim().replace(/\/+$/, '')}/rest/v1/actor_variants?${query.toString()}`,
      {
        headers: {
          apikey: ANON_KEY.trim(),
          Authorization: `Bearer ${ANON_KEY.trim()}`,
          Accept: 'application/json',
        },
        next: { revalidate: 300 },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `Upstream error (${res.status})`, detail: body },
        { status: res.status },
      );
    }

    const variants = await res.json();
    return NextResponse.json(
      { variants, total: variants.length },
      { headers: ACTOR_VARIANTS_CACHE_HEADERS },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
