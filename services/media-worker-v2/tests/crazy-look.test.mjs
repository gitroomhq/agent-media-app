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

import { resolveLook, buildStaticCaptionAss, buildActionArc, resolveFraming, stripUnrenderableGlyphs, signatureLookFor } from '../src/v2/crazy-look-pipeline.js';

const execFileAsync = promisify(execFile);

// ── resolveLook ───────────────────────────────────────────────────────────

test('resolveLook: every registered preset resolves to a pose + action brief', () => {
  const presets = [
    'bug-eyed-shock', 'jaw-drop', 'unhinged-grin', 'deadpan-stare',
    'eyes-rolled-up', 'suspicious-squint', 'crying-smile',
    'lean-in-conspiracy', 'guilty-pout', 'slow-realization',
    'sweet-smile', 'giggle-fit',
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

// ── Signature look (per-character identity) ───────────────────────────────

test('a character always gets the SAME look — that identity is the format', () => {
  const id = 'char_01JD7KS871';
  const first = resolveLook(undefined, id);
  for (let i = 0; i < 50; i++) {
    assert.equal(resolveLook(undefined, id).key, first.key, 'signature look drifted between clips');
  }
  assert.equal(first.signature, true);
  assert.equal(signatureLookFor(id), first.key);
});

test('different characters get different signature looks (not all one preset)', () => {
  const keys = new Set(
    ['char_01JD7KS871', 'char_L5NC1ZD837', 'char_E4K074PK8V', 'char_SDQXPEC65V', 'char_Y1HFF0R4J6', 'char_8x2vqpAb12']
      .map((id) => signatureLookFor(id)),
  );
  assert.ok(keys.size > 1, 'every character hashed to the same look');
});

test('explicit look overrides the signature, and no character still randomizes', () => {
  const pinned = resolveLook('giggle-fit', 'char_01JD7KS871');
  assert.equal(pinned.key, 'giggle-fit');
  assert.ok(!pinned.signature);
  assert.ok(resolveLook(undefined, undefined).key);
});

test('every look preset is peak-at-frame-one — no pose starts neutral', () => {
  const presets = [
    'bug-eyed-shock', 'jaw-drop', 'unhinged-grin', 'deadpan-stare',
    'eyes-rolled-up', 'suspicious-squint', 'crying-smile',
    'lean-in-conspiracy', 'guilty-pout', 'slow-realization',
    'sweet-smile', 'giggle-fit',
  ];
  for (const key of presets) {
    const { pose } = resolveLook(key);
    assert.ok(
      !/\b(nearly neutral|neutral face|calm|relaxed|starting in the brows|just starting)\b/i.test(pose),
      `"${key}" opens on a non-peak pose ("${pose}") — it would render a calm first frame`,
    );
  }
});

// ── First frame is the peak ───────────────────────────────────────────────

test('the arc opens AT peak intensity — no build-up, no neutral start', () => {
  const brief = resolveLook('bug-eyed-shock');
  const arc = buildActionArc(brief, 0.8);
  assert.ok(arc.startsWith('FRAME ONE IS ALREADY THE FULL EXPRESSION'), 'peak must be stated first, before any beat');
  assert.ok(arc.includes('0.0 seconds'));
  assert.ok(/NO build-up/.test(arc) && /NO neutral opening/.test(arc));
  assert.ok(arc.includes('NEVER relaxes back to a neutral'));
  // the old phrasing let the model ease in mid-clip
  assert.ok(!/She opens on/.test(arc));
});

// ── resolveFraming ────────────────────────────────────────────────────────

test('resolveFraming: explicit presets resolve, junk throws, omitted samples', () => {
  for (const key of ['full-face', 'eyes-only', 'mouth-only', 'nose-up', 'medium']) {
    const brief = resolveFraming(key);
    assert.equal(brief.key, key);
    assert.ok(brief.frame.length > 30, `${key} frame brief too thin`);
  }
  assert.throws(() => resolveFraming('drone-shot'), /unknown framing/);
  assert.equal(resolveFraming(undefined, () => 0).key, 'full-face'); // rand 0 -> heaviest bucket
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(resolveFraming().key);
  assert.ok(seen.size > 1, 'weighted sampler never varied');
  for (const macro of ['eyes-only', 'mouth-only', 'nose-up']) {
    assert.ok(!seen.has(macro), `macro crop "${macro}" must be explicit-only, never sampled`);
  }
});

test('resolveFraming: warm looks resolve too (sweet-smile, giggle-fit)', () => {
  for (const key of ['sweet-smile', 'giggle-fit']) {
    const brief = resolveLook(key);
    assert.equal(brief.key, key);
    assert.ok(brief.pose.length > 20 && brief.action.length > 20);
  }
});

// ── buildActionArc ────────────────────────────────────────────────────────

test('buildActionArc: chaos scales the number of sampled beats (1 at 0, 4 at 1)', () => {
  const brief = resolveLook('bug-eyed-shock');
  const first = () => 0; // deterministic sampler
  const calm = buildActionArc(brief, 0, first);
  const wild = buildActionArc(brief, 1, first);
  assert.equal((calm.match(/Then /g) ?? []).length, 1);
  assert.equal((wild.match(/Then /g) ?? []).length, 4);
  assert.ok(calm.includes('smooth and gradual'));
  assert.ok(wild.includes('unhinged'));
});

test('buildActionArc: never uses panel-inviting labels like "Beat N"', () => {
  const brief = resolveLook('bug-eyed-shock');
  const arc = buildActionArc(brief, 1, () => 0);
  assert.ok(!/Beat \d/.test(arc), 'numbered beat labels read as panels to the video model');
  assert.ok(arc.includes('single continuous shot'));
});

test('buildActionArc: frame one carries the pose, the action runs throughout', () => {
  const brief = resolveLook('deadpan-stare');
  const arc = buildActionArc(brief, 0.6);
  assert.ok(arc.includes(brief.pose), 'the look pose must be in the opening sentence');
  assert.ok(arc.includes(`Throughout, ${brief.action}`));
  assert.ok(arc.includes('keeps CHANGING'));
});

test('buildActionArc: clamps out-of-range chaos instead of throwing', () => {
  const brief = resolveLook('unhinged-grin');
  assert.equal((buildActionArc(brief, 9, () => 0).match(/Then /g) ?? []).length, 4);
  assert.equal((buildActionArc(brief, -3, () => 0).match(/Then /g) ?? []).length, 1);
  assert.ok(buildActionArc(brief, NaN).includes('punchy beats')); // NaN -> default 0.6
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

// ── stripUnrenderableGlyphs ───────────────────────────────────────────────

test('emoji never reach the burn font (they render as tofu boxes)', () => {
  assert.equal(
    stripUnrenderableGlyphs('wait for the end it\u2019s so cute\u{1F62D}\u{1F49B}'),
    'wait for the end it\u2019s so cute',
  );
  const ass = buildStaticCaptionAss('finally found a way to pray \u{1F62D}\u{1F49B} consistently', 5);
  const dialogue = ass.split('\n').find((l) => l.startsWith('Dialogue:'));
  assert.ok(!/[\u{1F000}-\u{1FAFF}]/u.test(dialogue), 'emoji leaked into the ASS dialogue');
  assert.ok(dialogue.includes('finally found a way to pray consistently'));
});

test('glyph stripping keeps ordinary punctuation, accents and typos intact', () => {
  const caption = "WAIT there's an app that LOCKS you phone yntil you PRAY??? — cafe\u0301";
  assert.equal(stripUnrenderableGlyphs(caption), caption);
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
