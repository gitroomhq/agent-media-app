// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media status <job-id>` command.
 *
 * Fetches and displays the current state of a generation job.
 * Supports --watch mode for live polling, plus JSON and quiet output modes.
 */

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

/** Status labels with color coding. */
const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

/**
 * Format a status string with color and brackets.
 */
function formatStatus(status: string): string {
  const colorize = STATUS_COLORS[status] ?? chalk.white;
  return colorize(`[${status.toUpperCase()}] ${status}`);
}

/**
 * Format a relative time string (e.g., "2 minutes ago").
 */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Format the duration and resolution string.
 */
function formatDurationRes(job: GenerationJob): string {
  const parts: string[] = [];
  if (job.duration_seconds != null) parts.push(`${job.duration_seconds}s`);
  if (job.resolution) parts.push(`@ ${job.resolution}`);
  return parts.join(' ') || 'N/A';
}

/**
 * Print the human-readable job detail card.
 */
function printJobCard(job: GenerationJob): void {
  const modelDisplay = job.model_display_name
    ? `${job.model_display_name} (${job.model_slug})`
    : job.model_slug;

  console.log();
  console.log(`  ${chalk.bold('Job')} ${chalk.cyan(job.id)}`);
  console.log(`    ${chalk.bold('Model:')}      ${modelDisplay}`);
  console.log(`    ${chalk.bold('Status:')}     ${formatStatus(job.status)}`);
  console.log(`    ${chalk.bold('Created:')}    ${timeAgo(job.created_at)}`);
  console.log(`    ${chalk.bold('Duration:')}   ${formatDurationRes(job)}`);

  // Credits line: show "(refunded)" when applicable
  const creditsStr = job.credits_charged != null ? String(job.credits_charged) : 'N/A';
  const refundedSuffix = job.credits_refunded ? chalk.yellow(' (refunded)') : '';
  console.log(`    ${chalk.bold('Credits:')}    ${creditsStr}${refundedSuffix}`);

  // Truncate long prompts for display
  const maxPromptLen = 60;
  const promptDisplay =
    job.prompt.length > maxPromptLen
      ? `"${job.prompt.slice(0, maxPromptLen)}..."`
      : `"${job.prompt}"`;
  console.log(`    ${chalk.bold('Prompt:')}     ${promptDisplay}`);

  // Completed: show output URL and download suggestion
  if (job.status === 'completed' && job.output_media_url) {
    console.log();
    console.log(`    ${chalk.bold('Output:')}     ${chalk.underline(job.output_media_url)}`);
    console.log();
    console.log(
      chalk.dim(`    Download with: agent-media download ${job.id}`),
    );
  }

  // Failed: show error message
  if (job.status === 'failed' && job.error_message) {
    console.log();
    console.log(`    ${chalk.bold('Error:')}      ${chalk.red(job.error_message)}`);
  }

  console.log();
}

/**
 * Clear the terminal and move cursor to top for --watch redraws.
 */
function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[H');
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status <job-id>')
    .description('Check the status of a generation job')
    .option('-w, --watch', 'Poll for updates until the job completes')
    .action(async (jobId: string, cmdOpts: { watch?: boolean }) => {
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

        if (cmdOpts.watch && mode === 'human') {
          // ── Watch mode: poll every 3s, update in-place ─────────────
          const POLL_INTERVAL_MS = 3000;
          const startTime = Date.now();
          let running = true;

          // Handle Ctrl+C gracefully
          const onSigint = (): void => {
            running = false;
            console.log();
            console.log(chalk.dim('  Stopped watching.'));
            process.exit(0);
          };
          process.on('SIGINT', onSigint);

          try {
            while (running) {
              const job = await api.getJob(jobId);
              const elapsed = Math.floor((Date.now() - startTime) / 1000);

              clearScreen();
              printJobCard(job);
              console.log(
                chalk.dim(`    Watching... elapsed ${elapsed}s (Ctrl+C to stop)`),
              );
              console.log();

              // Exit when terminal status reached
              if (
                job.status === 'completed' ||
                job.status === 'failed' ||
                job.status === 'canceled'
              ) {
                break;
              }

              // Wait before next poll
              await new Promise<void>((resolve) => {
                // Allow early exit on SIGINT
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
          } finally {
            process.removeListener('SIGINT', onSigint);
          }
        } else {
          // ── Single fetch ───────────────────────────────────────────
          const spinner = createSpinner('Fetching job status...');
          if (mode === 'human') spinner.start();

          const job = await api.getJob(jobId);

          if (mode === 'human') spinner.stop();

          switch (mode) {
            case 'json':
              printJson(job);
              break;

            case 'quiet':
              printQuiet(job.status);
              break;

            default:
              printJobCard(job);
              break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
