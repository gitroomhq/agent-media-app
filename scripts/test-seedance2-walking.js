#!/usr/bin/env node
/**
 * Test: seedance-2.0-image-to-video via EvoLink
 * Full-body walking + talking shot of Claire (actor_015.png).
 *
 * Run: EVOLINK_API_KEY=sk-... node scripts/test-seedance2-walking.js
 */

import { writeFile } from 'node:fs/promises';

const API_KEY = process.env.EVOLINK_API_KEY;
if (!API_KEY) {
  console.error('Missing EVOLINK_API_KEY');
  process.exit(1);
}

const BASE_URL = 'https://api.evolink.ai/v1';
const ACTOR_PORTRAIT =
  'https://ppwvarkmpffljlqxkjux.supabase.co/storage/v1/object/public/actors/actor_015.png';

// The text Claire should say. Seedance 2.0 generates synchronized audio
// matching the dialogue embedded in the prompt.
const DIALOGUE =
  "Hey everyone, I'm walking and talking at the same time. This is the new seedance two model and honestly, it's incredible.";

const PROMPT = `Full body shot of a young woman walking confidently toward the camera on a bright city sidewalk during the day. She smiles naturally and speaks directly to the camera, saying: "${DIALOGUE}" Casual stylish outfit, natural daylight, shallow depth of field, cinematic vertical framing.`;

const OUTPUT_PATH = 'out/claire-seedance2-walk.mp4';

async function submit() {
  console.log('→ Submitting seedance-2.0-image-to-video job...');
  console.log('  Actor: Claire');
  console.log('  Dialogue:', DIALOGUE);
  console.log('');

  const res = await fetch(`${BASE_URL}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'seedance-2.0-image-to-video',
      prompt: PROMPT,
      image_urls: [ACTOR_PORTRAIT],
      duration: 10,
      aspect_ratio: '9:16',
      quality: '720p',
      generate_audio: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Submit failed ${res.status}: ${err}`);
  }

  const body = await res.json();
  const taskId = body.id ?? body.task_id;
  if (!taskId) throw new Error(`No task ID in response: ${JSON.stringify(body)}`);
  return taskId;
}

async function poll(taskId) {
  console.log(`→ Polling task ${taskId}...`);
  const deadline = Date.now() + 15 * 60 * 1000;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      if (res.status >= 500) {
        console.log(`  transient ${res.status}, retrying...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw new Error(`Poll failed ${res.status}`);
    }

    const task = await res.json();
    if (task.status !== lastStatus) {
      console.log(`  status: ${task.status}`);
      lastStatus = task.status;
    }

    if (task.status === 'completed') return task;
    if (task.status === 'failed') {
      throw new Error(`Task failed: ${JSON.stringify(task.error ?? task)}`);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Timed out after 15 min');
}

async function download(url, path) {
  console.log(`→ Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  console.log(`✓ Saved to ${path} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

(async () => {
  try {
    const taskId = await submit();
    const task = await poll(taskId);
    const videoUrl =
      task.results?.[0] ??
      task.video_url ??
      task.result?.video_url ??
      task.output?.video_url;
    if (!videoUrl) {
      console.error('No video URL in task:', JSON.stringify(task, null, 2));
      process.exit(1);
    }
    console.log('Video URL:', videoUrl);
    await download(videoUrl, OUTPUT_PATH);
    console.log('');
    console.log('Done. Open:', OUTPUT_PATH);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
