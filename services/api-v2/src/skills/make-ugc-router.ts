// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * make_ugc — the ONE agent-facing UGC tool. This module is a PURE route
 * decision shared by the run path (skills.ts → dispatchMakeUgc) and the credit
 * quote (credit-quotes.ts) so the price the user confirms can never disagree
 * with what actually runs (the bug class commits 54f47db2 / 587286b6 fixed for
 * b-roll). It adds ZERO generation: it maps the facade props onto an EXISTING
 * skill's body. Identity URLs (uploaded image / looked-up character sheet) are
 * filled in by the run path; here they are placeholders so the quote can be
 * computed with no side effects.
 *
 * `countWords` / `fitDuration` are imported from @agentmedia/schema, never
 * reimplemented. This file used to carry private copies; they happened to agree,
 * but nothing enforced it, so a fix to the shared planner would not have reached
 * the route decision — and the route decision is what sets the price.
 */

import { countWords, fitDuration } from '@agentmedia/schema';

export interface MakeUgcProps {
  script?: string;
  scene_action?: string;
  person?: string;
  image?: string;
  character?: string;
  product_image?: string;
  name?: string;
  broll_url?: string;
  duration?: 5 | 10 | 15 | 20 | 25 | 30;
  captions?: boolean;
  caption_style?: 'hormozi' | 'tiktok' | 'minimal';
  look?: 'natural' | 'commercial' | 'raw_iphone';
  aspect_ratio?: '9:16' | '1:1';
  music?: boolean | string;
}

/** Placeholder for an identity URL the run path resolves before delegating; it
 *  never reaches the underlying schema (the run path overwrites it first). */
export const MAKE_UGC_IDENTITY_PLACEHOLDER = 'https://make-ugc-placeholder.invalid/identity';

/** A description supplied when the caller gives no person/image/character. */
const DEFAULT_PERSON =
  'a friendly, photogenic young person speaking casually to camera, natural daylight, UGC style';

/** Words above which a single Seedance take (≤15s) can't hold the line, so the
 *  multi-take engine (make_broll_talking_head) is used. Mirrors the worker's
 *  fitDuration ceiling (a 15s take tops out at ~33 words). */
const SINGLE_CLIP_MAX_WORDS = 33;

/** A long script needs the multi-take engine: more than one 15s take, or an
 *  explicit `---` intro/moves marker. */
export function isLongScript(script?: string): boolean {
  if (!script) return false;
  if (/(?:^|\n)\s*---\s*(?:\n|$)/.test(script)) return true;
  return countWords(script) > SINGLE_CLIP_MAX_WORDS;
}

/**
 * Decide which existing skill a make_ugc request routes to and build its body.
 * PURE + sync. `actor_image_url` / `character_sheet_url` / `portrait_url` are
 * placeholders (or a presence sentinel for the quote); the run path fills the
 * real resolved values before the underlying schema validates.
 */
export function decideMakeUgcRoute(props: MakeUgcProps): {
  slug: string;
  body: Record<string, unknown>;
} {
  const hasBroll = Boolean(props.broll_url);
  const hasCharacter = Boolean(props.character);
  const hasImage = Boolean(props.image);
  const hasProduct = Boolean(props.product_image);
  const long = isLongScript(props.script);
  // Captions are OPT-IN: only burned in when the caller explicitly sets
  // captions:true (the agent must ask the user first). Off otherwise.
  const subtitles = props.captions === true;
  const aspect: '9:16' | '1:1' = props.aspect_ratio === '1:1' ? '1:1' : '9:16';

  // Route 0: a product to show/hold/wear → make_product_in_hands (staged in code).
  // Needs a holder (a saved character's sheet) + the product image; both are
  // resolved by dispatchMakeUgc. Placeholders here keep the quote coherent —
  // make_product_in_hands is priced by duration. Product takes precedence.
  if (hasProduct) {
    const body: Record<string, unknown> = {
      character_sheet_url: MAKE_UGC_IDENTITY_PLACEHOLDER, // run path → real sheet
      product_image_url: MAKE_UGC_IDENTITY_PLACEHOLDER, // run path → real product image
      framing: 'close_up',
      aspect_ratio: aspect,
    };
    if (props.script) {
      body.script = props.script;
      body.duration = fitDuration(props.script);
    } else if (props.scene_action) {
      body.scene_action = props.scene_action;
      body.duration = props.duration && [5, 10, 15].includes(props.duration) ? props.duration : 10;
    }
    return { slug: 'make_product_in_hands', body };
  }

  // Routes 1 + 2: a b-roll overlay OR a long monologue → make_broll_talking_head,
  // the only engine that turns one script into N seamless ≤15s takes (and, per
  // C1, now runs with NO b-roll). The worker + quote chunk the full script, so a
  // long monologue is rendered in full, never trimmed.
  if (hasBroll || long) {
    return {
      slug: 'make_broll_talking_head',
      body: {
        actor_image_url: MAKE_UGC_IDENTITY_PLACEHOLDER, // run path → real sheet/portrait
        ...(hasBroll ? { broll_video_url: props.broll_url } : {}),
        script: props.script,
        subtitles,
        aspect_ratio: aspect,
      },
    };
  }

  // Route 3: a short script (or silent clip) with a SAVED character → reuse the
  // sheet via make_simple_selfie (skips the portrait + sheet generation cost).
  // NOTE: the simple_selfie primitive renders a raw selfie with NO captions, so
  // a reused-character short video is always caption-free (consistent with the
  // opt-in default). If a user explicitly wants captions on a reused character,
  // that needs the caption-capable engine — tracked separately, not here.
  if (hasCharacter && (props.script || props.scene_action)) {
    const body: Record<string, unknown> = {
      character_sheet_url: MAKE_UGC_IDENTITY_PLACEHOLDER, // run path → real sheet
      aspect_ratio: aspect,
    };
    if (props.script) {
      body.script = props.script;
      body.duration = fitDuration(props.script);
    } else {
      body.scene_action = props.scene_action;
      body.duration = props.duration && [5, 10, 15].includes(props.duration) ? props.duration : 10;
      if (typeof props.music !== 'undefined') body.background_music = props.music;
    }
    return { slug: 'make_simple_selfie', body };
  }

  // Route 4 (default): a short script with an image / person description / nothing
  // → make_ugc_video (auto portrait → sheet → selfie → captions).
  const body: Record<string, unknown> = {
    script: props.script ?? '',
    duration: props.script ? fitDuration(props.script) : 10,
    realism_target: props.look ?? 'natural',
    aspect_ratio: aspect,
    subtitles,
    subtitles_style: props.caption_style ?? 'hormozi',
  };
  if (props.name) body.character_description = props.name;
  if (hasImage) {
    // a portrait is provided → the quote skips the portrait-gen cost.
    body.portrait_url = MAKE_UGC_IDENTITY_PLACEHOLDER;
  } else {
    // a person description (or a default) → the quote includes portrait gen.
    body.description = props.person && props.person.length >= 8 ? props.person : DEFAULT_PERSON;
  }
  return { slug: 'make_ugc_video', body };
}
