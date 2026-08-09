// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Crazy Look pipeline unit tests — the pure, provider-free parts:
 * look resolution and the static caption ASS builder, plus a real
 * ffmpeg burn when ffmpeg is on PATH (skipped otherwise, so the suite
 * stays green on dev boxes without media tooling).
 *
 * Run: node --test tests/
 *
 * The provider stages (gpt-image-2, Seedance) are exercised in
 * staging with live keys, not here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveLook, buildStaticCaptionAss } from '../src/v2/crazy-look-pipeline.js';

const execFileAsync = promisify(execFile);

// ── resolveLook ───────────────────────────────────────────────────────────

test('resolveLook: every registered preset resolves to a pose + action brief', () => {
  const presets = [
    'bug-eyed-shock', 'jaw-drop', 'unhinged-grin', 'deadpan-stare',
    'eyes-rolled-up', 'suspicious-squint', 'crying-smile',
    'lean-in-conspiracy', 'guilty-pout', 'slow-realization',
  ];
  for (const key of presets) {
    const brief = resolveLook(key);
    assert.equal(brief.key, key);
    assert.ok(brief.pose.length > 20, `${key} pose too thin`);
    assert.ok(brief.action.length > 20, `${key} action too thin`);
  }
});

test('resolveLook: custom:<text> flows the freetext into both pose and action', () => {
  const brief = resolveLook('custom:winks twice then silently screams');
  assert.ok(brief.pose.includes('winks twice then silently screams'));
  assert.ok(brief.action.includes('winks twice then silently screams'));
});

test('resolveLook: omitted look picks a registered preset at random', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(resolveLook().key);
  // 50 draws over 10 presets — statistically certain to see variety.
  assert.ok(seen.size > 1, 'random look never varied');
  for (const key of seen) assert.ok(resolveLook(key).key === key);
});

test('resolveLook: unknown looks throw instead of silently degrading', () => {
  assert.throws(() => resolveLook('confused-dog'), /unknown look/);
});

// ── buildStaticCaptionAss ─────────────────────────────────────────────────

test('buildStaticCaptionAss: one dialogue event spanning 0 → duration', () => {
  const ass = buildStaticCaptionAss('how do you pray so consistently???', 5);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(dialogues.length, 1, 'static caption must be exactly one event');
  assert.ok(dialogues[0].includes('0:00:00.00,0:00:05.00'), 'event must span the full clip');
  assert.ok(ass.includes('PlayResX: 1080') && ass.includes('PlayResY: 1920'), '9:16 canvas');
});

test('buildStaticCaptionAss: newlines become forced ASS line breaks', () => {
  const ass = buildStaticCaptionAss('WAIT\nthere is an app for that', 10);
  assert.ok(ass.includes('WAIT\\Nthere is an app for that'));
});

test('buildStaticCaptionAss: override braces cannot be injected via the caption', () => {
  const ass = buildStaticCaptionAss('{\\pos(0,0)}sneaky override', 5);
  const dialogue = ass.split('\n').find((l) => l.startsWith('Dialogue:'));
  assert.ok(dialogue.includes('\\{'), 'braces must be escaped');
  assert.ok(!dialogue.includes('{\\pos'), 'raw ASS override must not survive');
});

// ── Real burn (integration; skipped without ffmpeg) ───────────────────────

test('ffmpeg burns the caption and preserves the audio track', async (t) => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch {
    t.skip('ffmpeg not on PATH');
    return;
  }

  const workDir = await mkdtemp(join(tmpdir(), 'crazy-look-test-'));
  const input = join(workDir, 'in.mp4');
  const assPath = join(workDir, 'caption.ass');
  const output = join(workDir, 'out.mp4');

  // 2s synthetic 9:16 clip with a silent stereo track standing in for
  // Seedance's ambient room tone.
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920:d=2',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo:d=2',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    input,
  ]);
  await writeFile(assPath, buildStaticCaptionAss("it took me 21 years to realize this", 2), 'utf8');

  const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error',
    '-i', input,
    '-vf', `subtitles='${safeAssPath}'`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    output,
  ]);

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', output,
  ]);
  const streams = stdout.trim().split('\n').map((s) => s.trim()).sort();
  assert.deepEqual(streams, ['audio', 'video'], 'burned clip must keep BOTH streams (ambient audio survives -c:a copy)');
});
