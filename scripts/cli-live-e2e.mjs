#!/usr/bin/env node
// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const cliBin = resolve(root, 'apps/cli/dist/index.js');

const requiredEnv = [
  ['AGENT_MEDIA_E2E_LIVE', '1'],
  ['AGENT_MEDIA_E2E_CONFIRM_COST', '1'],
];

for (const [name, expected] of requiredEnv) {
  if (process.env[name] !== expected) {
    console.error(`${name}=${expected} is required to run live CLI E2E tests.`);
    process.exit(2);
  }
}

if (!process.env.AGENT_MEDIA_API_KEY) {
  console.error('AGENT_MEDIA_API_KEY is required to run live CLI E2E tests.');
  process.exit(2);
}

if (!existsSync(cliBin)) {
  console.error(`CLI build not found at ${cliBin}. Run pnpm --filter agent-media-cli build first.`);
  process.exit(2);
}

const env = {
  ...process.env,
  AGENT_MEDIA_API_URL: process.env.AGENT_MEDIA_API_BASE_URL ?? process.env.AGENT_MEDIA_API_URL,
  NO_COLOR: '1',
};

const appScreenshotUrl = 'https://placehold.co/720x1280/png?text=Agent+Media+App';
const dashboardUrl = 'https://placehold.co/1080x720/png?text=SaaS+Dashboard';
const productImageUrl = 'https://placehold.co/900x900/png?text=Focus+Timer';

function runCli(label, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, [cliBin, '--json', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30 * 60 * 1000,
  });

  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    console.error(result.stdout.trim());
    throw new Error(`${label} failed with exit code ${result.status}`);
  }

  const stdout = result.stdout.trim();
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    console.error(stdout);
    throw new Error(`${label} did not return JSON`);
  }

  if (!payload.job_id) throw new Error(`${label} did not return job_id`);

  // If the job reached terminal 'failed' status, the CLI emits exit-0 with
  // {status:'failed', error, error_code} but no output_url. Surface the
  // upstream cause clearly instead of throwing the cryptic "did not return
  // output_url".
  if (payload.status === 'failed') {
    const code = payload.error_code ?? 'UNKNOWN';
    const reason = payload.error ?? 'no error message';
    throw new Error(`${label} job ${payload.job_id} failed [${code}]: ${reason}`);
  }
  if (payload.status === 'canceled') {
    throw new Error(`${label} job ${payload.job_id} was canceled`);
  }
  if (!payload.output_url) {
    throw new Error(`${label} job ${payload.job_id} returned status=${payload.status ?? 'unknown'} but no output_url`);
  }

  console.log(`${label}: ${payload.job_id}`);
  console.log(payload.output_url);
  return payload;
}

/**
 * Run the `character-video` command and validate its 3-step JSON output.
 * Different shape from runCli — emits sheet/storyboard/video URLs +
 * a video_job_id rather than a single output_url, so we parse it
 * separately and assert all three URLs are present + non-empty.
 */
async function runCharacterVideoCli(args) {
  console.log(`\n== character-video ==`);
  const result = spawnSync(process.execPath, [cliBin, '--json', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30 * 60 * 1000,
  });

  if (result.stderr.trim()) console.error(result.stderr.trim());

  if (result.status !== 0) {
    console.error(result.stdout.trim());
    throw new Error(`character-video failed with exit code ${result.status}`);
  }

  const stdout = result.stdout.trim();
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    console.error(stdout);
    throw new Error('character-video did not return JSON');
  }

  if (payload.status === 'failed') {
    const code = payload.error_code ?? 'UNKNOWN';
    const reason = payload.error ?? 'no error message';
    throw new Error(`character-video job ${payload.video_job_id} failed [${code}]: ${reason}`);
  }
  if (payload.status === 'canceled') {
    throw new Error(`character-video job ${payload.video_job_id} was canceled`);
  }
  for (const key of ['character_sheet_url', 'storyboard_url', 'video_url']) {
    if (typeof payload[key] !== 'string' || payload[key].length === 0) {
      throw new Error(`character-video missing ${key} in JSON output`);
    }
  }

  console.log(`character-video session ${payload.session_id}`);
  console.log(`  sheet:      ${payload.character_sheet_url}`);
  console.log(`  storyboard: ${payload.storyboard_url}`);
  console.log(`  video:      ${payload.video_url}`);
  return payload;
}

async function assertAccessible(label, url) {
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok && resp.status !== 206) {
    throw new Error(`${label} output is not accessible: HTTP ${resp.status}`);
  }
}

const results = [];

try {
  results.push(runCli('ugc', [
    'ugc',
    'This workflow turns messy launch notes into crisp founder updates in minutes.',
    '--actor', 'aisha',
    '--duration', '5',
    '--style', 'hormozi',
    '--sync',
  ]));

  results.push(runCli('saas-review', [
    'saas-review',
    '--saas', 'Agent Media',
    '--url', 'https://agent-media.ai',
    '--screenshots', dashboardUrl,
    '--actor', 'hassan',
    '--duration', '5',
    '--style', 'clean',
    '--sync',
  ]));

  results.push(runCli('legacy-review', [
    'review',
    '--saas', 'Agent Media',
    '--url', 'https://agent-media.ai',
    '--screenshots', dashboardUrl,
    '--actor', 'austin',
    '--duration', '5',
    '--style', 'minimal',
    '--sync',
  ]));

  results.push(runCli('show-your-app', [
    'show-your-app',
    '--app-screenshot', appScreenshotUrl,
    '--script', 'This app keeps every launch update clear and ready.',
    '--duration', '5',
    '--subtitle-style', 'hormozi',
    '--sync',
  ]));

  results.push(runCli('product-acting', [
    'product-acting',
    '--product-image', productImageUrl,
    '--actor', 'austin',
    '--product-name', 'Focus Timer',
    '--script', 'This tiny timer actually helped me finish deep work today.',
    '--template', 'product-in-hand',
    '--acting-style', 'honest-review',
    '--duration', '5',
    '--subtitle-style', 'hormozi',
    '--sync',
  ]));

  results.push(runCli('laptop-ugc', [
    'laptop-ugc',
    '--app-image', appScreenshotUrl,
    '--script', 'I just made an entire UGC ad in 2 minutes from my terminal. So easy. It is agent-media.',
    '--actor', 'mei',
    '--duration', '20',
    '--subtitle-style', 'hormozi',
    '--sync',
  ]));

  results.push(runCli('subtitle', [
    'subtitle',
    results[0].job_id,
    '--style', 'bold',
    '--sync',
  ]));

  // ── character-video — runs all 3 pipeline steps in one command ─────────
  // Different output shape than runCli expects: emits
  //   { session_id, character_sheet_url, storyboard_url, video_job_id,
  //     video_url, status, credits_deducted }
  // so we use a custom helper here. 5s clip — same cost-per-clip as the
  // other generators above.
  const characterPayload = await runCharacterVideoCli([
    'character-video',
    '--description', 'Marco, 35yo Italian chef with curly black hair, white uniform',
    '--script', 'Marco walks into his sunlit Brooklyn kitchen, takes a bite of fresh bread, smiles at the camera.',
    '--duration', '5',
    '--aspect', '9:16',
    '--sync',
  ]);
  await assertAccessible('character-sheet', characterPayload.character_sheet_url);
  await assertAccessible('character-storyboard', characterPayload.storyboard_url);
  await assertAccessible('character-video', characterPayload.video_url);

  for (const result of results) {
    await assertAccessible(result.job_id, result.output_url);
  }

  console.log(`\nLive CLI E2E passed: ${results.length + 1} completed jobs.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
