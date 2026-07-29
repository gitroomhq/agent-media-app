import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media subtitle <video>` command.
 *
 * Adds Hormozi-style animated subtitles to a video. Flow:
 * 1. Load API key from the credential store.
 * 2. If <video> is a local file, upload via presigned URL.
 * 3. If <video> is a job ID, resolve its output storage path.
 * 4. POST to subtitle-video edge function.
 * 5. Optionally wait for completion (--sync) and print output URL.
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
import {
  AgentMediaAPI,
  type GenerationJob,
} from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';
import type { OutputMode } from '../types.js';

/** MIME type lookup by file extension. */
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/** Poll interval for --sync mode, in milliseconds. */
const POLL_INTERVAL_MS = 3_000;

/** Terminal job statuses that end the polling loop. */
const TERMINAL_STATUSES = new Set<string>(['completed', 'failed', 'canceled']);

/** Status labels with color coding. */
const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

function formatStatus(status: string): string {
  const colorize = STATUS_COLORS[status] ?? chalk.white;
  return colorize(status.toUpperCase());
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Poll a subtitle job until it reaches a terminal state.
 */
async function waitForJob(
  api: AgentMediaAPI,
  jobId: string,
  mode: OutputMode,
): Promise<GenerationJob | null> {
  const startTime = Date.now();
  let interrupted = false;

  const onSigint = (): void => {
    interrupted = true;
  };
  process.on('SIGINT', onSigint);

  const spinner = createSpinner('Processing subtitles...');
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
            spinner.succeed(
              `Subtitles added in ${formatElapsed(elapsed)}`,
            );
          } else if (status === 'failed') {
            spinner.fail(
              `Subtitle job failed after ${formatElapsed(elapsed)}` +
                (job.error_message ? `: ${job.error_message}` : ''),
            );
          } else {
            spinner.warn(
              `Subtitle job canceled after ${formatElapsed(elapsed)}`,
            );
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

function resolveContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Check if a string looks like a UUID (job ID) rather than a file path.
 */
function isJobId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function registerSubtitleCommand(program: Command): void {
  program
    .command('subtitle <video>', { hidden: true })
    .description(
      'Add Hormozi-style animated subtitles to a video\n\n' +
      'Examples:\n' +
      '  $ agent-media subtitle ./my-video.mp4 --sync\n' +
      '  $ agent-media subtitle <job-id> --sync\n' +
      '  $ agent-media subtitle ./clip.mp4 --style hormozi -s\n\n' +
      'The <video> argument can be a local file path or a job ID from a previous generation.',
    )
    .option('--style <name>', 'Subtitle style (default: hormozi). Options: hormozi, tiktok, minimal, clean, bold, impact, fire, pop, spotlight, aesthetic, pastel, glow, neon, electric, gradient, karaoke, boxed', 'hormozi')
    .option('-s, --sync', 'Wait for completion and print the output URL')
    .action(async (video: string, cmdOpts: { style: string; sync?: boolean }) => {
      printDeprecation('subtitle');
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = getApiKey(profileName);

      if (!apiKey) {
        throw new CLIError('Not logged in.', {
          code: 'NOT_AUTHENTICATED',
          suggestion: "Run 'agent-media login' to authenticate.",
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);
        let storagePath: string | undefined;
        let jobIdRef: string | undefined;

        // ── Determine input type ──────────────────────────────────────────
        if (isJobId(video)) {
          // Input is a job ID — the edge function will resolve storage_path
          jobIdRef = video;
          if (mode === 'human') {
            console.log(
              `  Using output from job ${chalk.cyan(video)}`,
            );
          }
        } else {
          // Input is a local file — upload it
          if (!existsSync(video)) {
            throw new CLIError(`File not found: ${video}`, {
              code: 'FILE_NOT_FOUND',
              suggestion: 'Check the file path and try again.',
            });
          }

          const stat = statSync(video);
          const maxSize = 500 * 1024 * 1024; // 500 MB for video
          if (stat.size > maxSize) {
            throw new CLIError(
              `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum is 500 MB.`,
              {
                code: 'FILE_TOO_LARGE',
                suggestion: 'Compress the video and try again.',
              },
            );
          }

          const fileName = basename(video);
          const contentType = resolveContentType(video);

          if (!contentType.startsWith('video/')) {
            throw new CLIError(
              `Unsupported file type: ${contentType}. Only video files (MP4, WebM, MOV) are supported.`,
              {
                code: 'UNSUPPORTED_FILE_TYPE',
                suggestion: 'Convert the file to MP4 and try again.',
              },
            );
          }

          const uploadSpinner = createSpinner(`Uploading ${fileName}...`);
          if (mode === 'human') uploadSpinner.start();

          const { upload_url, storage_path } = await api.getUploadUrl(
            fileName,
            contentType,
          );

          const nodeBuffer = readFileSync(video);
          const arrayBuffer = nodeBuffer.buffer.slice(
            nodeBuffer.byteOffset,
            nodeBuffer.byteOffset + nodeBuffer.byteLength,
          ) as ArrayBuffer;
          await api.uploadFile(upload_url, arrayBuffer, contentType);

          if (mode === 'human') uploadSpinner.succeed(`Uploaded ${fileName}`);

          storagePath = storage_path;
        }

        // ── Submit subtitle job ───────────────────────────────────────────
        const submitSpinner = createSpinner('Submitting subtitle job...');
        if (mode === 'human') submitSpinner.start();

        const result = await api.subtitleVideo({
          storagePath,
          jobId: jobIdRef,
          style: cmdOpts.style,
        });

        if (mode === 'human') submitSpinner.succeed('Subtitle job submitted');

        const shouldWait = !!cmdOpts.sync;

        // ── Output result ─────────────────────────────────────────────────
        if (!shouldWait) {
          switch (mode) {
            case 'json':
              printJson({
                job_id: result.job_id,
                status: result.status,
                credits_deducted: result.credits_deducted,
              });
              break;

            case 'quiet':
              printQuiet(result.job_id);
              break;

            default:
              console.log();
              console.log(
                `  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`,
              );
              console.log(
                `  ${chalk.bold('Status:')}     ${chalk.yellow(result.status)}`,
              );
              console.log(
                `  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`,
              );
              console.log();
              console.log(
                chalk.dim(
                  `  Run 'agent-media status ${result.job_id}' to check progress`,
                ),
              );
              console.log(
                chalk.dim(
                  `  Or use --sync to wait for completion`,
                ),
              );
              console.log();
              break;
          }
          return;
        }

        // ── Wait for completion (--sync) ──────────────────────────────────
        if (mode === 'human') {
          console.log();
          console.log(
            `  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`,
          );
          console.log(
            `  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`,
          );
          console.log();
        }

        const finishedJob = await waitForJob(api, result.job_id, mode);

        if (!finishedJob) return;

        if (mode === 'json') {
          const payload: Record<string, unknown> = {
            job_id: finishedJob.id,
            status: finishedJob.status,
            credits_deducted: result.credits_deducted,
          };
          if (finishedJob.status === 'failed') {
            payload['error'] = finishedJob.error_message ?? 'Unknown error';
            if (finishedJob.error_code) payload['error_code'] = finishedJob.error_code;
          }
          if (finishedJob.output_media_url) {
            payload['output_url'] = finishedJob.output_media_url;
          }
          printJson(payload);
          return;
        }

        if (mode === 'quiet') {
          printQuiet(finishedJob.output_media_url ?? finishedJob.id);
          return;
        }

        if (finishedJob.status === 'completed' && finishedJob.output_media_url) {
          console.log();
          console.log(
            `  ${chalk.bold('URL:')}  ${chalk.cyan(finishedJob.output_media_url)}`,
          );
          console.log();
        } else if (finishedJob.status !== 'completed') {
          console.log();
          console.log(
            chalk.yellow('  No output -- subtitle job did not complete successfully.'),
          );
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
