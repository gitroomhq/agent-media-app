// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media cancel <job-id>` command.
 *
 * Cancels an active generation job (submitted/queued/processing)
 * and refunds the credits. Use --all to cancel all active jobs.
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
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

interface CancelOptions {
  all?: boolean;
}

export function registerCancelCommand(program: Command): void {
  program
    .command('cancel [job-id]')
    .description('Cancel an active generation job and refund credits')
    .option('--all', 'Cancel all active (submitted/queued/processing) jobs')
    .action(async (jobId: string | undefined, cmdOpts: CancelOptions) => {
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

      if (!jobId && !cmdOpts.all) {
        throw new CLIError('Provide a job ID or use --all.', {
          code: 'MISSING_ARGUMENT',
          suggestion: "Usage: agent-media cancel <job-id> or agent-media cancel --all",
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        // ── Cancel all active jobs ──────────────────────────────────────
        if (cmdOpts.all) {
          const spinner = createSpinner('Finding active jobs...');
          if (mode === 'human') spinner.start();

          const { jobs } = await api.listJobs({ limit: 100 });
          const activeJobs = jobs.filter((j) =>
            ['submitted', 'queued', 'processing'].includes(j.status),
          );

          if (activeJobs.length === 0) {
            if (mode === 'human') {
              spinner.stop();
              console.log(chalk.dim('\n  No active jobs to cancel.\n'));
            } else if (mode === 'json') {
              printJson({ canceled: [], count: 0, credits_refunded: 0 });
            } else {
              printQuiet('0');
            }
            return;
          }

          if (mode === 'human') {
            spinner.text = `Canceling ${activeJobs.length} active job${activeJobs.length === 1 ? '' : 's'}...`;
          }

          let totalRefunded = 0;
          const canceled: string[] = [];

          for (const job of activeJobs) {
            try {
              const result = await api.cancelJob(job.id);
              if (result.canceled) {
                canceled.push(job.id);
                totalRefunded += result.credits_refunded;
              }
            } catch {
              // Skip jobs that can't be canceled
            }
          }

          if (mode === 'human') {
            spinner.succeed(
              `Canceled ${canceled.length} job${canceled.length === 1 ? '' : 's'}, refunded ${chalk.green(String(totalRefunded))} credits`,
            );
            console.log();
          } else if (mode === 'json') {
            printJson({ canceled, count: canceled.length, credits_refunded: totalRefunded });
          } else {
            printQuiet(String(canceled.length));
          }

          return;
        }

        // ── Cancel single job ───────────────────────────────────────────
        const spinner = createSpinner('Canceling job...');
        if (mode === 'human') spinner.start();

        const result = await api.cancelJob(jobId!);

        if (mode === 'human') {
          spinner.succeed(
            `Job ${chalk.cyan(jobId!.slice(0, 8))} canceled, ${chalk.green(String(result.credits_refunded))} credits refunded`,
          );
          console.log();
        } else if (mode === 'json') {
          printJson(result);
        } else {
          printQuiet('canceled');
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
