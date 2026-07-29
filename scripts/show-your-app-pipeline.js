#!/usr/bin/env node

/**
 * "Show Your App" Video Pipeline
 *
 * Takes a pre-generated MJ green screen image + app screenshot,
 * composites the app onto the phone, sends to Seedance 2.0,
 * and outputs a final trimmed video.
 *
 * Usage:
 *   EVOLINK_API_KEY=xxx node scripts/show-your-app-pipeline.js \
 *     --greenscreen path/to/mj-greenscreen.png \
 *     --app path/to/app-screenshot.png \
 *     --output output.mp4 \
 *     [--prompt "custom prompt"] \
 *     [--duration 5]
 *
 * Prerequisites:
 *   - Python3 with opencv-python-headless
 *   - FFmpeg
 *   - EVOLINK_API_KEY environment variable
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const API_KEY = process.env.EVOLINK_API_KEY;
if (!API_KEY) {
  console.error('Set EVOLINK_API_KEY environment variable');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const greenscreenPath = getArg('--greenscreen');
const appScreenshot = getArg('--app');
const outputPath = getArg('--output') || 'show-your-app-output.mp4';
const duration = parseInt(getArg('--duration') || '5');
const customPrompt = getArg('--prompt');
const script = getArg('--script') || 'Oh my god, you really need to try this app';

if (!greenscreenPath || !appScreenshot) {
  console.error('Usage: --greenscreen <mj-greenscreen.png> --app <app-screenshot.png> --script "what the actor says" [--output out.mp4] [--duration 5]');
  process.exit(1);
}

const WORK_DIR = '/tmp/show-your-app-' + Date.now();
mkdirSync(WORK_DIR, { recursive: true });

const prompt = customPrompt ||
  `A woman talking to camera while holding a phone. She says: "${script}". The phone screen shows a fixed static image like a photograph. The screen content is frozen and unchanging throughout. Natural facial movement only.`;

console.log('=== Show Your App Pipeline ===');
console.log(`Green screen: ${greenscreenPath}`);
console.log(`App: ${appScreenshot}`);
console.log(`Output: ${outputPath}`);
console.log(`Duration: ${duration}s`);
console.log(`Prompt: "${prompt.substring(0, 80)}..."`);
console.log(`Work dir: ${WORK_DIR}\n`);

// ── Step 1: Composite app into green screen with rotation matching ──────────

console.log('Step 1: Compositing app into green screen (rotation-matched)...');

const compositeScript = `
import cv2, numpy as np, sys

mj = cv2.imread("${greenscreenPath}")
app = cv2.imread("${appScreenshot}")
if mj is None:
    print("ERROR: Cannot read green screen image"); sys.exit(1)
if app is None:
    print("ERROR: Cannot read app screenshot"); sys.exit(1)

h, w = mj.shape[:2]
aH, aW = app.shape[:2]

hsv = cv2.cvtColor(mj, cv2.COLOR_BGR2HSV)
mask = cv2.inRange(hsv, np.array([35, 50, 50]), np.array([85, 255, 255]))
k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=4)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, iterations=2)

contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
if not contours:
    print("ERROR: No green screen found"); sys.exit(1)

largest = max(contours, key=cv2.contourArea)
area = cv2.contourArea(largest)
if area < h * w * 0.02:
    print("ERROR: Green screen too small"); sys.exit(1)

rect = cv2.minAreaRect(largest)
box = cv2.boxPoints(rect).astype(np.float32)

s = box.sum(axis=1); d = np.diff(box, axis=1).flatten()
dst = np.zeros((4, 2), dtype=np.float32)
dst[0] = box[np.argmin(s)]
dst[2] = box[np.argmax(s)]
dst[1] = box[np.argmin(d)]
dst[3] = box[np.argmax(d)]

src = np.array([[0, 0], [aW-1, 0], [aW-1, aH-1], [0, aH-1]], dtype=np.float32)
M = cv2.getPerspectiveTransform(src, dst)
warped = cv2.warpPerspective(app, M, (w, h))

mask_eroded = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (8, 8)))
mf = cv2.GaussianBlur(mask_eroded, (5, 5), 1).astype(np.float32) / 255.0
m3 = cv2.merge([mf, mf, mf])

result = mj.astype(np.float32) * (1 - m3) + warped.astype(np.float32) * m3
result = np.clip(result, 0, 255).astype(np.uint8)

cv2.imwrite("${WORK_DIR}/composite-full.png", result)
small = cv2.resize(result, (540, 960))
cv2.imwrite("${WORK_DIR}/composite-upload.jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])
print("OK")
`;

try {
  const pyOut = execSync(`python3 -c '${compositeScript.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8' });
  console.log(`  ${pyOut.trim()}\n`);
} catch (e) {
  console.error('Composite failed:', e.stderr || e.message);
  process.exit(1);
}

// ── Step 2: Upload composite image ──────────────────────────────────────────

console.log('Step 2: Uploading composite...');
const uploadResult = execSync(
  `curl -s -X POST "https://freeimage.host/api/1/upload" -F "source=@${WORK_DIR}/composite-upload.jpg" -F "key=6d207e02198a847aa98d0a2a901485a5"`,
  { encoding: 'utf-8' }
);
let imgUrl;
try {
  imgUrl = JSON.parse(uploadResult)?.image?.url;
} catch {
  console.error('Upload parse failed:', uploadResult.substring(0, 200));
  process.exit(1);
}
if (!imgUrl) {
  console.error('Upload failed:', uploadResult.substring(0, 200));
  process.exit(1);
}
console.log(`  URL: ${imgUrl}\n`);

// ── Step 3: Submit to Seedance 2.0 ──────────────────────────────────────────

console.log('Step 3: Generating video with Seedance 2.0...');
const seedanceRes = await fetch('https://api.evolink.ai/v1/videos/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'seedance-2.0-image-to-video',
    prompt,
    image_urls: [imgUrl],
    duration,
    aspect_ratio: '9:16',
    generate_audio: true,
  }),
});
const seedanceData = await seedanceRes.json();
const taskId = seedanceData.id;
if (!taskId) {
  console.error('Seedance submit failed:', JSON.stringify(seedanceData));
  process.exit(1);
}
console.log(`  Task: ${taskId}`);
console.log(`  Credits: ${seedanceData.usage?.credits_reserved}\n`);

// ── Step 4: Poll for completion ─────────────────────────────────────────────

console.log('Step 4: Waiting for render...');
let videoUrl;
for (let i = 0; i < 150; i++) {
  const res = await fetch(`https://api.evolink.ai/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const data = await res.json();
  if (data.status === 'completed') {
    videoUrl = data.results?.[0];
    console.log('\n  Completed!\n');
    break;
  }
  if (data.status === 'failed') {
    console.error('  FAILED:', data.error?.message);
    process.exit(1);
  }
  process.stdout.write('.');
  await new Promise(r => setTimeout(r, 5000));
}

if (!videoUrl) {
  console.error('  Timed out');
  process.exit(1);
}

// ── Step 5: Download ────────────────────────────────────────────────────────

console.log('Step 5: Downloading...');
const vid = await fetch(videoUrl);
writeFileSync(`${WORK_DIR}/raw.mp4`, Buffer.from(await vid.arrayBuffer()));

// ── Step 6: Trim first 0.3s ─────────────────────────────────────────────────

console.log('Step 6: Trimming...');
execSync(`ffmpeg -y -i ${WORK_DIR}/raw.mp4 -ss 0.3 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k ${outputPath} 2>/dev/null`);

console.log(`\n=== Done! ===`);
console.log(`Output: ${outputPath}`);
console.log(`Composite image: ${WORK_DIR}/composite-full.png`);
