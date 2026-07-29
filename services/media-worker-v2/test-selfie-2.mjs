#!/usr/bin/env node
// Consistency test #2.
//
// Reuses the existing character SHEET from test #1 (R2-hosted),
// generates a fresh wireframe + Seedance video with a DIFFERENT script.
// Adds a pinned `seed` param to the Seedance call to test whether
// EvoLink accepts it on seedance-2.0-reference-to-video.
//
// Reports new portrait/wireframe/video URLs so we can compare.

import { readFileSync, writeFileSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ── env (same file as test #1) ─────────────────────────────────────────────
for (const line of readFileSync('/tmp/test-selfie.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

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

// ── gpt-image-2 image-edit ─────────────────────────────────────────────────
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

// ── Seedance 2.0 ref-to-video ──────────────────────────────────────────────
async function seedanceRefToVideo({ prompt, image_urls, duration = 8, aspect_ratio = '9:16', seed }) {
  const body = {
    model: 'seedance-2.0-reference-to-video',
    prompt,
    image_urls,
    duration,
    aspect_ratio,
    generate_audio: true,
    quality: '720p',
  };
  if (seed != null) body.seed = seed; // test whether EvoLink accepts a seed
  const submit = await fetch('https://api.evolink.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EVOLINK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
    if (!poll.ok) continue;
    const task = await poll.json();
    process.stdout.write(`\r    status: ${task.status}${task.progress != null ? ` ${task.progress}%` : ''}     `);
    if (task.status === 'completed' || task.status === 'succeeded') {
      console.log();
      const url = task.video_url || task.results?.[0] || task.output?.video_url;
      if (!url) throw new Error(`no url in response: ${JSON.stringify(task)}`);
      return url;
    }
    if (task.status === 'failed' || task.status === 'error') {
      console.log();
      throw new Error(`seedance failed: ${JSON.stringify(task)}`);
    }
  }
  throw new Error('timed out');
}

// ── Reuse the existing sheet from test #1 ──────────────────────────────────
const EXISTING_SHEET_URL = 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/selfie-test-1779376838028/sheet.png';
const PINNED_SEED = 424242;

// ── New inputs (same character, different script & scene-beat) ─────────────
const DESCRIPTION = '25, Asian, long wavy dark hair, soft natural skin with visible pores and slight freckles, casual confident vibe, no makeup look';
const NEW_SCRIPT  = "Honestly, I keep getting DMs asking what I use for my hair. It's just this one bottle. Three weeks in and it's a different life.";
const PRESET      = 'bedroom-morning-ritual';
const DURATION    = 8;

const REALISM = `Critical realism rules:
- visible skin pores, oil sheen on T-zone, baby hairs at hairline, slight under-eye softness;
- single mixed light source (soft window daylight + warm interior bulb);
- handheld iPhone front-camera framing, slight tilt, imperfect centering;
- 9:16 vertical, raw iPhone footage feel, NO studio lighting;
- NO plastic AI sheen, NO uncanny symmetry, NO smoothed skin;
- subtle asymmetry: head tilt, blink, micro-expressions.`;

const PRESET_BRIEF = 'Setting: bedroom corner with bed in frame. Soft window daylight + warm bedside lamp. Outfit: ribbed cotton tank. One hand mid hair-touch.';

// Voice-direction hint (the new lever for indirect voice consistency)
const VOICE_BRIEF = 'She speaks with a warm, slightly raspy mid-20s American female voice, relaxed and casually excited.';

const log = (...a) => console.log(...a);
const t0 = Date.now();
const job = `selfie-test-2-${Date.now()}`;

try {
  // ── Pull the existing sheet so we can pass it as a reference to gpt-image-2
  log('\n[*] Fetching existing character sheet from test #1...');
  const sheetRes = await fetch(EXISTING_SHEET_URL);
  if (!sheetRes.ok) throw new Error(`sheet fetch ${sheetRes.status}`);
  const sheetBuf = Buffer.from(await sheetRes.arrayBuffer());
  log('    ✓ sheet loaded', EXISTING_SHEET_URL);

  // ── STAGE C — new wireframe for a different beat
  log('\n[C] new wireframe (gpt-image-2, sheet as reference)…');
  const wireframePrompt = [
    `Compose a single iPhone-selfie still of the SAME PERSON shown in the reference sheet, captured mid-syllable while saying her line. ONE frame, vertical 9:16.`,
    PRESET_BRIEF,
    'Pose: subject is mid-sentence to the camera, head tilted differently than before, one hand still hair-touching but caught at a different beat. Eyes slightly off-center, NOT a dead stare.',
    'Same person, same outfit, same setting as the reference sheet. Different micro-pose only.',
    REALISM,
  ].join('\n\n');
  const wireBuf = await gptImageEdit(wireframePrompt, [sheetBuf]);
  writeFileSync('/tmp/test-selfie-2-wireframe.png', wireBuf);
  const wireUrl = await uploadR2(`${job}/wireframe.png`, wireBuf, 'image/png');
  log('    ✓ wireframe', wireUrl);

  // ── STAGE D — Seedance with same sheet, NEW script, pinned seed
  log('\n[D] Seedance 2.0 ref-to-video (sheet + new wireframe, pinned seed)…');
  const seedancePrompt = [
    `The woman in the reference images is talking to the camera in her bedroom. Handheld iPhone front-camera selfie.`,
    `She says, with a calm-excited tone, exactly: "${NEW_SCRIPT}"`,
    VOICE_BRIEF,
    `Native lip-sync to her voice. Hair-touch through the shot, slight head tilt, eyes drift then meet camera, mid-syllable mouth movements, natural blinks, visible skin pores, single mixed light source.`,
    `Strictly 9:16 vertical, 720p, ${DURATION}s, no captions, no overlay text, handheld micro-shake.`,
  ].join('\n\n');
  const videoUrl = await seedanceRefToVideo({
    prompt: seedancePrompt,
    image_urls: [EXISTING_SHEET_URL, wireUrl],
    duration: DURATION,
    aspect_ratio: '9:16',
    seed: PINNED_SEED,
  });
  log('    ✓ video', videoUrl);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  log('\n══════════════════════════════════════════════════════');
  log('  Consistency test #2 COMPLETE');
  log('══════════════════════════════════════════════════════');
  log('  sheet (from #1):', EXISTING_SHEET_URL);
  log('  new wireframe :', wireUrl);
  log('  new video     :', videoUrl);
  log('  pinned seed   :', PINNED_SEED);
  log('  wall time     :', dt, 'sec');
  log('  est cost      : ~$0.85 (1× gpt-image-2 + 8s Seedance)');
  log('\nCompare against test #1 video:');
  log('  https://files.evolink.ai/002TWZTRZCQDB5R24Z/videos/2026/05/21/f2313b56cc9d457dbc86bb35822ee739.mp4');
} catch (err) {
  console.error('\n✗ failed:', err.message);
  process.exit(1);
}
