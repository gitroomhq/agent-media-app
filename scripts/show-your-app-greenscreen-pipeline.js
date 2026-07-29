#!/usr/bin/env node

/**
 * "Show Your App" Green Screen Pipeline
 *
 * Alternative pipeline that uses green screen post-compositing:
 * 1. Takes a pre-generated MJ green screen image
 * 2. Sends GREEN SCREEN image to Seedance (no app yet)
 * 3. Seedance animates the actor (green screen stays stable)
 * 4. OpenCV replaces green pixels with app screenshot frame-by-frame
 *
 * This produces a more stable app screen since the app is composited
 * AFTER video generation, so Seedance can't animate/distort it.
 *
 * Usage:
 *   EVOLINK_API_KEY=xxx node scripts/show-your-app-greenscreen-pipeline.js \
 *     --greenscreen path/to/mj-greenscreen.png \
 *     --app path/to/app-screenshot.png \
 *     --output output.mp4 \
 *     [--duration 5]
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';

const API_KEY = process.env.EVOLINK_API_KEY;
if (!API_KEY) {
  console.error('Set EVOLINK_API_KEY environment variable');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

const greenscreenPath = getArg('--greenscreen');
const appScreenshot = getArg('--app');
const outputPath = getArg('--output') || 'show-your-app-gs-output.mp4';
const duration = parseInt(getArg('--duration') || '5');
const script = getArg('--script') || 'Oh my god, you really need to try this app';

if (!greenscreenPath || !appScreenshot) {
  console.error('Usage: --greenscreen <mj-greenscreen.png> --app <app-screenshot.png> --script "what the actor says" [--output out.mp4] [--duration 5]');
  process.exit(1);
}

const WORK_DIR = '/tmp/show-your-app-gs-' + Date.now();
mkdirSync(WORK_DIR, { recursive: true });

console.log('=== Show Your App — Green Screen Pipeline ===');
console.log(`Green screen: ${greenscreenPath}`);
console.log(`App: ${appScreenshot}`);
console.log(`Output: ${outputPath}`);
console.log(`Duration: ${duration}s`);
console.log(`Work dir: ${WORK_DIR}\n`);

// ── Step 1: Upload green screen image for Seedance ──────────────────────────

console.log('Step 1: Uploading green screen image...');
execSync(`python3 -c "
import cv2
img = cv2.imread('${greenscreenPath}')
small = cv2.resize(img, (540, 960))
cv2.imwrite('${WORK_DIR}/gs-upload.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 85])
"`);

const uploadResult = execSync(
  `curl -s -X POST "https://freeimage.host/api/1/upload" -F "source=@${WORK_DIR}/gs-upload.jpg" -F "key=6d207e02198a847aa98d0a2a901485a5"`,
  { encoding: 'utf-8' }
);
const imgUrl = JSON.parse(uploadResult)?.image?.url;
if (!imgUrl) {
  console.error('Upload failed');
  process.exit(1);
}
console.log(`  URL: ${imgUrl}\n`);

// ── Step 2: Seedance with green screen ──────────────────────────────────────

console.log('Step 2: Generating video with Seedance 2.0 (green screen)...');
const seedanceRes = await fetch('https://api.evolink.ai/v1/videos/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'seedance-2.0-image-to-video',
    prompt: `A woman holding a smartphone with a green screen to the camera. She speaks excitedly saying: "${script}". Only her face moves. The phone and the green screen stay completely still.`,
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
console.log(`  Task: ${taskId}\n`);

// ── Step 3: Poll ────────────────────────────────────────────────────────────

console.log('Step 3: Waiting for render...');
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
if (!videoUrl) { console.error('  Timed out'); process.exit(1); }

// ── Step 4: Download + re-encode for OpenCV ─────────────────────────────────

console.log('Step 4: Downloading...');
const vid = await fetch(videoUrl);
writeFileSync(`${WORK_DIR}/seedance-raw.mp4`, Buffer.from(await vid.arrayBuffer()));
execSync(`ffmpeg -y -i ${WORK_DIR}/seedance-raw.mp4 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ${WORK_DIR}/seedance-reencode.mp4 2>/dev/null`);

// ── Step 5: OpenCV green screen replacement ─────────────────────────────────

console.log('Step 5: Replacing green screen with app screenshot...');
const pyResult = execSync(`python3 -c '
import cv2, numpy as np

cap = cv2.VideoCapture("${WORK_DIR}/seedance-reencode.mp4")
fps = cap.get(cv2.CAP_PROP_FPS)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

content = cv2.imread("${appScreenshot}")

fourcc = cv2.VideoWriter_fourcc(*"mp4v")
out = cv2.VideoWriter("${WORK_DIR}/composite.mp4", fourcc, fps, (W, H))

frame_idx = 0
detected = 0
while True:
    ret, frame = cap.read()
    if not ret: break
    frame_idx += 1
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    green = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([90, 255, 255]))
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, k, iterations=3)
    green = cv2.morphologyEx(green, cv2.MORPH_OPEN, k, iterations=1)
    eroded = cv2.erode(green, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (12, 12)))
    contours, _ = cv2.findContours(eroded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours or cv2.contourArea(max(contours, key=cv2.contourArea)) < 300:
        out.write(frame)
        continue
    detected += 1
    largest = max(contours, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(largest)
    game_resized = cv2.resize(content, (bw, bh), interpolation=cv2.INTER_AREA)
    game_layer = np.zeros_like(frame)
    gy1, gy2 = max(0, y), min(H, y + bh)
    gx1, gx2 = max(0, x), min(W, x + bw)
    cy1, cy2 = gy1 - y, gy1 - y + (gy2 - gy1)
    cx1, cx2 = gx1 - x, gx1 - x + (gx2 - gx1)
    game_layer[gy1:gy2, gx1:gx2] = game_resized[cy1:cy2, cx1:cx2]
    mf = cv2.GaussianBlur(eroded, (5, 5), 0).astype(np.float32) / 255.0
    m3 = cv2.merge([mf, mf, mf])
    result = frame.astype(np.float32) * (1 - m3) + game_layer.astype(np.float32) * m3
    out.write(np.clip(result, 0, 255).astype(np.uint8))
cap.release()
out.release()
print(f"{detected}/{frame_idx}")
'`, { encoding: 'utf-8' });
console.log(`  Frames composited: ${pyResult.trim()}\n`);

// ── Step 6: Final encode with audio + trim ──────────────────────────────────

console.log('Step 6: Final encode + trim...');
execSync(`ffmpeg -y -i ${WORK_DIR}/composite.mp4 -i ${WORK_DIR}/seedance-raw.mp4 -map 0:v -map 1:a -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest ${WORK_DIR}/with-audio.mp4 2>/dev/null`);
execSync(`ffmpeg -y -i ${WORK_DIR}/with-audio.mp4 -ss 0.3 -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k ${outputPath} 2>/dev/null`);

console.log(`\n=== Done! ===`);
console.log(`Output: ${outputPath}`);
