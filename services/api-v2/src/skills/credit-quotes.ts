// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Quote how many credits a skill run will cost, given its input. The
 * skill route uses this BEFORE starting a Temporal workflow so the
 * caller gets a 402 immediately instead of a half-failed workflow.
 *
 * Numbers MUST stay in sync with primitive-worker-vnext/src/client/credits.ts.
 * (Single shared module across services would be cleaner; deferred until
 * the next refactor.)
 */

import { decideMakeUgcRoute, type MakeUgcProps } from './make-ugc-router.js';
// Shared take planner — the SAME module the worker plans with, so quote and run
// cannot disagree. See packages/schema/src/take-planner.ts.
import { countWords, fitDuration, planTakeDurations } from '@agentmedia/schema';

// Portraits are free; a character sheet is charged only standalone (a sheet
// generated inside make_ugc_video is free — see the make_ugc_video case).
const PORTRAIT_CREDITS = 0;
const CHARACTER_SHEET_CREDITS = 35;
const WIREFRAME_CREDITS = 35;
const SUBTITLES_CREDITS = 15;
// Video pricing set for >=50% margin vs the upstream Seedance 720p provider:
// 10s costs us $1.99; at 68 credits/$ revenue, 280 cr = $4.12 => 51.7% margin.
const SELFIE_BY_DURATION: Record<5 | 10 | 15, number> = {
  5: 140,
  10: 280,
  15: 420,
};

function selfieFor(duration: unknown): number {
  const d = typeof duration === 'number' ? duration : Number(duration) || 10;
  if (d === 5 || d === 10 || d === 15) return SELFIE_BY_DURATION[d as 5 | 10 | 15];
  return SELFIE_BY_DURATION[10];
}

// ── broll_talking_head plan (MUST mirror the worker's broll-talking-head.ts) ──
// The worker sizes each take to its own word count and chunks long scripts, so
// the quote has to plan the same takes — otherwise preflight under-charges and a
// run can fail mid-way on INSUFFICIENT_CREDITS.
// Take planning lives in @agentmedia/schema so the quote and the worker cannot
// drift. This file previously held a private copy whose constants differed from
// the worker's (packed at 28 words and hard-split at 22, vs the worker's 33/33),
// so a 34-word script quoted 560 while the worker rendered 420 — a false 402 for
// anyone holding less than 560. Do not re-introduce a local copy.
function brollTakeDurations(script: string, duration: number): Array<5 | 10 | 15> {
  return planTakeDurations(script, duration);
}

// ── make_podcast take plan (MUST stay byte-identical to the worker's
// chunkPodcastTurn in primitive-worker-vnext/src/workflows/make-podcast.ts) ──
// A drift here under-charges: the worker would render more/longer takes than the
// preflight quoted, failing a run mid-way on INSUFFICIENT_CREDITS after paying the
// provider for earlier takes. Guaranteed to land every chunk in the [5,33] band.
const PODCAST_TAKE_MAX_WORDS = 33;
const PODCAST_TAKE_MIN_WORDS = 5;
function podcastBalancedSplit(words: string[]): string[] {
  const n = Math.ceil(words.length / PODCAST_TAKE_MAX_WORDS);
  const base = Math.floor(words.length / n);
  const rem = words.length % n;
  const out: string[] = [];
  let i = 0;
  for (let k = 0; k < n; k += 1) {
    const size = base + (k < rem ? 1 : 0);
    out.push(words.slice(i, i + size).join(' '));
    i += size;
  }
  return out;
}
function chunkPodcastTurn(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const groups: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const candidate = cur ? `${cur} ${s}` : s;
    if (cur && countWords(candidate) > PODCAST_TAKE_MAX_WORDS) {
      groups.push(cur);
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur) groups.push(cur);
  let pieces: string[] = [];
  for (const g of groups) {
    const w = g.split(/\s+/).filter(Boolean);
    if (w.length <= PODCAST_TAKE_MAX_WORDS) pieces.push(g);
    else pieces.push(...podcastBalancedSplit(w));
  }
  for (let i = pieces.length - 1; i > 0; i -= 1) {
    if (countWords(pieces[i]) < PODCAST_TAKE_MIN_WORDS) {
      const merged = `${pieces[i - 1]} ${pieces[i]}`.split(/\s+/).filter(Boolean);
      if (merged.length <= PODCAST_TAKE_MAX_WORDS) pieces.splice(i - 1, 2, merged.join(' '));
      else pieces.splice(i - 1, 2, ...podcastBalancedSplit(merged));
    }
  }
  if (pieces.length > 1 && countWords(pieces[0]) < PODCAST_TAKE_MIN_WORDS) {
    const merged = `${pieces[0]} ${pieces[1]}`.split(/\s+/).filter(Boolean);
    if (merged.length <= PODCAST_TAKE_MAX_WORDS) pieces.splice(0, 2, merged.join(' '));
    else pieces.splice(0, 2, ...podcastBalancedSplit(merged));
  }
  return pieces.length ? pieces : [clean];
}

