// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * BytePlus ModelArk adapter.
 *
 * Runs Dreamina Seedance (fast variant by default). Vendor quirks live here:
 * BytePlus calls the aspect ratio "ratio", takes an explicit watermark flag,
 * and has no 720p/quality knob.
 */

import { runVideoGeneration, BYTEPLUS_MODELS } from '../byteplus-client.js';

export const byteplusProvider = {
  name: 'byteplus',
  requiredEnv: ['ARK_API_KEY'],

  isConfigured() {
    return Boolean(process.env.ARK_API_KEY);
  },

  /**
   * @param {object} request neutral request from normalizeRequest()
   * @param {object} [options] { timeoutMs, model }
   * @returns {Promise<string>} video URL
   */
  async generateVideo(request, options = {}) {
    const model =
      options.model ||
      process.env.BYTEPLUS_SEEDANCE_MODEL ||
      BYTEPLUS_MODELS.SEEDANCE_2_0_FAST;

    return runVideoGeneration(
      model,
      {
        prompt: request.prompt,
        image_urls: request.imageUrls,
        duration: request.durationSeconds,
        // BytePlus dialect: "ratio", not "aspect_ratio".
        ratio: request.aspectRatio,
        generate_audio: request.generateAudio,
        watermark: false,
      },
      { timeoutMs: options.timeoutMs },
    );
  },
};
