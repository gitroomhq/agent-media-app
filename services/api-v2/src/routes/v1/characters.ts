// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /v1/characters — list the auth user's saved, reusable characters.
 *
 * Unlike GET /v2/characters (which returns v2-only rows and omits the sheet
 * URL), this returns ALL active rows from public.user_characters with the
 * fields an agent needs to (a) DISPLAY the character and (b) REUSE it in a
 * video: character_sheet_url is the identity URL you pass back into
 * make_simple_selfie / make_product_in_hands / make_broll_talking_head.
 *
 * Read-only, auth-scoped (RLS + explicit user_id filter), no credits.
 */

import type { Request, Response } from 'express';
import { supabase } from '../../server.js';

export async function listMyCharactersRoute(req: Request, res: Response): Promise<void> {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    return;
  }

  const rawLimit = Number((req.query as { limit?: string }).limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;

  const { data, error } = await supabase
    .from('user_characters')
    .select('id, public_id, name, description, source_kind, character_sheet_url, portrait_url, thumbnail_url, created_at')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[v1 characters list] ${error.message}`);
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: 'Failed to list characters' } });
    return;
  }

  const characters = (data ?? []).map((c) => ({
    id: c.id,
    character_id: c.public_id ?? null,
    name: c.name,
    description: c.description,
    source_kind: c.source_kind,
    // The reuse URL (pass this back into a video skill to keep the same identity).
    character_sheet_url: c.character_sheet_url,
    portrait_url: c.portrait_url,
    // Best thumbnail for display: explicit thumb → portrait → the sheet itself.
    thumbnail_url: c.thumbnail_url ?? c.portrait_url ?? c.character_sheet_url,
    created_at: c.created_at,
  }));

  res.status(200).json({ characters, count: characters.length });
}
