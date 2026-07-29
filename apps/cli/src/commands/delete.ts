// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media delete <job-id>` command.
 *
 * Soft-deletes a generation job, with options to restore soft-deleted
 * jobs or batch-delete all failed jobs.
 *
 * Flow:
 * 1. Load API key from the credential store.
 * 2. If --restore: restore the soft-deleted job.
 * 3. If --all-failed: list failed jobs, confirm, delete each.
 * 4. Otherwise: fetch job, show summary, confirm (unless --force), delete.
 *
 * Supports human, JSON, and quiet output modes.
 */

import { createInterface } from 'node:readline';
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
  submitted: chalk.yellow,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

/**
 * Format a status string with color.
 */
function formatStatus(status: string): string {
  const colorize = STATUS_COLORS[status] ?? chalk.white;
  return colorize(status.toUpperCase());
}

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

/**
 * Ask a yes/no question on stdin and return the result.
 * Defaults to "no" (destructive action requires explicit confirmation).
 */
function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

/**
 * Print a human-readable job summary for the delete confirmation.
 */
function printJobSummary(job: GenerationJob): void {
  const modelDisplay = job.model_display_name
    ? `${job.model_display_name} (${job.model_slug})`
    : job.model_slug;

  console.log();
  console.log(`  ${chalk.bold('Job')} ${chalk.cyan(job.id)}`);
  console.log(`    ${chalk.bold('Model:')}   ${modelDisplay}`);
  console.log(`    ${chalk.bold('Status:')}  ${formatStatus(job.status)}`);
  console.log(`    ${chalk.bold('Prompt:')}  "${truncate(job.prompt, 60)}"`);
  console.log(`    ${chalk.bold('Created:')} ${job.created_at}`);
  console.log();
}

