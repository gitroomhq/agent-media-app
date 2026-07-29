// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Legacy v1 command deprecation banner.
 *
 * Every v1 command (ugc, show-your-app, laptop-ugc, character-video,
 * text-to-video, subtitle, product-acting) calls printDeprecation() at the
 * top of its action handler. The banner:
 *   - Prints a yellow stderr warning so HUMAN users see it
 *   - Includes the exact v2 replacement command so an AI agent reading
 *     the output learns the migration path on the next turn
 *   - Stays out of stdout so existing scripts that parse JSON output
 *     keep working
 *
 * The command still runs to completion afterwards — this is a warning,
 * not a block. Users with pinned legacy scripts get a grace period.
 */

import chalk from 'chalk';

const REPLACEMENT: Record<string, { v2: string; explainer: string }> = {
  ugc: {
    v2: 'agent-media selfie',
    explainer:
      'v2 selfie ships a fully on-model character via a portrait → multi-pose sheet → wireframe → Seedance pipeline. Higher quality, consistent across clips, supports saved character ids.',
  },
  'show-your-app': {
    v2: 'agent-media selfie  (Show Your App as a v2 product is on the roadmap)',
    explainer:
      'For now, generate a selfie talking about your app + record a screen capture separately. The v2 "Show Your App" generator will land soon and ship the composite end-to-end.',
  },
  'laptop-ugc': {
    v2: 'agent-media selfie  (Laptop UGC as a v2 product is on the roadmap)',
    explainer:
      'Use selfie for the talking-head; capture the laptop screen separately for now.',
  },
  'character-video': {
    v2: 'agent-media selfie --character <char_id>',
    explainer:
      'In v2, characters are first-class objects. Create one with `agent-media character create --photo X.png --name slug`, then reuse the returned char_xxxxxxxxxx across every selfie.',
  },
  'text-to-video': {
    v2: 'agent-media selfie',
    explainer:
      'Plain text-to-video without a character isn\'t a v2 generator. Use selfie with a saved character or a photo.',
  },
  subtitle: {
    v2: 'agent-media subs',
    explainer:
      'v2 `subs` ships the same 17 styles (Hormozi, neon, minimal, …) plus optional --transcript override and Whisper fallback.',
  },
  'product-acting': {
    v2: 'agent-media selfie  (Product Acting as a v2 product is on the roadmap)',
    explainer:
      'For now, generate the talking-head with selfie. The v2 "Product Acting" generator (product-in-hands UGC) is on the roadmap.',
  },
};

/**
 * Called at the top of every legacy command's action.
 */
export function printDeprecation(command: string): void {
  const r = REPLACEMENT[command];
  if (!r) return;
  const banner =
    chalk.yellow.bold('⚠  DEPRECATED v1 command: ') +
    chalk.yellow(`agent-media ${command}`) +
    '\n' +
    chalk.yellow(`   Use instead: ${chalk.bold(r.v2)}`) +
    '\n' +
    chalk.dim(`   Why: ${r.explainer}`) +
    '\n' +
    chalk.dim(
      '   This command will continue to run for backwards compat, but new agents must use the v2 command.',
    ) +
    '\n';
  process.stderr.write(banner);
}
