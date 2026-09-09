// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Which OpenAI image model each catalog id maps to, and the quality tier
 * it is priced and verified at.
 *
 * Mirrors the `image` block of V2_MODELS in @agentmedia/schema/v2 (the
 * source of truth); a test asserts the two tables agree. Everything that
 * paints an image reads this file, so switching the default is one line
 * here plus one line in the catalog, never a hunt through the pipelines.
 *
 * DEFAULT_IMAGE_MODEL is what the portrait, character sheet, wireframe
 * and crazy-look stages use: they build the identity a video is rendered
 * from, so they follow the catalog default rather than pinning an id.
 */

export const IMAGE_MODELS = {
  'gpt-image-2.5': { providerModel: 'gpt-image-2.5-sunburst', quality: 'high' },
  'gpt-image-2.5-flare': { providerModel: 'gpt-image-2.5-flare', quality: 'high' },
  'gpt-image-2': { providerModel: 'gpt-image-2', quality: 'medium' },
};

/** The catalog default (V2_DEFAULT_MODEL.image). */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5';

/** Provider id + quality for a catalog id. Unknown ids fall back to the default. */
export function resolveImageModel(model) {
  return IMAGE_MODELS[model ?? DEFAULT_IMAGE_MODEL] ?? IMAGE_MODELS[DEFAULT_IMAGE_MODEL];
}

/** The provider id the identity stages (portrait, sheet, wireframe) paint with. */
export const DEFAULT_PROVIDER_IMAGE_MODEL = IMAGE_MODELS[DEFAULT_IMAGE_MODEL].providerModel;
