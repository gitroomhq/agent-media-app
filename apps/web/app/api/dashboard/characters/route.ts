// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /api/dashboard/characters
 *
 * Lists the caller's reusable Content Machine characters (user_characters
 * rows where archived_at IS NULL), with a video_count derived from the
 * generation_jobs.character_id back-reference.
 *
 * Used by /content-machine — Characters tab.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'Not authenticated' } },
      { status: 401 },
    );
  }

  const { data: characters, error } = await supabase
    .from('user_characters')
    .select('id, name, source_kind, actor_slug, source_image_url, description, character_sheet_url, thumbnail_url, created_at')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: { code: 'db_error', message: error.message } }, { status: 500 });
  }

  // Decorate each character with a count of completed videos. One round-
  // trip per character would be silly; aggregate in JS from a single
  // count-by-character query.
  const ids = (characters ?? []).map((c) => c.id);
  let videoCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: videos } = await supabase
      .from('generation_jobs')
      .select('character_id')
      .eq('user_id', user.id)
      .eq('operation', 'character_video')
      .eq('status', 'completed')
      .is('deleted_at', null)
      .in('character_id', ids);
    for (const row of (videos ?? []) as { character_id: string | null }[]) {
      if (row.character_id) videoCounts[row.character_id] = (videoCounts[row.character_id] ?? 0) + 1;
    }
  }

  const decorated = (characters ?? []).map((c) => ({
    ...c,
    video_count: videoCounts[c.id] ?? 0,
  }));

  return NextResponse.json(
    { characters: decorated },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
