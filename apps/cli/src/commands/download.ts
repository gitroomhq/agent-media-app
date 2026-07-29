// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media download <job-id>` command.
 *
 * Downloads the output media file from a completed generation job.
 * Flow:
 * 1. Authenticate via API key from credentials store.
 * 2. Fetch the job and verify it is completed.
 * 3. Download the output media to a local file.
 * 4. Display the saved path and file size.
 */

import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  detectOutputMode,
  printJson,
  printQuiet,
  createSpinner,
} from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

/** Map content-type to file extension. */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Detect the file extension from a URL path or content-type header.
 */
function detectExtension(url: string, _contentType?: string | null): string {
  // Try content-type first
  if (_contentType) {
    const baseType = _contentType.split(';')[0]!.trim().toLowerCase();
    const ext = EXTENSION_BY_CONTENT_TYPE[baseType];
    if (ext) return ext;
  }

  // Fall back to URL extension
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase();
    if (ext) return ext;
  } catch {
    // Invalid URL, fall through
  }

  // Default to mp4 for video content
  return '.mp4';
}

/**
 * Format bytes to a human-readable string (e.g., "15.2 MB").
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function registerDownloadCommand(program: Command): void {
  program
    .command('download <job-id>')
    .description('Download the output media from a completed job')
    .option('-o, --output <path>', 'Output file path')
    .action(async (jobId: string, cmdOpts: { output?: string }) => {
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

        // ── Step 1: Fetch the job ────────────────────────────────────
        const fetchSpinner = createSpinner('Fetching job...');
        if (mode === 'human') fetchSpinner.start();

        const job = await api.getJob(jobId);

        if (mode === 'human') fetchSpinner.stop();

        // ── Step 2: Verify job is completed ──────────────────────────
        if (job.status !== 'completed') {
          if (mode === 'json') {
            printJson({
              error: 'Job is not completed',
              status: job.status,
              job_id: job.id,
            });
            process.exit(1);
          }

          if (mode === 'quiet') {
            printQuiet(`error:${job.status}`);
            process.exit(1);
          }

          console.log();
          console.log(
            `  ${chalk.yellow('Job is not yet completed.')} Current status: ${chalk.bold(job.status)}`,
          );
          console.log();
          console.log(
            chalk.dim(`  Run 'agent-media status ${jobId} --watch' to track progress.`),
          );
          console.log();
          process.exit(1);
        }

        // ── Step 3: Verify output URL exists ─────────────────────────
        if (!job.output_media_url) {
          throw new CLIError('No media available for this job.', {
            code: 'NO_MEDIA',
            suggestion: 'The job completed but produced no output. This may be a server error.',
          });
        }

        // ── Step 4: Determine output path ────────────────────────────
        const ext = detectExtension(job.output_media_url);
        const shortId = job.id.slice(0, 8);
        const defaultFilename = `${job.model_slug}-${shortId}${ext}`;
        const outputPath = resolve(cmdOpts.output ?? `./${defaultFilename}`);

        // Warn if file already exists (human mode only)
        if (existsSync(outputPath) && mode === 'human') {
          console.log(
            chalk.yellow(`  Warning: overwriting existing file ${outputPath}`),
          );
        }

        // ── Step 5: Download with progress ───────────────────────────
        const downloadSpinner = createSpinner('Downloading...');
        if (mode === 'human') downloadSpinner.start();

        const totalBytes = await api.downloadMedia(
          job.output_media_url,
          outputPath,
          (received, total) => {
            if (mode === 'human') {
              const progress = total
                ? `${formatBytes(received)} / ${formatBytes(total)}`
                : formatBytes(received);
              downloadSpinner.text = `Downloading... ${progress}`;
            }
          },
        );

        if (mode === 'human') {
          downloadSpinner.succeed(`Downloaded to ${outputPath} (${formatBytes(totalBytes)})`);
        }

        // ── Step 6: Display result ───────────────────────────────────
        switch (mode) {
          case 'json':
            printJson({
              job_id: job.id,
              output_path: outputPath,
              bytes: totalBytes,
              size: formatBytes(totalBytes),
            });
            break;

          case 'quiet':
            printQuiet(outputPath);
            break;

          default:
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