/**
 * Quote an IN-FLIGHT standalone primitive run (a primitive_runs row with no
 * skill_run_id) from its stored primitive_id + input — used by the preflight to
 * count credits already committed to the user's queued/running jobs, so a burst
 * of submits can't all pass preflight against the same un-reserved balance and
 * then die mid-run on INSUFFICIENT_CREDITS.
 */
export function quoteInFlightPrimitiveRun(
  primitiveId: string,
  input: Record<string, unknown> | null | undefined,
): number {
  switch (primitiveId) {
    case 'simple_selfie':
    case 'product_in_hands':
    case 'lip_sync':
      return selfieFor((input as { duration?: number } | null | undefined)?.duration);
    case 'character_sheet_gpt2':
      return CHARACTER_SHEET_CREDITS;
    case 'wireframe_gpt2':
      return WIREFRAME_CREDITS;
    case 'subtitles_v2':
      return SUBTITLES_CREDITS;
    default:
      // portraits are free; compose/children rows carry a skill_run_id and are
      // priced via their parent skill_runs row instead.
      return 0;
  }
}

export function quoteSkillCredits(
  slug: string,
  input: Record<string, unknown> | null | undefined,
): number {
  const i = input ?? {};
  switch (slug) {
    case 'make_portrait':
      return PORTRAIT_CREDITS;
    case 'make_character_sheet':
      return CHARACTER_SHEET_CREDITS;
    case 'make_simple_selfie':
      return selfieFor((i as { duration?: number }).duration);
    case 'make_product_in_hands':
      return selfieFor((i as { duration?: number }).duration);
    case 'make_subtitles':
      return SUBTITLES_CREDITS;
    case 'make_wireframe':
      return WIREFRAME_CREDITS;
    case 'make_lip_sync':
      return selfieFor((i as { duration?: number }).duration);
    case 'make_broll_talking_head': {
      // Price the EXACT takes the worker will generate. Script path: each
      // word-sized take; audio path: a single clip clamped to <=15s.
      const dur = Number((i as { duration?: number }).duration) || 20;
      const script = (i as { script?: string }).script;
      let cost = 0;
      if (typeof script === 'string' && script.trim()) {
        for (const d of brollTakeDurations(script, dur)) cost += SELFIE_BY_DURATION[d];
      } else {
        cost += selfieFor(dur <= 5 ? 5 : dur <= 10 ? 10 : 15);
      }
      const subs = (i as { subtitles?: boolean }).subtitles ? SUBTITLES_CREDITS : 0;
      return cost + subs;
    }
    case 'make_podcast': {
      // Price the EXACT talking takes the worker will render: each A/B turn is
      // chunked into <=15s takes (same chunker), summed. The master scene + the
      // two reframes are free images (like the sheet inside a video).
      const script = (i as { script?: Array<{ line?: unknown }> }).script;
      let cost = 0;
      if (Array.isArray(script)) {
        for (const turn of script) {
          const line = typeof turn?.line === 'string' ? turn.line : '';
          for (const d of chunkPodcastTurn(line).map(fitDuration)) cost += SELFIE_BY_DURATION[d];
        }
      }
      const subs = (i as { subtitles?: boolean }).subtitles ? SUBTITLES_CREDITS : 0;
      return cost + subs;
    }
    case 'make_ugc_video': {
      // Portrait + character sheet are free inside a video — only the selfie (and
      // optional captions) are charged. (Standalone make_portrait /
      // make_character_sheet are priced by their own cases.)
      const selfie = selfieFor((i as { duration?: number }).duration);
      const subs = (i as { subtitles?: boolean }).subtitles !== false ? SUBTITLES_CREDITS : 0;
      return selfie + subs;
    }
    case 'make_ugc': {
      // Route through the SHARED decider, then price the resolved underlying skill
      // — so the preflight/quote can never disagree with what dispatchMakeUgc runs.
      const { slug: routed, body } = decideMakeUgcRoute(i as MakeUgcProps);
      return quoteSkillCredits(routed, body);
    }
    default:
      // Unknown slug — caller should let it through; the worker will reject.
      return 0;
  }
}
