import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media laptop-ugc` command.
 *
 * Generates a 3-scene laptop-UGC ad: actor holds laptop showing your app,
 * scrolling B-roll, then face-only selfie close. Native lip-synced audio.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
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

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const MAX_RECORDING_BYTES = 10 * 1024 * 1024; // 10 MB — must match LAPTOP_UGC_MAX_RECORDING_BYTES
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;      // 5 MB — must match LAPTOP_UGC_MAX_IMAGE_BYTES

// Supabase project URL + bucket the upload-url edge function writes to.
// Hardcoded because the edge function returns only storage_path; the CLI must
// construct the public URL itself (until upload-url is updated to return one).
const SUPABASE_PUBLIC_BASE = 'https://ppwvarkmpffljlqxkjux.supabase.co/storage/v1/object/public/generation-inputs';

const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  submitted: chalk.blue,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

const VALID_DURATIONS = new Set([15, 20]);
const VALID_SUBTITLE_STYLES = new Set(['hormozi', 'none']);
const WORDS_PER_SECOND = 3;

function formatStatus(status: string): string {
  return (STATUS_COLORS[status] ?? chalk.white)(status.toUpperCase());
}
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function uploadLocalFile(
  api: AgentMediaAPI,
  filePath: string,
  isRecording: boolean,
  mode: OutputMode,
): Promise<string> {
  if (!existsSync(filePath)) {
    throw new CLIError(`File not found: ${filePath}`, { code: 'FILE_NOT_FOUND' });
  }
  const ext = extname(filePath).toLowerCase();
  const mimeMap = isRecording ? VIDEO_MIME : IMAGE_MIME;
  const contentType = mimeMap[ext];
  if (!contentType) {
    throw new CLIError(
      `Unsupported file type: ${ext}. Allowed: ${Object.keys(mimeMap).join(', ')}`,
      { code: 'UNSUPPORTED_FILE_TYPE' },
    );
  }
  const stat = statSync(filePath);
  const max = isRecording ? MAX_RECORDING_BYTES : MAX_IMAGE_BYTES;
  if (stat.size > max) {
    const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
    const limitMb = max / 1024 / 1024;
    throw new CLIError(
      `File too large: ${sizeMb} MB. Max is ${limitMb} MB.`,
      {
        code: 'FILE_TOO_LARGE',
        suggestion: isRecording
          ? 'Compress with: ffmpeg -i in.mp4 -crf 28 -preset fast -t 10 out.mp4'
          : 'Use a smaller image or compress (jpeg/webp).',
      },
    );
  }

  const fileName = basename(filePath);
  const sp = createSpinner(`Uploading ${fileName}...`);
  if (mode === 'human') sp.start();
  const { upload_url, storage_path } = await api.getUploadUrl(fileName, contentType);
  const buf = readFileSync(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  await api.uploadFile(upload_url, ab, contentType);
  if (mode === 'human') sp.succeed(`Uploaded ${fileName}`);
  // Construct full public URL — edge function returns only the storage_path
  return `${SUPABASE_PUBLIC_BASE}/${storage_path}`;
}

async function waitForJob(
  api: AgentMediaAPI,
  jobId: string,
  mode: OutputMode,
): Promise<GenerationJob | null> {
  const startTime = Date.now();
  let interrupted = false;
  const onSigint = (): void => { interrupted = true; };
  process.on('SIGINT', onSigint);
  const spinner = createSpinner('Building Laptop UGC ad...');
  if (mode === 'human') spinner.start();
  try {
    while (!interrupted) {
      const poll = await api.pollProvider(jobId);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const status = poll.status;
      if (mode === 'human') {
        spinner.text = `${formatStatus(status)}  elapsed ${formatElapsed(elapsed)}  (Ctrl+C to stop)`;
      }
      if (TERMINAL_STATUSES.has(status)) {
        const job = await api.getJob(jobId);
        if (mode === 'human') {
          if (status === 'completed') {
            spinner.succeed(`Laptop UGC ad produced in ${formatElapsed(elapsed)}`);
          } else if (status === 'failed') {
            spinner.fail(`Job failed after ${formatElapsed(elapsed)}` + (job.error_message ? `: ${job.error_message}` : ''));
          } else {
            spinner.warn(`Job canceled after ${formatElapsed(elapsed)}`);
          }
        }
        return job;
      }
      await new Promise<void>((resolve) => {
        const earlyExit = (): void => {
          clearTimeout(timer);
          process.removeListener('SIGINT', earlyExit);
          resolve();
        };
        const timer = setTimeout(() => {
          process.removeListener('SIGINT', earlyExit);
          resolve();
        }, POLL_INTERVAL_MS);
        process.once('SIGINT', earlyExit);
      });
    }
    if (mode === 'human') {
      spinner.stop();
      console.log();
      console.log(chalk.dim('  Stopped waiting.'));
    }
    return null;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

export function registerLaptopUgcCommand(program: Command): void {
  program
    .command('laptop-ugc', { hidden: true })
    .description(
      'Generate a 3-scene Laptop UGC ad — actor holds laptop showing your app, scrolls, talks\n\n' +
      'Examples:\n' +
      '  $ agent-media laptop-ugc \\\n' +
      '      --app-recording ./demo.mp4 \\\n' +
      '      --script "Found this AI tool that ships UGC ads in 2 minutes." \\\n' +
      '      --sync\n\n' +
      '  $ agent-media laptop-ugc \\\n' +
      '      --app-image ./screenshot.png \\\n' +
      '      --script "..." \\\n' +
      '      --actor mei --duration 20 --sync\n\n' +
      'Provide EXACTLY ONE of --app-recording or --app-image.\n' +
      'Recording: mp4 or mov, max 10 MB, max 10s.\n' +
      'Image: png/jpeg/webp, max 5 MB.',
    )
    .option('--app-recording <pathOrUrl>', 'Local mp4/mov file or public URL of a screen recording (max 10 MB, 10s)')
    .option('--app-image <pathOrUrl>', 'Local png/jpeg/webp file or public URL of a static screenshot (max 5 MB)')
    .requiredOption('--script <text>', 'Voiceover script. Auto-split between two face shots.')
    .option('--actor <slug>', 'Specific actor slug (random if omitted)')
    .option('--duration <seconds>', 'Total duration: 15 or 20', '20')
    .option('--subtitle-style <style>', 'Subtitle style: hormozi or none', 'hormozi')
    .option('--webhook-url <url>', 'Webhook to call on completion')
    .option('-s, --sync', 'Wait for completion and print the output URL')
    .action(async (cmdOpts: {
      appRecording?: string;
      appImage?: string;
      script: string;
      actor?: string;
      duration: string;
      subtitleStyle: string;
      webhookUrl?: string;
      sync?: boolean;
    }) => {
      printDeprecation('laptop-ugc');
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean; profile?: string }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = getApiKey(profileName);

      if (!apiKey) {
        throw new CLIError('Not logged in.', {
          code: 'NOT_AUTHENTICATED',
          suggestion: "Run 'agent-media login' to authenticate.",
        });
      }

      // Validate exactly one source
      if ((!cmdOpts.appRecording && !cmdOpts.appImage) || (cmdOpts.appRecording && cmdOpts.appImage)) {
        throw new CLIError('Provide exactly one of --app-recording or --app-image', {
          code: 'VALIDATION_ERROR',
        });
      }

      const duration = Number(cmdOpts.duration);
      if (!VALID_DURATIONS.has(duration)) {
        throw new CLIError(`Invalid --duration: ${cmdOpts.duration}`, {
          code: 'VALIDATION_ERROR',
          suggestion: 'Use 15 or 20.',
        });
      }
      if (!VALID_SUBTITLE_STYLES.has(cmdOpts.subtitleStyle)) {
        throw new CLIError(`Invalid --subtitle-style: ${cmdOpts.subtitleStyle}`, {
          code: 'VALIDATION_ERROR',
          suggestion: 'Use hormozi or none.',
        });
      }

      const wordCount = cmdOpts.script.trim().split(/\s+/).filter(Boolean).length;
      const maxWords = duration * WORDS_PER_SECOND;
      if (wordCount > maxWords) {
        throw new CLIError(`Script too long: ${wordCount} words. Max ${maxWords} for ${duration}s.`, {
          code: 'VALIDATION_ERROR',
          suggestion: `Shorten to ≤${maxWords} words or increase --duration.`,
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        // Resolve recording or image to a public URL (upload local files)
        let recordingUrl: string | undefined;
        let imageUrl: string | undefined;
        if (cmdOpts.appRecording) {
          recordingUrl = isUrl(cmdOpts.appRecording)
            ? cmdOpts.appRecording
            : await uploadLocalFile(api, cmdOpts.appRecording, true, mode);
        } else if (cmdOpts.appImage) {
          imageUrl = isUrl(cmdOpts.appImage)
            ? cmdOpts.appImage
            : await uploadLocalFile(api, cmdOpts.appImage, false, mode);
        }

        const submitSpinner = createSpinner('Submitting Laptop UGC job...');
        if (mode === 'human') submitSpinner.start();
        const result = await api.laptopUgcGenerate({
          app_screen_recording_url: recordingUrl,
          app_screen_image_url: imageUrl,
          script: cmdOpts.script,
          actor_slug: cmdOpts.actor,
          duration: duration as 15 | 20,
          subtitle_style: cmdOpts.subtitleStyle as 'hormozi' | 'none',
          webhook_url: cmdOpts.webhookUrl,
        });
        if (mode === 'human') submitSpinner.succeed('Laptop UGC job submitted');

        if (!cmdOpts.sync) {
          switch (mode) {
            case 'json': printJson(result); break;
            case 'quiet': printQuiet(result.job_id); break;
            default:
              console.log();
              console.log(`  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`);
              console.log(`  ${chalk.bold('Actor:')}      ${result.actor_slug}${result.actor_random ? chalk.dim(' (random)') : ''}`);
              console.log(`  ${chalk.bold('Subtitles:')}  ${result.subtitle_style}`);
              console.log(`  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`);
              console.log();
              console.log(chalk.dim(`  Run 'agent-media status ${result.job_id}' to check progress`));
              console.log(chalk.dim(`  Or re-run with --sync to wait for completion`));
              console.log();
          }
          return;
        }

        if (mode === 'human') {
          console.log();
          console.log(`  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`);
          console.log(`  ${chalk.bold('Actor:')}      ${result.actor_slug}${result.actor_random ? chalk.dim(' (random)') : ''}`);
          console.log(`  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`);
          console.log();
        }

        const finishedJob = await waitForJob(api, result.job_id, mode);
        if (!finishedJob) return;

        if (mode === 'json') {
          const payload: Record<string, unknown> = {
            job_id: finishedJob.id,
            status: finishedJob.status,
            actor_slug: result.actor_slug,
            credits_deducted: result.credits_deducted,
          };
          if (finishedJob.status === 'failed') {
            payload['error'] = finishedJob.error_message ?? 'Unknown error';
            if (finishedJob.error_code) payload['error_code'] = finishedJob.error_code;
          }
          if (finishedJob.output_media_url) payload['output_url'] = finishedJob.output_media_url;
          printJson(payload);
          return;
        }
        if (mode === 'quiet') {
          printQuiet(finishedJob.output_media_url ?? finishedJob.id);
          return;
        }
        if (finishedJob.status === 'completed' && finishedJob.output_media_url) {
          console.log();
          console.log(`  ${chalk.bold('URL:')}  ${chalk.cyan(finishedJob.output_media_url)}`);
          console.log();
        } else if (finishedJob.status !== 'completed') {
          console.log();
          console.log(chalk.yellow('  No output — Laptop UGC job did not complete successfully.'));
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
