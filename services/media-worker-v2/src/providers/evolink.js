// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * EvoLink adapter (default video provider).
 *
 * Runs Seedance 2.0 reference-to-video at 720p. Model is overridable with
 * EVOLINK_SEEDANCE_MODEL for pinning or experimentation.
 */

import { runGeneration } from '../evolink-client.js';

const DEFAULT_MODEL = 'seedance-2.0-reference-to-video';

export const evolinkProvider = {
  name: 'evolink',
  requiredEnv: ['EVOLINK_API_KEY (or EVOLINK_API_KEYS)'],

  isConfigured() {
    return Boolean(process.env.EVOLINK_API_KEY || process.env.EVOLINK_API_KEYS);
  },

  /**
   * @param {object} request neutral request from normalizeRequest()
   * @param {object} [options] { timeoutMs, model }
   * @returns {Promise<string>} video URL
   */
  async generateVideo(request, options = {}) {
    const model =
      options.model || process.env.EVOLINK_SEEDANCE_MODEL || DEFAULT_MODEL;

    return runGeneration(
      model,
      {
        prompt: request.prompt,
        image_urls: request.imageUrls,
        duration: request.durationSeconds,
        aspect_ratio: request.aspectRatio,
        generate_audio: request.generateAudio,
        quality: request.quality,
      },
      { timeoutMs: options.timeoutMs },
    );
  },
};
