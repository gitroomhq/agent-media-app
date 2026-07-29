#!/usr/bin/env node
// Throwaway end-to-end test of the new Selfie pipeline.
//   1. gpt-image-2 → portrait  (text-only)
//   2. gpt-image-2 → character sheet  (portrait as reference)
//   3. gpt-image-2 → wireframe  (sheet as reference)
//   4. Seedance 2.0 ref-to-video  (sheet + wireframe → mp4)
//
// Intermediates are uploaded to R2 so Seedance can read them.
// No DB, no caching. Single throwaway run.

import { readFileSync, writeFileSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ── env ────────────────────────────────────────────────────────────────────
for (const line of readFileSync('/tmp/test-selfie.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const must = ['OPENAI_API_KEY', 'EVOLINK_API_KEY', 'R2_ACCESS_KEY_ID',
              'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_PUBLIC_URL'];
for (const k of must) if (!process.env[k]) { console.error('missing', k); process.exit(1); }

// ── R2 ─────────────────────────────────────────────────────────────────────
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function uploadR2(key, buf, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

// ── gpt-image-2 — text-only (Stage A: portrait) ────────────────────────────
async function gptImageText(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size: '1024x1536',
      quality: 'medium',
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`gpt-image-2 text failed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// ── gpt-image-2 — with image refs (Stages B & C) ───────────────────────────
async function gptImageEdit(prompt, refBuffers, size = '1024x1536') {
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', 'medium');
  form.append('n', '1');
  refBuffers.forEach((buf, i) => {
    form.append('image[]', new Blob([buf], { type: 'image/png' }), `ref-${i}.png`);
  });
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`gpt-image-2 edit failed ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return Buffer.from(j.data[0].b64_json, 'base64');
}

// ── EvoLink — Seedance 2.0 ref-to-video (Stage D) ─────────────────────────
async function seedanceRefToVideo({ prompt, image_urls, duration = 8, aspect_ratio = '9:16' }) {
  const submit = await fetch('https://api.evolink.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EVOLINK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'seedance-2.0-reference-to-video',
      prompt,
      image_urls,
      duration,
      aspect_ratio,
      generate_audio: true,
      quality: '720p',
    }),
  });
  if (!submit.ok) throw new Error(`evolink submit failed ${submit.status}: ${await submit.text()}`);
  const { id } = await submit.json();
  console.log(`    seedance task id: ${id}`);

  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const poll = await fetch(`https://api.evolink.ai/v1/tasks/${id}`, {
      headers: { Authorization: `Bearer ${process.env.EVOLINK_API_KEY}` },
    });
    if (!poll.ok) {
      console.warn(`    poll transient ${poll.status}, retrying...`);
      continue;
    }
    const task = await poll.json();
    process.stdout.write(`\r    status: ${task.status}${task.progress != null ? ` ${task.progress}%` : ''}     `);
    if (task.status === 'completed' || task.status === 'succeeded') {
      console.log();
      const url = task.video_url || task.output?.video_url || task.outputs?.[0]?.url;
      if (!url) throw new Error(`no video_url in response: ${JSON.stringify(task)}`);
      return url;
    }
    if (task.status === 'failed' || task.status === 'error') {
      console.log();
      throw new Error(`seedance failed: ${JSON.stringify(task)}`);
    }
  }
  throw new Error('seedance polling timed out');
}

// ── inputs ─────────────────────────────────────────────────────────────────
const DESCRIPTION = '25, Asian, long wavy dark hair, soft natural skin with visible pores and slight freckles, casual confident vibe, no makeup look';
const SCRIPT      = "I wasn't sure about this at first, but honestly? It's been three weeks and my hair is the best it's been in a year. Link's in my bio.";
const PRESET      = 'bedroom-morning-ritual';
const VIBE        = 'excited';
const DURATION    = 8;

const REALISM = `Critical realism rules (must all be visible in the frame):
- skin shows pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb), realistic shadows;
- handheld iPhone front-camera framing, slight tilt, imperfect centering, gentle motion blur;
- 9:16 vertical, looks like raw iPhone footage, NOT a studio shot;
- NO plastic AI sheen, NO uncanny symmetry, NO ultra-smoothed skin;
- subtle asymmetry: head tilt, blink, micro-expressions.`;

const PRESET_BRIEF = 'Setting: bedroom corner with bed in frame. Soft window daylight + warm bedside-lamp glow on the other side of the face. Outfit: ribbed cotton tank. One hand mid hair-touch.';