interface DeleteOptions {
  force?: boolean;
  restore?: boolean;
  allFailed?: boolean;
}

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete [job-id]')
    .description('Delete a generation job (soft-delete)')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--restore', 'Restore a soft-deleted job instead of deleting')
    .option('--all-failed', 'Delete all failed jobs')
    .action(async (jobId: string | undefined, cmdOpts: DeleteOptions) => {
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

      // Validate arguments
      if (cmdOpts.allFailed && jobId) {
        throw new CLIError('Cannot specify both a job ID and --all-failed.', {
          code: 'INVALID_FLAGS',
          suggestion: "Use either 'agent-media delete <job-id>' or 'agent-media delete --all-failed'.",
        });
      }

      if (!cmdOpts.allFailed && !jobId) {
        throw new CLIError('A job ID is required unless using --all-failed.', {
          code: 'MISSING_ARGUMENT',
          suggestion: "Usage: agent-media delete <job-id> or agent-media delete --all-failed",
        });
      }

      if (cmdOpts.restore && cmdOpts.allFailed) {
        throw new CLIError('Cannot use --restore with --all-failed.', {
          code: 'INVALID_FLAGS',
          suggestion: "Restore jobs individually: 'agent-media delete <job-id> --restore'.",
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        // ── Restore mode ──────────────────────────────────────────────
        if (cmdOpts.restore && jobId) {
          const spinner = createSpinner('Restoring job...');
          if (mode === 'human') spinner.start();

          const result = await api.restoreJob(jobId);

          if (mode === 'human') spinner.succeed(`Job ${chalk.cyan(jobId)} restored`);

          switch (mode) {
            case 'json':
              printJson({
                jobId: result.jobId,
                restored: result.restored,
              });
              break;

            case 'quiet':
              printQuiet('restored');
              break;

            default:
              console.log();
              console.log(`  ${chalk.green('Job restored successfully.')}`);
              console.log(
                chalk.dim(`  Run 'agent-media status ${jobId}' to check details.`),
              );
              console.log();
              break;
          }

          return;
        }

        // ── Delete all failed jobs ────────────────────────────────────
        if (cmdOpts.allFailed) {
          const listSpinner = createSpinner('Finding failed jobs...');
          if (mode === 'human') listSpinner.start();

          const { jobs: failedJobs } = await api.listJobs({
            status: 'failed',
            limit: 100,
          });

          if (mode === 'human') listSpinner.stop();

          if (failedJobs.length === 0) {
            if (mode === 'json') {
              printJson({ deleted: [], count: 0 });
            } else if (mode === 'quiet') {
              printQuiet('0');
            } else {
              console.log();
              console.log(chalk.dim('  No failed jobs found.'));
              console.log();
            }
            return;
          }

          // Show summary and confirm
          if (mode === 'human' && !cmdOpts.force) {
            console.log();
            console.log(
              chalk.bold(`  Found ${failedJobs.length} failed job${failedJobs.length === 1 ? '' : 's'}:`),
            );
            console.log();

            for (const job of failedJobs.slice(0, 10)) {
              const modelDisplay = job.model_display_name ?? job.model_slug;
              console.log(
                `    ${chalk.cyan(job.id.slice(0, 8))}  ${modelDisplay}  "${truncate(job.prompt, 40)}"`,
              );
            }

            if (failedJobs.length > 10) {
              console.log(
                chalk.dim(`    ... and ${failedJobs.length - 10} more`),
              );
            }

            console.log();

            const confirmed = await askConfirmation(
              `  Delete ${chalk.red(String(failedJobs.length))} failed job${failedJobs.length === 1 ? '' : 's'}? [y/N] `,
            );

            if (!confirmed) {
              console.log(chalk.dim('  Deletion cancelled.'));
              return;
            }
          }

          // Delete each job
          const deleteSpinner = createSpinner('Deleting failed jobs...');
          if (mode === 'human') deleteSpinner.start();

          const results: Array<{ jobId: string; success: boolean }> = [];
          for (const job of failedJobs) {
            try {
              await api.deleteJob(job.id);
              results.push({ jobId: job.id, success: true });
            } catch {
              results.push({ jobId: job.id, success: false });
            }

            if (mode === 'human') {
              deleteSpinner.text = `Deleting failed jobs... ${results.length}/${failedJobs.length}`;
            }
          }

          const successCount = results.filter((r) => r.success).length;

          if (mode === 'human') {
            deleteSpinner.succeed(
              `Deleted ${successCount}/${failedJobs.length} failed job${failedJobs.length === 1 ? '' : 's'}`,
            );
            console.log();
          }

          switch (mode) {
            case 'json':
              printJson({
                deleted: results.filter((r) => r.success).map((r) => r.jobId),
                failed: results.filter((r) => !r.success).map((r) => r.jobId),
                count: successCount,
              });
              break;

            case 'quiet':
              printQuiet(String(successCount));
              break;

            default:
              // Already printed above
              break;
          }

          return;
        }

        // ── Single job delete ─────────────────────────────────────────
        const fetchSpinner = createSpinner('Fetching job details...');
        if (mode === 'human') fetchSpinner.start();

        const job = await api.getJob(jobId!);

        if (mode === 'human') fetchSpinner.stop();

        // Show summary and confirm in human mode
        if (mode === 'human' && !cmdOpts.force) {
          printJobSummary(job);

          const confirmed = await askConfirmation(
            `  Delete job ${chalk.cyan(job.id.slice(0, 8))}? This can be undone with --restore. [y/N] `,
          );

          if (!confirmed) {
            console.log(chalk.dim('  Deletion cancelled.'));
            return;
          }
        }

        const deleteSpinner = createSpinner('Deleting job...');
        if (mode === 'human') deleteSpinner.start();

        const result = await api.deleteJob(jobId!);

        if (mode === 'human') deleteSpinner.succeed(`Job ${chalk.cyan(jobId!)} deleted`);

        switch (mode) {
          case 'json':
            printJson({
              jobId: result.jobId,
              deleted: true,
              restorable: true,
            });
            break;

          case 'quiet':
            printQuiet('deleted');
            break;

          default:
            console.log();
            console.log(`  ${chalk.green('Job deleted successfully.')}`);
            console.log(
              chalk.dim(`  Restore with: agent-media delete ${jobId!} --restore`),
            );
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
