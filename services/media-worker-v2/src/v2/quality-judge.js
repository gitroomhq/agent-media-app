// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 · The auto-judge (P3, the quality loop).
 *
 * Runs after every completed loose-surface job and writes ONE row to
 * public.generation_quality. It never blocks or fails the job: the user
 * already has their URL; this is the signal agent-media learns from.
 *
 * Why an auto-judge and not user feedback alone: most customers get a
 * good output and never say a word, so a loop that waits for complaints
 * only ever sees the bottom of the distribution. Scoring every job, good
 * ones included, is what makes model_stats a fair comparison between
 * models — and what model:"auto" reads.
 *
 * What it judges: 3 frames of a video (10 / 50 / 90 %) or the image,
 * against the same realism rubric the fixed pipelines used to inject
 * plus prompt adherence and, when refs were given, identity match.
 * Audio is recorded (render time, provider) but not scored — there is
 * no honest single-number judge for a 3-second voice line yet, and a
 * made-up one would be worse than a null.
 *
 * Judge model: gpt-4o-mini with JSON output (~$0.003 a job). The model
 * name is stored on the row so a future judge can be compared, not
 * silently swapped.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { REALISM_RUBRIC } from './realism.js';
import { fetchToBuffer } from './http.js';

const execFileAsync = promisify(execFile);

export const JUDGE_MODEL = 'gpt-4o-mini';

let _openai = null;
function openai() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

let _db = null;
function db() {
  if (_db) return _db;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  _db = createClient(url, key);
  return _db;
}

/** pipeline name → kind, or null when the pipeline is not on the loose surface. */
export function kindForPipeline(pipeline) {
  if (pipeline === 'generate-video') return 'video';
  if (pipeline === 'generate-image') return 'image';
  if (pipeline === 'generate-audio') return 'audio';
  return null;
}

/** Extract JPEG frames at the given fractions of the clip. */
async function videoFrames(mp4Path, workDir, fractions = [0.1, 0.5, 0.9]) {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4Path]);
  const duration = Number(String(stdout).trim()) || 5;
  const out = [];
  for (const [i, f] of fractions.entries()) {
    const p = join(workDir, `frame-${i}.jpg`);
    await execFileAsync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, duration * f)), '-i', mp4Path, '-frames:v', '1', '-vf', 'scale=512:-1', '-q:v', '4', p]);
    out.push(await readFile(p));
  }
  return out;
}

/** The judge prompt. Exported so the docs can print it. */
export function judgeInstructions({ kind, prompt, hasRefs }) {
  return [
    `You are grading one ${kind === 'video' ? 'short vertical video (3 frames: start, middle, end)' : 'image'} produced by an AI model for a UGC-style ad.`,
    `The user's prompt was:\n"""${prompt}"""`,
    hasRefs ? 'Reference images were supplied for identity; the FIRST image(s) shown are the references, the rest is the output.' : 'No reference images were supplied.',
    '',
    'Grade against this rubric (what a real phone-shot clip looks like):',
    REALISM_RUBRIC,
    '',
    'Return ONLY JSON: {',
    '  "realism": 0..1,           // skin, light, framing, no AI sheen',
    '  "prompt_adherence": 0..1,  // does the output show what the prompt asked (subject, setting, action, product)',
    hasRefs ? '  "identity_match": 0..1,   // same person / same product as the references' : '  "identity_match": null,',
    '  "artifacts": ["..."],      // concrete defects seen: extra fingers, warped text, frozen face, phone in frame, etc. Empty if none.',
    '  "overall": 0..1,           // your single verdict; 0.8+ means shippable as-is',
    '  "notes": "one sentence"',
    '}',
  ].join('\n');
}

/**
 * Judge one completed job and upsert its generation_quality row.
 * Fire-and-forget from server-routes: resolves to the row or null, never throws.
 */
export async function judgeAndRecord({ job_id, user_id, pipeline, model, provider_model, prompt, refs = [], output_url, render_ms }) {
  const kind = kindForPipeline(pipeline);
  if (!kind || !job_id || !user_id) return null;
  const base = {
    job_id,
    user_id,
    operation: pipeline.replace('-', '_'),
    model_slug: model ?? (kind === 'video' ? 'seedance-2.0' : kind === 'image' ? 'gpt-image-2' : 'elevenlabs-tts'),
    kind,
    provider_model: provider_model ?? null,
    render_ms: Number.isFinite(render_ms) ? Math.round(render_ms) : null,
    updated_at: new Date().toISOString(),
  };

  let row = { ...base };
  if (kind !== 'audio' && output_url && process.env.OPENAI_API_KEY) {
    const workDir = await mkdtemp(join(tmpdir(), `judge-${job_id}-`));
    try {
      const bytes = await fetchToBuffer(output_url);
      let frames;
      if (kind === 'video') {
        const mp4 = join(workDir, 'out.mp4');
        await writeFile(mp4, bytes);
        frames = await videoFrames(mp4, workDir);
      } else {
        frames = [bytes];
      }
      const refImages = [];
      for (const url of refs.slice(0, 2)) {
        try { refImages.push(await fetchToBuffer(url)); } catch { /* a missing ref is not the output's fault */ }
      }
      const toPart = (buf, mime) => ({ type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}`, detail: 'low' } });
      const content = [
        { type: 'text', text: judgeInstructions({ kind, prompt: String(prompt ?? ''), hasRefs: refImages.length > 0 }) },
        ...refImages.map((b) => toPart(b, 'image/png')),
        ...frames.map((b) => toPart(b, kind === 'video' ? 'image/jpeg' : 'image/png')),
      ];
      const res = await openai().chat.completions.create({
        model: JUDGE_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 400,
        messages: [{ role: 'user', content }],
      });
      const verdict = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
      const overall = Number(verdict.overall);
      row = {
        ...row,
        auto_score: Number.isFinite(overall) ? Math.min(1, Math.max(0, overall)) : null,
        auto_verdict: verdict,
        judge: JUDGE_MODEL,
        judged_at: new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`[v2 judge:${job_id}] judge failed (row kept without a score): ${err?.message ?? err}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  try {
    const { error } = await db().from('generation_quality').upsert(row, { onConflict: 'job_id' });
    if (error) throw new Error(error.message);
    console.log(`[v2 judge:${job_id}] ${kind} ${row.model_slug} score=${row.auto_score ?? 'n/a'} render=${row.render_ms ?? '?'}ms`);
    return row;
  } catch (err) {
    console.warn(`[v2 judge:${job_id}] could not record: ${err?.message ?? err}`);
    return null;
  }
}
