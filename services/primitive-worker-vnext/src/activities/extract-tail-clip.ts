// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { Context } from '@temporalio/activity';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerConfig } from '../config.js';
import { r2UploadVnext } from '../client/r2.js';

const execFileP = promisify(execFile);

const TAIL_SECONDS = 4;

async function fetchToBuffer(url: string, label: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!resp.ok) throw new Error(`${label} download ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

export interface ExtractTailClipInput {
  video_url: string;
  run_id: string;
  index: number;
  seconds?: number;
}

export interface ExtractTailClipResult {
  clip_url: string;
}

export function makeExtractTailClipActivity(cfg: WorkerConfig) {
  return async function extractTailClip(
    input: ExtractTailClipInput,
  ): Promise<ExtractTailClipResult> {
    const seconds = Math.min(Math.max(input.seconds ?? TAIL_SECONDS, 2), 15);
    const workDir = await mkdtemp(join(tmpdir(), `vnext-tailclip-${input.run_id}-`));
    try {
      const videoPath = join(workDir, 'clip.mp4');
      const tailPath = join(workDir, 'tail.mp4');
      await writeFile(videoPath, await fetchToBuffer(input.video_url, 'chain clip'));
      Context.current().heartbeat({ stage: 'extracting_tail', index: input.index });

      const runFfmpeg = (args: string[]) =>
        execFileP('ffmpeg', args, { maxBuffer: 1024 * 1024 * 32 });

      try {
        await runFfmpeg([
          '-y',
          '-sseof', `-${seconds}`,
          '-i', videoPath,
          '-an',
          '-vf', "scale='min(720,iw)':-2,fps=30,setsar=1",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          tailPath,
        ]);
        await readFile(tailPath);
      } catch {
        await runFfmpeg([
          '-y',
          '-i', videoPath,
          '-an',
          '-vf', "scale='min(720,iw)':-2,fps=30,setsar=1",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          tailPath,
        ]);
      }

      let bytes: Buffer;
      try {
        bytes = await readFile(tailPath);
      } catch {
        throw new Error(`tail-clip extraction produced no clip for ${input.video_url}`);
      }

      const { publicUrl } = await r2UploadVnext(
        cfg.r2,
        input.run_id,
        `chain-tail-${input.index}.mp4`,
        bytes,
        'video/mp4',
      );
      return { clip_url: publicUrl };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}