const log = (...a) => console.log(...a);
const t0 = Date.now();
const job = `selfie-test-${Date.now()}`;

// ── run ────────────────────────────────────────────────────────────────────
try {
  // STAGE A — portrait
  log('\n[A] portrait (gpt-image-2, text-only)…');
  const portraitPrompt = [
    `Hyper-realistic iPhone selfie portrait of: ${DESCRIPTION}.`,
    PRESET_BRIEF,
    'Subject looks at the camera with a relaxed micro-smile, mouth slightly parted.',
    REALISM,
  ].join('\n\n');
  const portraitBuf = await gptImageText(portraitPrompt);
  writeFileSync('/tmp/test-selfie-portrait.png', portraitBuf);
  const portraitUrl = await uploadR2(`${job}/portrait.png`, portraitBuf, 'image/png');
  log('    ✓ portrait', portraitUrl);

  // STAGE B — character sheet
  log('\n[B] character sheet (gpt-image-2, portrait as reference)…');
  const sheetPrompt = [
    `Build a CHARACTER SHEET for the same person shown in the reference image.`,
    `8 cells in a 2×4 grid on a clean off-white background. Each cell shows the SAME person — identical face, hair colour, freckles, ethnicity, body — in a different pose/expression:`,
    `1) frontal headshot · 2) 3/4 angle · 3) side profile · 4) smiling open mouth · 5) hand touching hair · 6) holding a small bottle mid-chest · 7) seated relaxed · 8) walking 3/4.`,
    REALISM,
    'Treat this as a reference sheet that another AI will use to keep this character consistent. Faces must be IDENTICAL across cells.',
  ].join('\n\n');
  const sheetBuf = await gptImageEdit(sheetPrompt, [portraitBuf], '1536x1024');
  writeFileSync('/tmp/test-selfie-sheet.png', sheetBuf);
  const sheetUrl = await uploadR2(`${job}/sheet.png`, sheetBuf, 'image/png');
  log('    ✓ sheet', sheetUrl);

  // STAGE C — wireframe (the actual scene composition for Seedance)
  log('\n[C] wireframe (gpt-image-2, sheet as reference)…');
  const wireframePrompt = [
    `Compose a single iPhone-selfie still of the SAME PERSON shown in the reference sheet, captured mid-syllable while saying her line. ONE frame, vertical 9:16.`,
    PRESET_BRIEF,
    'Pose: subject is talking to the front camera, head tilted slightly, one hand caught mid hair-touch. Eyes slightly off-center to camera, NOT a dead stare.',
    'This frame becomes the first frame of an 8-second TikTok-style video.',
    REALISM,
  ].join('\n\n');
  const wireBuf = await gptImageEdit(wireframePrompt, [sheetBuf]);
  writeFileSync('/tmp/test-selfie-wireframe.png', wireBuf);
  const wireUrl = await uploadR2(`${job}/wireframe.png`, wireBuf, 'image/png');
  log('    ✓ wireframe', wireUrl);

  // STAGE D — Seedance ref-to-video
  log('\n[D] Seedance 2.0 ref-to-video (sheet + wireframe → mp4)…');
  const seedancePrompt = [
    `The woman in the reference images is talking to the camera in her bedroom. Handheld iPhone front-camera selfie.`,
    `She says, with a calm-excited tone, exactly: "${SCRIPT}"`,
    `Native lip-sync to her voice. One hand mid hair-touch through the shot, slight head tilt, eyes meeting then drifting off-camera, mid-syllable mouth movements throughout, natural blinks, soft skin with visible pores, single mixed light source.`,
    `Strictly 9:16 vertical, 720p, ${DURATION}s, no captions, no overlay text, no zoom, slight handheld micro-shake.`,
  ].join('\n\n');
  const videoUrl = await seedanceRefToVideo({
    prompt: seedancePrompt,
    image_urls: [sheetUrl, wireUrl],
    duration: DURATION,
    aspect_ratio: '9:16',
  });
  log('    ✓ video', videoUrl);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  log('\n══════════════════════════════════════════════════════');
  log('  Selfie test COMPLETE');
  log('══════════════════════════════════════════════════════');
  log('  portrait :', portraitUrl);
  log('  sheet    :', sheetUrl);
  log('  wireframe:', wireUrl);
  log('  video    :', videoUrl);
  log('  wall time:', dt, 'sec');
  log('  est cost : ~$0.93  (3× gpt-image-2 + 8s Seedance)');
} catch (err) {
  console.error('\n✗ test failed:', err.message);
  process.exit(1);
}
