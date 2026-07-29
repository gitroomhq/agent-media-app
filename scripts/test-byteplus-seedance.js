#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * One-shot test for the BytePlus ModelArk Seedance 2.0 fast integration.
 *
 * Submits a reference-to-video task using two real R2-hosted images,
 * polls until done, and prints the full task object so we can verify
 * the response shape (status field name, video URL location, etc.)
 * before we flip VIDEO_PROVIDER=byteplus on production traffic.
 *
 * Usage:
 *   ARK_API_KEY=... node scripts/test-byteplus-seedance.js
 *
 * Optional env:
 *   BYTEPLUS_ARK_BASE_URL    override base URL (default ap-southeast)
 *   BYTEPLUS_TEST_PROMPT     override the prompt
 *   BYTEPLUS_TEST_IMAGE_1    override character sheet URL
 *   BYTEPLUS_TEST_IMAGE_2    override storyboard URL
 *   BYTEPLUS_TEST_DURATION   override duration (default 5)
 *   BYTEPLUS_TEST_RATIO      override ratio (default '9:16')
 */

import {
  submitVideoTask,
  pollVideoTask,
  extractVideoUrl,
  BYTEPLUS_MODELS,
} from '../services/media-worker-v2/src/byteplus-client.js';

const PROMPT = process.env.BYTEPLUS_TEST_PROMPT
  ?? 'Scene: a friendly chef stands in a sunlit Brooklyn kitchen at golden hour, smiling at the camera, then takes a bite of fresh bread. image 1 = character likeness reference. image 2 = action / staging reference. real-world environment with natural lighting, depth of field. NEVER show a plain studio backdrop, parchment, or panel grids. one continuous cinematic shot.';

// Real R2 URLs from the homepage trio gallery (Marco the chef).
const IMAGE_1 = process.env.BYTEPLUS_TEST_IMAGE_1
  ?? 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/d9358286-c52b-40d0-90ac-64705dcafa47/character-sheet.png';
const IMAGE_2 = process.env.BYTEPLUS_TEST_IMAGE_2
  ?? 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/6053f946-a893-4010-825b-26a6ffaed91e/storyboard.png';

const DURATION = Number(process.env.BYTEPLUS_TEST_DURATION ?? 5);
const RATIO = process.env.BYTEPLUS_TEST_RATIO ?? '9:16';

async function main() {
  if (!process.env.ARK_API_KEY) {
    console.error('ERROR: ARK_API_KEY is not set.');
    process.exit(1);
  }

  console.log('--- BytePlus ModelArk Seedance 2.0 fast smoke test ---');
  console.log(`Model:     ${BYTEPLUS_MODELS.SEEDANCE_2_0_FAST}`);
  console.log(`Duration:  ${DURATION}s`);
  console.log(`Ratio:     ${RATIO}`);
  console.log(`Image 1:   ${IMAGE_1}`);
  console.log(`Image 2:   ${IMAGE_2}`);
  console.log(`Prompt:    ${PROMPT.slice(0, 120)}${PROMPT.length > 120 ? '…' : ''}`);
  console.log('');

  const t0 = Date.now();
  console.log('Submitting...');
  const submission = await submitVideoTask(
    BYTEPLUS_MODELS.SEEDANCE_2_0_FAST,
    {
      prompt: PROMPT,
      image_urls: [IMAGE_1, IMAGE_2],
      duration: DURATION,
      ratio: RATIO,
      generate_audio: true,
      watermark: false,
    },
  );
  console.log(`Submission response (verify shape): ${JSON.stringify(submission)}`);
  const taskId = submission.id;
  console.log(`Task id: ${taskId}`);
  console.log('');

  console.log('Polling...');
  const completed = await pollVideoTask(taskId, { timeoutMs: 30 * 60 * 1000 });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log('=== COMPLETED ===');
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Full response: ${JSON.stringify(completed, null, 2)}`);
  console.log('');

  const videoUrl = extractVideoUrl(completed);
  if (videoUrl) {
    console.log(`✅ video_url: ${videoUrl}`);
  } else {
    console.error('❌ Could not extract a video URL — inspect the full response above and update extractVideoUrl().');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
