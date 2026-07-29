// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media list` command.
 *
 * Lists the authenticated user's generation jobs with optional filtering
 * by status and model. Supports human (table), JSON, and quiet output modes.
 *
 * Human mode displays a formatted table with colored status indicators
 * and relative timestamps. JSON mode outputs the raw job array. Quiet
 * mode outputs job IDs only, one per line, for scripting.
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
  submitted: chalk.yellow,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

/** Valid status values for the --status filter. */
const VALID_STATUSES = ['pending', 'submitted', 'processing', 'completed', 'failed', 'canceled'];

/**
 * Format a status string with color.
 */
function colorStatus(status: string): string {
  const colorize = STATUS_COLORS[status] ?? chalk.white;
  return colorize(status);
}

/**
 * Format a relative time string (e.g., "2m ago", "3h ago", "5d ago").
 */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Truncate a string to maxLen characters, appending ellipsis if needed.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Pad or truncate a string to an exact fixed width for column alignment.
 */
function fixedWidth(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B\[[0-9;]*m/g,
    '',
  );
  if (stripped.length >= width) return str;
  return str + ' '.repeat(width - stripped.length);
}

/**
 * Print the formatted table of jobs to stdout.
 */
function printJobTable(
  jobs: GenerationJob[],
  total: number,
  filters: { status?: string; model?: string },
): void {
  // Column widths
  const COL_ID = 10;
  const COL_STATUS = 12;
  const COL_MODEL = 18;
  const COL_PROMPT = 42;
  const COL_CREDITS = 9;
  const COL_CREATED = 10;

  // Header
  const header =
    fixedWidth('ID', COL_ID) +
    fixedWidth('STATUS', COL_STATUS) +
    fixedWidth('MODEL', COL_MODEL) +
    fixedWidth('PROMPT', COL_PROMPT) +
    fixedWidth('CREDITS', COL_CREDITS) +
    'CREATED';

  const separator =
    '\u2500'.repeat(COL_ID) +
    '\u2500'.repeat(COL_STATUS) +
    '\u2500'.repeat(COL_MODEL) +
    '\u2500'.repeat(COL_PROMPT) +
    '\u2500'.repeat(COL_CREDITS) +
    '\u2500'.repeat(COL_CREATED);

  console.log();
  console.log(chalk.bold(header));
  console.log(chalk.dim(separator));

  for (const job of jobs) {
    const id = fixedWidth(job.id.slice(0, 8), COL_ID);
    const status = fixedWidth(colorStatus(job.status), COL_STATUS);
    const model = fixedWidth(truncate(job.model_slug, COL_MODEL - 2), COL_MODEL);
    const prompt = fixedWidth(truncate(job.prompt, COL_PROMPT - 2), COL_PROMPT);
    const credits =
      job.credits_charged != null
        ? fixedWidth(String(job.credits_charged), COL_CREDITS)
        : fixedWidth('-', COL_CREDITS);
    const created = timeAgo(job.created_at);

    console.log(`${id}${status}${model}${prompt}${credits}${created}`);
  }

  console.log();

  // Summary line
  const parts: string[] = [];
  if (filters.status) parts.push(`status=${filters.status}`);
  if (filters.model) parts.push(`model=${filters.model}`);
  const filterStr = parts.length > 0 ? ` (filtered: ${parts.join(', ')})` : '';

  console.log(
    chalk.dim(`  Showing ${jobs.length} of ${total} jobs${filterStr}`),
  );
  console.log();
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List your generation jobs')
    .option('-s, --status <status>', 'Filter by job status')
    .option('-m, --model <model>', 'Filter by model slug')
    .option('-n, --limit <n>', 'Maximum number of jobs to show', '20')
    .action(
      async (cmdOpts: {
        status?: string;
        model?: string;
        limit?: string;
      }) => {
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

        // Validate --status flag
        if (cmdOpts.status && !VALID_STATUSES.includes(cmdOpts.status)) {
          throw new CLIError(`Invalid status: ${cmdOpts.status}`, {
            code: 'INVALID_ARGUMENT',
            suggestion: `Valid statuses: ${VALID_STATUSES.join(', ')}`,
          });
        }

        // Parse --limit flag
        const limit = parseInt(cmdOpts.limit ?? '20', 10);
        if (isNaN(limit) || limit < 1) {
          throw new CLIError('--limit must be a positive integer.', {
            code: 'INVALID_ARGUMENT',
            suggestion: 'Provide a number greater than 0.',
          });
        }

        try {
          const api = new AgentMediaAPI(apiKey);

          const spinner = createSpinner('Fetching jobs...');
          if (mode === 'human') spinner.start();

          const { jobs, total } = await api.listJobs({
            status: cmdOpts.status,
            model: cmdOpts.model,
            limit,
            sort: 'newest',
          });

          if (mode === 'human') spinner.stop();

          // ── Empty state ──────────────────────────────────────────────
          if (jobs.length === 0) {
            switch (mode) {
              case 'json':
                printJson([]);
                break;

              case 'quiet':
                // No output for quiet mode on empty result
                break;

              default:
                console.log();
                console.log(
                  chalk.dim(
                    "  No jobs found. Run 'agent-media generate <model>' to create one.",
                  ),
                );
                console.log();
                break;
            }
            return;
          }

          // ── Output ───────────────────────────────────────────────────
          switch (mode) {
            case 'json':
              printJson(jobs);
              break;

            case 'quiet':
              printQuiet(jobs.map((job) => job.id));
              break;

            default:
              printJobTable(jobs, total, {
                status: cmdOpts.status,
                model: cmdOpts.model,
              });
              break;
          }
        } catch (error: unknown) {
          handleError(error);
        }
      },
    );
}
