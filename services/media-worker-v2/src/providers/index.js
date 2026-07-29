// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Video provider registry.
 *
 * Adding a new video backend should be a CONFIG change, not a code change in
 * every pipeline. Each adapter implements one interface, registers itself here,
 * and callers resolve one by name — they never branch on the provider.
 *
 * ── The VideoProvider interface ───────────────────────────────────────────
 *
 *   name          string
 *   requiredEnv   string[]                        // for a useful error message
 *   isConfigured() -> boolean                     // are those env keys present?
 *   generateVideo(request, options) -> Promise<string>   // resolves to a video URL
 *
 * `request` is provider-NEUTRAL (see normalizeRequest below):
 *   { prompt, imageUrls[], durationSeconds, aspectRatio, generateAudio, quality }
 *
 * Each adapter translates that into its own vendor dialect (e.g. BytePlus calls
 * aspectRatio "ratio"), so vendor quirks stay inside the adapter.
 *
 * To add a provider: create ./<name>.js exporting an adapter object, import it
 * below, and add it to PROVIDERS. Nothing else in the codebase changes.
 */

import { evolinkProvider } from './evolink.js';
import { byteplusProvider } from './byteplus.js';

const PROVIDERS = {
  [evolinkProvider.name]: evolinkProvider,
  [byteplusProvider.name]: byteplusProvider,
};

export const DEFAULT_VIDEO_PROVIDER = 'evolink';

/** Every registered provider name (for docs, health checks, error messages). */
export function listVideoProviders() {
  return Object.keys(PROVIDERS);
}

/**
 * Resolve a provider by name, falling back to the VIDEO_PROVIDER env var and
 * then to the default. Throws a helpful error for an unknown name, or for a
 * provider whose credentials are missing.
 */
export function getVideoProvider(name) {
  const requested = String(
    name || process.env.VIDEO_PROVIDER || DEFAULT_VIDEO_PROVIDER,
  ).toLowerCase();

  const provider = PROVIDERS[requested];
  if (!provider) {
    throw new Error(
      `Unknown VIDEO_PROVIDER "${requested}". Available: ${listVideoProviders().join(', ')}`,
    );
  }
  if (!provider.isConfigured()) {
    throw new Error(
      `Video provider "${requested}" is selected but not configured. ` +
        `Set: ${provider.requiredEnv.join(', ')}`,
    );
  }
  return provider;
}

/**
 * Normalize a call into the neutral request shape every adapter accepts.
 * Duration is clamped to the supported 5-15s window here, once, instead of
 * being re-clamped in each pipeline.
 */
export function normalizeRequest({
  prompt,
  imageUrls = [],
  duration = 10,
  aspectRatio = '9:16',
  generateAudio = true,
  quality = '720p',
}) {
  return {
    prompt,
    imageUrls,
    durationSeconds: Math.min(Math.max(Number(duration) || 10, 5), 15),
    aspectRatio,
    generateAudio,
    quality,
  };
}

/**
 * Resolve + normalize + call, in one step. This is what pipelines use.
 * @returns {Promise<string>} video URL
 */
export async function generateVideo(request, options = {}) {
  const provider = getVideoProvider(options.provider);
  const normalized = normalizeRequest(request);
  return provider.generateVideo(normalized, options);
}
