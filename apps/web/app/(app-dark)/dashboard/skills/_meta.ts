// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Per-skill UI metadata that doesn't (yet) live in the registry: icon,
 * cost/time estimates, output kind. Mirrors numbers in
 * services/api-v2/src/skills/credit-quotes.ts +
 * services/primitive-worker-vnext/src/client/credits.ts.
 */

import { Sparkles, LayoutGrid, Video, Captions, Film, type LucideIcon } from 'lucide-react';

export interface SkillMeta {
  icon: LucideIcon;
  cost: string;
  time: string;
  outputKind: 'image' | 'video';
}

export const SKILL_META: Record<string, SkillMeta> = {
  make_ugc: { icon: Film, cost: 'from ~155 credits', time: '6–25 min', outputKind: 'video' },
  // Portrait is now free; a character sheet is free inside a video (35 standalone).
  make_portrait: { icon: Sparkles, cost: 'Free', time: '~60s', outputKind: 'image' },
  make_character_sheet: { icon: LayoutGrid, cost: '35 credits (free in a video)', time: '~90s', outputKind: 'image' },
  make_wireframe: { icon: LayoutGrid, cost: '35 credits', time: '~90s', outputKind: 'image' },
  make_simple_selfie: { icon: Video, cost: '140–420 credits', time: '4–7 min', outputKind: 'video' },
  make_product_in_hands: { icon: Video, cost: '140–420 credits', time: '4–7 min', outputKind: 'video' },
  make_subtitles: { icon: Captions, cost: '15 credits', time: '~20s', outputKind: 'video' },
  make_lip_sync: { icon: Video, cost: '140–420 credits', time: '~7–8 min', outputKind: 'video' },
  make_ugc_video: { icon: Film, cost: '~155–435 credits', time: '6–10 min', outputKind: 'video' },
  make_podcast: { icon: Film, cost: '~280–1400 credits', time: '8–30 min', outputKind: 'video' },
};

export function metaFor(slug: string): SkillMeta {
  return SKILL_META[slug] ?? { icon: Sparkles, cost: '—', time: '—', outputKind: 'video' };
}
