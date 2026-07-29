import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media show-your-app` command.
 *
 * Generates a Show Your App video: an AI actor holds a phone that shows your
 * app screenshot, reading your script, with Hormozi-style word-by-word
 * subtitles burned in.
 *
 * The app screenshot URL must be a publicly accessible vertical (portrait)
 * PNG, JPEG, or WebP. Host it on R2, S3, or similar. If `--actor` is omitted,
 * a random actor from the show_your_app pool is selected.
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
import {
  AgentMediaAPI,
  type GenerationJob,
} from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';
import type { OutputMode } from '../types.js';

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set<string>(['completed', 'failed', 'canceled']);

const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  submitted: chalk.blue,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

const VALID_DURATIONS = new Set([5, 10, 15]);
const VALID_SUBTITLE_STYLES = new Set(['hormozi', 'none']);
const WORDS_PER_SECOND = 3;

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

  const spinner = createSpinner('Building Show Your App video...');
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
            spinner.succeed(`Show Your App video produced in ${formatElapsed(elapsed)}`);
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

export function registerShowYourAppCommand(program: Command): void {
  program
    .command('show-your-app', { hidden: true })
    .description(
      'Generate a Show Your App video — AI actor holds a phone showing your app\n\n' +
      'Examples:\n' +
      '  $ agent-media show-your-app \\\n' +
      '      --app-screenshot https://cdn.example.com/app.png \\\n' +
      '      --script "Check out this new AI video tool" \\\n' +
      '      --sync\n\n' +
      '  $ agent-media show-your-app \\\n' +
      '      --app-screenshot https://cdn.example.com/app.png \\\n' +
      '      --script "Try our product, it changed my life" \\\n' +
      '      --actor sarah --duration 10 --sync\n\n' +
      'The app screenshot must be a publicly accessible vertical (portrait) image.\n' +
      'If --actor is omitted, a random actor is selected. Script length is capped at\n' +
      '3 words/second × duration (e.g. 15 words at 5s).',
    )
    .requiredOption('--app-screenshot <url>', 'Public URL of a vertical app screenshot (PNG/JPEG/WebP)')
    .requiredOption('--script <text>', 'Script the actor will read (≤3 words/sec × duration)')
    .option('--actor <slug>', 'Specific actor slug (random if omitted)')
    .option('--duration <seconds>', 'Video duration: 5, 10, or 15', '5')
    .option('--subtitle-style <style>', 'Subtitle style: hormozi or none', 'hormozi')
    .option('--webhook-url <url>', 'Webhook to call on completion')
    .option('-s, --sync', 'Wait for completion and print the output URL')
    .action(async (cmdOpts: {
      appScreenshot: string;
      script: string;
      actor?: string;
      duration: string;
      subtitleStyle: string;
      webhookUrl?: string;
      sync?: boolean;
    }) => {
      printDeprecation('show-your-app');
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

      const duration = Number(cmdOpts.duration);
      if (!VALID_DURATIONS.has(duration)) {
        throw new CLIError(`Invalid --duration: ${cmdOpts.duration}`, {
          code: 'VALIDATION_ERROR',
          suggestion: 'Use 5, 10, or 15.',
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
          suggestion: `Shorten the script to ≤${maxWords} words or increase --duration.`,
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        const submitSpinner = createSpinner('Submitting Show Your App job...');
        if (mode === 'human') submitSpinner.start();

        const result = await api.showYourAppGenerate({
          app_screenshot_url: cmdOpts.appScreenshot,
          script: cmdOpts.script,
          actor_slug: cmdOpts.actor,
          duration,
          subtitle_style: cmdOpts.subtitleStyle as 'hormozi' | 'none',
          webhook_url: cmdOpts.webhookUrl,
        });

        if (mode === 'human') submitSpinner.succeed('Show Your App job submitted');

        if (!cmdOpts.sync) {
          switch (mode) {
            case 'json':
              printJson(result);
              break;
            case 'quiet':
              printQuiet(result.job_id);
              break;
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
          console.log(`  ${chalk.bold('URL:')}  ${chalk.cyan(finishedJob.output_media_url)}`);
          console.log();
        } else if (finishedJob.status !== 'completed') {
          console.log();
          console.log(chalk.yellow('  No output — Show Your App job did not complete successfully.'));
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
