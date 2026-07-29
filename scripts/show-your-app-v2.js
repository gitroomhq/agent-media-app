#!/usr/bin/env node

/**
 * "Show Your App" Pipeline v2 — GPT Image + Seedance
 *
 * 1. MJ green screen image (pre-generated, passed as input)
 * 2. GPT Image 2 replaces green screen with app screenshot
 * 3. Seedance 2.0 animates (app stays static)
 * 4. FFmpeg trims first 0.3s
 *
 * Usage:
 *   EVOLINK_API_KEY=xxx node scripts/show-your-app-v2.js \
 *     --greenscreen path/to/mj-greenscreen.png \
 *     --app path/to/app-screenshot.png \
 *     --script "what the actor says" \
 *     --output output.mp4 \
 *     [--duration 5]
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const API_KEY = process.env.EVOLINK_API_KEY;
if (!API_KEY) { console.error('Set EVOLINK_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const greenscreenPath = getArg('--greenscreen');
const appScreenshot = getArg('--app');
const outputPath = getArg('--output') || 'show-your-app-v2-output.mp4';
const duration = parseInt(getArg('--duration') || '5');
const script = getArg('--script') || 'Oh my god, you really need to try this app';

if (!greenscreenPath || !appScreenshot) {
  console.error('Usage: --greenscreen <mj.png> --app <app.png> --script "..." [--output out.mp4] [--duration 5]');
  process.exit(1);
}

const WORK_DIR = '/tmp/show-your-app-v2-' + Date.now();
mkdirSync(WORK_DIR, { recursive: true });

console.log('=== Show Your App v2 (GPT Image + Seedance) ===');
console.log(`Green screen: ${greenscreenPath}`);
console.log(`App: ${appScreenshot}`);
console.log(`Script: "${script}"`);
console.log(`Output: ${outputPath}\n`);

// ── Step 1: Upload both images ──────────────────────────────────────────────

console.log('Step 1: Uploading images...');

// Resize green screen for upload
execSync(`python3 -c "
import cv2
img = cv2.imread('${greenscreenPath}')
small = cv2.resize(img, (540, 960))
cv2.imwrite('${WORK_DIR}/gs.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 85])
"`);

const gsUrl = JSON.parse(execSync(
  `curl -s -X POST "https://freeimage.host/api/1/upload" -F "source=@${WORK_DIR}/gs.jpg" -F "key=6d207e02198a847aa98d0a2a901485a5"`,
  { encoding: 'utf-8' }
))?.image?.url;

const appUrl = JSON.parse(execSync(
  `curl -s -X POST "https://freeimage.host/api/1/upload" -F "source=@${appScreenshot}" -F "key=6d207e02198a847aa98d0a2a901485a5"`,
  { encoding: 'utf-8' }
))?.image?.url;

if (!gsUrl || !appUrl) { console.error('Upload failed'); process.exit(1); }
console.log(`  GS: ${gsUrl}`);
console.log(`  App: ${appUrl}\n`);

// ── Step 2: GPT Image 2 — replace green screen with app ──────────────────

console.log('Step 2: GPT Image 2 compositing...');
const gptRes = await fetch('https://api.evolink.ai/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt: 'Take the green phone screen in the first image and replace it with the app screenshot from the second image. The app should be perfectly aligned and tilted to match the phone angle. Keep everything else unchanged.',
    image_urls: [gsUrl, appUrl],
  }),
});
const gptData = await gptRes.json();
const gptTaskId = gptData.id;
if (!gptTaskId) { console.error('GPT submit failed:', JSON.stringify(gptData)); process.exit(1); }
console.log(`  Task: ${gptTaskId}`);

// Poll GPT
let compositeUrl;
for (let i = 0; i < 60; i++) {
  const res = await fetch(`https://api.evolink.ai/v1/tasks/${gptTaskId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const data = await res.json();
  if (data.status === 'completed') {
    compositeUrl = data.results?.[0];
    console.log('  Done!\n');
    break;
  }
  if (data.status === 'failed') { console.error('  FAILED:', data.error?.message); process.exit(1); }
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 3000));
}
if (!compositeUrl) { console.error('  GPT timed out'); process.exit(1); }

// Download composite and resize for Seedance
const compositeImg = await fetch(compositeUrl);
writeFileSync(`${WORK_DIR}/gpt-composite.png`, Buffer.from(await compositeImg.arrayBuffer()));
execSync(`python3 -c "
import cv2
img = cv2.imread('${WORK_DIR}/gpt-composite.png')
small = cv2.resize(img, (540, 960))
cv2.imwrite('${WORK_DIR}/composite-upload.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 85])
"`);

const compositeUploadUrl = JSON.parse(execSync(
  `curl -s -X POST "https://freeimage.host/api/1/upload" -F "source=@${WORK_DIR}/composite-upload.jpg" -F "key=6d207e02198a847aa98d0a2a901485a5"`,
  { encoding: 'utf-8' }
))?.image?.url;
if (!compositeUploadUrl) { console.error('Composite upload failed'); process.exit(1); }

// ── Step 3: Seedance 2.0 — animate ─────────────────────────────────────────

console.log('Step 3: Seedance 2.0 animation...');
const seedRes = await fetch('https://api.evolink.ai/v1/videos/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'seedance-2.0-image-to-video',
    prompt: `A person talking to camera while holding a phone. They say: "${script}". The phone screen shows a fixed static image like a photograph. The screen content is frozen and unchanging throughout. Natural facial movement only.`,
    image_urls: [compositeUploadUrl],
    duration,
    aspect_ratio: '9:16',
    generate_audio: true,
  }),
});
const seedData = await seedRes.json();
const seedTaskId = seedData.id;
if (!seedTaskId) { console.error('Seedance failed:', JSON.stringify(seedData)); process.exit(1); }
console.log(`  Task: ${seedTaskId}`);
console.log(`  Credits: ${(gptData.usage?.credits_reserved || 0) + (seedData.usage?.credits_reserved || 0)} total\n`);

// Poll Seedance
console.log('Step 4: Waiting for render...');
let videoUrl;
for (let i = 0; i < 150; i++) {
  const res = await fetch(`https://api.evolink.ai/v1/tasks/${seedTaskId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const data = await res.json();
  if (data.status === 'completed') {
    videoUrl = data.results?.[0];
    console.log('\n  Completed!\n');
    break;
  }
  if (data.status === 'failed') { console.error('  FAILED:', data.error?.message); process.exit(1); }
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 5000));
}
if (!videoUrl) { console.error('  Timed out'); process.exit(1); }

// ── Step 5: Download + trim ─────────────────────────────────────────────────

console.log('Step 5: Download + trim...');
const vid = await fetch(videoUrl);
writeFileSync(`${WORK_DIR}/raw.mp4`, Buffer.from(await vid.arrayBuffer()));
execSync(`ffmpeg -y -i ${WORK_DIR}/raw.mp4 -ss 0.3 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k ${outputPath} 2>/dev/null`);

console.log(`\n=== Done! ===`);
console.log(`Output: ${outputPath}`);
console.log(`Composite: ${WORK_DIR}/gpt-composite.png`);
