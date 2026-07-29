import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media character-video` command.
 *
 * Runs the 3-step Content Machine pipeline end-to-end:
 *   1. POST /v1/character/sheet-generate     → character_sheet_url
 *   2. POST /v1/character/storyboard-generate → storyboard_url
 *   3. POST /v1/generate/character_video     → final 720p MP4
 *
 * The user supplies one character source (--description / --actor /
 * --reference-image), then either --beats or --script for the
 * storyboard, then duration + aspect ratio for the video. A single
 * --session-id ties the three steps together so api-v2 can backstop
 * action_prompt from the storyboard's script/beats.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  detectOutputMode,
  printJson,
  printQuiet,
  createSpinner,
} from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI, type GenerationJob } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';
import type { OutputMode } from '../types.js';

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

const SUPABASE_PUBLIC_BASE = 'https://ppwvarkmpffljlqxkjux.supabase.co/storage/v1/object/public/generation-inputs';

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;

const VALID_DURATIONS = new Set([5, 10]);
const VALID_RATIOS = new Set(['9:16', '16:9', '1:1']);

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

async function uploadLocalImage(api: AgentMediaAPI, filePath: string, mode: OutputMode): Promise<string> {
  if (!existsSync(filePath)) {
    throw new CLIError(`File not found: ${filePath}`, { code: 'FILE_NOT_FOUND' });
  }
  const stats = statSync(filePath);
  if (stats.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new CLIError(
      `Reference image too large: ${(stats.size / 1024 / 1024).toFixed(1)} MB (max 5 MB)`,
      { code: 'FILE_TOO_LARGE', suggestion: 'Use a smaller image or compress (jpeg/webp).' },
    );
  }
  const ext = extname(filePath).toLowerCase();
  const contentType = IMAGE_MIME[ext];
  if (!contentType) {
    throw new CLIError(
      `Unsupported reference image type: ${ext}. Allowed: ${Object.keys(IMAGE_MIME).join(', ')}`,
      { code: 'UNSUPPORTED_FILE_TYPE' },
    );
  }
  const filename = basename(filePath);
  const sp = createSpinner(`Uploading ${filename}...`);
  if (mode === 'human') sp.start();
  const { upload_url, storage_path } = await api.getUploadUrl(filename, contentType);
  const buf = readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  await api.uploadFile(upload_url, ab, contentType);
  if (mode === 'human') sp.succeed(`Uploaded ${filename}`);
  return `${SUPABASE_PUBLIC_BASE}/${storage_path}`;
}

async function pollUntilDone(
  api: AgentMediaAPI,
  jobId: string,
  label: string,
  expectedSeconds: number,
  mode: OutputMode,
): Promise<GenerationJob> {
  const start = Date.now();
  const spinner = createSpinner(`${label} (~${expectedSeconds}s)...`);
  if (mode === 'human') spinner.start();
  let onSigint: (() => void) | null = null;
  try {
    onSigint = () => {
      if (mode === 'human') spinner.fail(`Aborted while waiting on ${label.toLowerCase()}`);
      process.exit(130);
    };
    process.on('SIGINT', onSigint);

    while (true) {
      const job = await api.getJob(jobId);
      if (TERMINAL_STATUSES.has(job.status)) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (mode === 'human') {
          if (job.status === 'completed') spinner.succeed(`${label} complete (${elapsed}s)`);
          else spinner.fail(`${label} ${job.status}: ${job.error_message ?? 'unknown error'}`);
        }
        return job;
      }
      if (mode === 'human') {
        const elapsed = Math.round((Date.now() - start) / 1000);
        spinner.text = `${label} ${chalk.dim(`(${elapsed}s)`)}`;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } finally {
    if (onSigint) process.removeListener('SIGINT', onSigint);
  }
}

export function registerCharacterVideoCommand(program: Command): void {
  program
    .command('character-video', { hidden: true })
    .description(
      'Content Machine: character sheet → storyboard → 720p video, in three orchestrated calls.\n\n' +
      'Examples:\n' +
      '  $ agent-media character-video \\\n' +
      '      --description "Marco, 35yo Italian chef, white uniform, curly black hair" \\\n' +
      '      --script "Marco walks into his sunlit Brooklyn kitchen, takes a bite of fresh bread, smiles." \\\n' +
      '      --duration 10 --aspect 9:16 --sync\n\n' +
      '  $ agent-media character-video \\\n' +
      '      --actor mei \\\n' +
      '      --beats "waves hello,holds up product,thumbs up" \\\n' +
      '      --duration 5 --sync\n\n' +
      '  $ agent-media character-video \\\n' +
      '      --reference-image ./photo.png \\\n' +
      '      --script "..." \\\n' +
      '      --sync\n\n' +
      'Provide ONE of --description / --actor / --reference-image, and ONE of --beats / --script.',
    )
    .option('--description <text>', 'Free-text character description (3-400 chars)')
    .option('--actor <slug>', 'Actor slug from the agent-media library')
    .option('--reference-image <pathOrUrl>', 'Local PNG/JPEG/WebP file or public HTTPS URL of a portrait (max 5 MB)')
    .option('--beats <comma-separated>', 'Comma-separated list of 3-10 beat descriptions for the storyboard')
    .option('--script <text>', 'Free-text script (10-1500 chars); the model splits it into 4-6 panels')
    .option('--duration <seconds>', 'Video duration: 5 or 10', '10')
    .option('--aspect <ratio>', 'Aspect ratio: 9:16, 16:9, or 1:1', '9:16')
    .option('--no-audio', 'Disable Seedance audio synthesis')
    .option('--action-prompt <text>', 'Optional explicit scene/location prompt for Seedance (otherwise derived from script/beats)')
    .option('--webhook-url <url>', 'Webhook to call on completion of the final video step')
    .option('-s, --sync', 'Wait for each step to complete (default: only sync on the video step)')
    .action(async (cmdOpts: {
      description?: string;
      actor?: string;
      referenceImage?: string;
      beats?: string;
      script?: string;
      duration: string;
      aspect: string;
      audio: boolean;
      actionPrompt?: string;
      webhookUrl?: string;
      sync?: boolean;
    }) => {
      printDeprecation('character-video');
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean; profile?: string }>();
      const mode = detectOutputMode(globalOpts);

      // ── Validate flags BEFORE the auth check so bad args fail fast
      // without requiring a login round-trip. (Same UX rationale: a user
      // with the wrong --duration shouldn't see "Not logged in" first.)

      // Character source — exactly one of description / actor / reference
      const sources = [cmdOpts.description, cmdOpts.actor, cmdOpts.referenceImage].filter(Boolean).length;
      if (sources === 0) {
        throw new CLIError('Provide one of --description, --actor, or --reference-image', {
          code: 'VALIDATION_ERROR',
        });
      }
      if (cmdOpts.actor && cmdOpts.referenceImage) {
        throw new CLIError('--actor and --reference-image are mutually exclusive', {
          code: 'VALIDATION_ERROR',
        });
      }

      // Storyboard source — exactly one of beats / script
      if (Boolean(cmdOpts.beats) === Boolean(cmdOpts.script)) {
        throw new CLIError('Provide exactly one of --beats or --script', { code: 'VALIDATION_ERROR' });
      }

      const duration = Number(cmdOpts.duration);
      if (!VALID_DURATIONS.has(duration)) {
        throw new CLIError(`Invalid --duration: ${cmdOpts.duration}`, {
          code: 'VALIDATION_ERROR', suggestion: 'Use 5 or 10.',
        });
      }
      if (!VALID_RATIOS.has(cmdOpts.aspect)) {
        throw new CLIError(`Invalid --aspect: ${cmdOpts.aspect}`, {
          code: 'VALIDATION_ERROR', suggestion: 'Use 9:16, 16:9, or 1:1.',
        });
      }

      const beats = cmdOpts.beats
        ? cmdOpts.beats.split(',').map((b) => b.trim()).filter((b) => b.length >= 3)
        : undefined;
      if (beats && (beats.length < 3 || beats.length > 10)) {
        throw new CLIError(`--beats must be 3-10 entries (≥3 chars each); got ${beats.length}`, {
          code: 'VALIDATION_ERROR',
        });
      }

      // Auth check after validation
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = getApiKey(profileName);
      if (!apiKey) {
        throw new CLIError('Not logged in.', {
          code: 'NOT_AUTHENTICATED',
          suggestion: "Run 'agent-media login' to authenticate.",
        });
      }

      const sessionId = randomUUID();

      try {
        const api = new AgentMediaAPI(apiKey);

        // ── Resolve reference image (upload local files) ────────────────
        let referenceImageUrl: string | undefined;
        if (cmdOpts.referenceImage) {
          referenceImageUrl = isUrl(cmdOpts.referenceImage)
            ? cmdOpts.referenceImage
            : await uploadLocalImage(api, cmdOpts.referenceImage, mode);
        }

        // ── Step 1: Character sheet ────────────────────────────────────
        if (mode === 'human') {
          console.log();
          console.log(chalk.bold('1/3 · Character sheet'));
        }
        const sheetSubmit = await api.characterSheetGenerate({
          description: cmdOpts.description,
          actor_slug: cmdOpts.actor,
          reference_image_url: referenceImageUrl,
          session_id: sessionId,
        });
        if (mode === 'human') {
          console.log(chalk.dim(`  Job ${sheetSubmit.job_id} · ${sheetSubmit.credits_deducted} credits`));
        }
        const sheetJob = await pollUntilDone(api, sheetSubmit.job_id, 'Sheet', sheetSubmit.expected_seconds ?? 180, mode);
        if (sheetJob.status !== 'completed' || !sheetJob.output_media_url) {
          throw new CLIError(`Character sheet failed: ${sheetJob.error_message ?? 'no output URL'}`, {
            code: 'SHEET_FAILED',
          });
        }
        const characterSheetUrl = sheetJob.output_media_url;
        if (mode === 'human') console.log(chalk.dim(`  → ${characterSheetUrl}`));

        // ── Step 2: Storyboard ─────────────────────────────────────────
        if (mode === 'human') {
          console.log();
          console.log(chalk.bold('2/3 · Storyboard'));
        }
        const sbSubmit = await api.characterStoryboardGenerate({
          character_sheet_url: characterSheetUrl,
          beats,
          script: cmdOpts.script,
          ratio: cmdOpts.aspect as '9:16' | '16:9' | '1:1',
          session_id: sessionId,
        });
        if (mode === 'human') {
          console.log(chalk.dim(`  Job ${sbSubmit.job_id} · ${sbSubmit.credits_deducted} credits`));
        }
        const sbJob = await pollUntilDone(api, sbSubmit.job_id, 'Storyboard', sbSubmit.expected_seconds ?? 180, mode);
        if (sbJob.status !== 'completed' || !sbJob.output_media_url) {
          throw new CLIError(`Storyboard failed: ${sbJob.error_message ?? 'no output URL'}`, {
            code: 'STORYBOARD_FAILED',
          });
        }
        const storyboardUrl = sbJob.output_media_url;
        if (mode === 'human') console.log(chalk.dim(`  → ${storyboardUrl}`));

        // ── Step 3: Video ──────────────────────────────────────────────
        if (mode === 'human') {
          console.log();
          console.log(chalk.bold('3/3 · Video'));
        }
        const videoSubmit = await api.characterVideoGenerate({
          character_sheet_url: characterSheetUrl,
          storyboard_url: storyboardUrl,
          action_prompt: cmdOpts.actionPrompt,
          duration: duration as 5 | 10,
          aspect_ratio: cmdOpts.aspect as '9:16' | '16:9' | '1:1',
          generate_audio: cmdOpts.audio,
          session_id: sessionId,
          webhook_url: cmdOpts.webhookUrl,
        });
        if (mode === 'human') {
          console.log(chalk.dim(`  Job ${videoSubmit.job_id} · ${videoSubmit.credits_deducted} credits`));
        }

        if (!cmdOpts.sync) {
          // Caller doesn't want to wait on the final video; print what we have so far.
          switch (mode) {
            case 'json':
              printJson({
                session_id: sessionId,
                character_sheet_url: characterSheetUrl,
                storyboard_url: storyboardUrl,
                video_job_id: videoSubmit.job_id,
                video_status: videoSubmit.status,
                credits_deducted: videoSubmit.credits_deducted,
              });
              break;
            case 'quiet':
              printQuiet(videoSubmit.job_id);
              break;
            default:
              console.log();
              console.log(chalk.dim(`  Run 'agent-media status ${videoSubmit.job_id}' to follow the video render`));
              console.log();
          }
          return;
        }

        const videoJob = await pollUntilDone(api, videoSubmit.job_id, 'Video', 180, mode);

        if (mode === 'json') {
          const payload: Record<string, unknown> = {
            session_id: sessionId,
            character_sheet_url: characterSheetUrl,
            storyboard_url: storyboardUrl,
            video_job_id: videoJob.id,
            status: videoJob.status,
            credits_deducted: videoSubmit.credits_deducted,
          };
          if (videoJob.status === 'failed') {
            payload['error'] = videoJob.error_message ?? 'Unknown error';
            if (videoJob.error_code) payload['error_code'] = videoJob.error_code;
          }
          if (videoJob.output_media_url) payload['video_url'] = videoJob.output_media_url;
          printJson(payload);
          return;
        }
        if (mode === 'quiet') {
          printQuiet(videoJob.output_media_url ?? videoJob.id);
          return;
        }
        if (videoJob.status === 'completed' && videoJob.output_media_url) {
          console.log();
          console.log(`  ${chalk.bold('Sheet:')}      ${chalk.cyan(characterSheetUrl)}`);
          console.log(`  ${chalk.bold('Storyboard:')} ${chalk.cyan(storyboardUrl)}`);
          console.log(`  ${chalk.bold('Video:')}      ${chalk.cyan(videoJob.output_media_url)}`);
          console.log();
        } else if (videoJob.status !== 'completed') {
          console.log();
          console.log(chalk.yellow('  Video did not complete successfully.'));
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
