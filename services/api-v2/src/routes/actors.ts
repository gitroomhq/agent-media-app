// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * GET /v1/actors
 *
 * Public endpoint (no auth). Lists active actors with optional filters,
 * or returns a single actor when `slug` is provided.
 *
 * Query params:
 *   gender      — exact match: "female", "male"
 *   age_range   — exact match: "18-25", "26-35", "36-50", "51+"
 *   actor_type  — exact match: "Young Adult", "Professional", "Mom", "Elder", "Casual"
 *   preset      — exact match or array containment (e.g. "show_your_app")
 *   search      — case-insensitive substring on name
 *   slug        — exact slug; returns single actor with similar-slug suggestions on 404
 *   limit       — page size (1–500, default 500 — large enough to return the entire library in one call). Ignored when `slug` is set.
 *   offset      — page offset (default 0). Ignored when `slug` is set.
 */

import type { Request, Response } from 'express';
import { supabase } from '../server.js';

interface ActorSlugRow {
  slug: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
    }
  }
  return d[m][n];
}

async function suggestSlugs(target: string, max = 3): Promise<string[]> {
  const { data } = await supabase
    .from('actors')
    .select('slug')
    .eq('status', 'active');
  if (!data) return [];
  return (data as ActorSlugRow[])
    .map((r) => ({ slug: r.slug, dist: levenshtein(target, r.slug) }))
    .filter((r) => r.dist > 0 && r.dist <= 2)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, max)
    .map((r) => r.slug);
}

export async function actorsRoute(req: Request, res: Response): Promise<void> {
  const slug = (req.query.slug as string | undefined)?.trim();

  // ── Single-actor lookup ─────────────────────────────────────────────
  if (slug) {
    try {
      const { data, error } = await supabase
        .from('actors')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        res.status(500).json({ error: { code: 'DATABASE_ERROR', message: error.message } });
        return;
      }
      if (!data) {
        const similar = await suggestSlugs(slug);
        const hint = similar.length ? ` Did you mean: ${similar.join(', ')}?` : '';
        res.status(404).json({
          error: {
            code: 'ACTOR_NOT_FOUND',
            message: `Actor '${slug}' not found.${hint}`,
            similar,
          },
        });
        return;
      }

      res.json({ actor: data });
      return;
    } catch (err) {
      console.error('[actors] slug lookup failed:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch actor' } });
      return;
    }
  }

  // ── List with filters ───────────────────────────────────────────────
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 500, 1), 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const gender = (req.query.gender as string | undefined)?.trim();
  const ageRange = (req.query.age_range as string | undefined)?.trim();
  const actorType = (req.query.actor_type as string | undefined)?.trim();
  const preset = (req.query.preset as string | undefined)?.trim();
  const search = (req.query.search as string | undefined)?.trim();

  try {
    let query = supabase
      .from('actors')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (gender) query = query.eq('gender', gender);
    if (ageRange) query = query.eq('age_range', ageRange);
    if (actorType) query = query.eq('actor_type', actorType);
    if (preset) query = query.or(`preset.eq.${preset},presets.cs.{${preset}}`);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: { code: 'DATABASE_ERROR', message: error.message } });
      return;
    }

    res.json({ actors: data ?? [], total: count ?? 0, limit, offset });
  } catch (err) {
    console.error('[actors] list query failed:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch actors' } });
  }
}
