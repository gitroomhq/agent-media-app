// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Strip sexual descriptors from image prompts before they reach OpenAI's
 * gpt-image safety system, which hard-rejects them (`safety_violations=
 * [sexual]` → OPENAI_400). We keep the *attractive / polished* intent — the
 * visual style is unchanged — we just never send the trigger words. Word-
 * boundary, case-insensitive; preserves surrounding capitalization loosely.
 */

// Map of banned word -> safe replacement. '' means drop the word entirely.
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsexy\b/gi, 'attractive'],
  [/\bsexier\b/gi, 'more attractive'],
  [/\bsexiest\b/gi, 'most attractive'],
  [/\bseductive(ly)?\b/gi, 'confident'],
  [/\bsultry\b/gi, 'poised'],
  [/\bsensual(ly)?\b/gi, 'elegant'],
  [/\bprovocative(ly)?\b/gi, 'bold'],
  [/\balluring\b/gi, 'striking'],
  [/\bflirty\b/gi, 'playful'],
  [/\bbusty\b/gi, ''],
  [/\bvoluptuous\b/gi, ''],
  [/\bcurvaceous\b/gi, ''],
  [/\bcleavage\b/gi, 'neckline'],
  [/\blow-cut\b/gi, ''],
  [/\brevealing\b/gi, ''],
  [/\bskimpy\b/gi, ''],
  [/\berotic(a|ally)?\b/gi, ''],
  [/\bsensuous\b/gi, 'elegant'],
  [/\blingerie\b/gi, 'outfit'],
  [/\bnaked\b/gi, ''],
  [/\bnude\b/gi, ''],
  [/\btopless\b/gi, ''],
  [/\bbabe\b/gi, 'woman'],
  [/\bbombshell\b/gi, ''],
  // Additional commonly-flagged sexual/explicit descriptors (Sentry: recurring
  // OPENAI_400 safety rejections). Generic words (e.g. "hot", "bikini") are
  // intentionally NOT stripped — they're often legitimate for UGC.
  [/\bthong\b/gi, ''],
  [/\bpanties\b/gi, ''],
  [/\bunderwear\b/gi, 'outfit'],
  [/\bscantily\b/gi, ''],
  [/\bstripper\b/gi, 'dancer'],
  [/\btwerk(ing)?\b/gi, 'dancing'],
  [/\bboobs?\b/gi, ''],
  [/\bbreasts?\b/gi, ''],
  [/\bbooty\b/gi, ''],
  [/\bnipples?\b/gi, ''],
  [/\bhorny\b/gi, ''],
  [/\bkinky\b/gi, ''],
  [/\bfetish\b/gi, ''],
  [/\bmoan(ing)?\b/gi, ''],
  [/\borgasm(ic)?\b/gi, ''],
  [/\bthicc\b/gi, ''],
];

/** Returns the prompt with sexual descriptors replaced/removed and whitespace tidied. */
export function sanitizeImagePrompt(prompt: string): string {
  let out = prompt;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  // Collapse the double spaces / dangling commas left by dropped words.
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** True if the original prompt contained any banned descriptor (for logging). */
export function hadBannedTerms(prompt: string): boolean {
  return REPLACEMENTS.some(([re]) => {
    re.lastIndex = 0;
    return re.test(prompt);
  });
}
