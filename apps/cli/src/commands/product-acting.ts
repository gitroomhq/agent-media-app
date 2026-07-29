import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media product-acting` command.
 *
 * Generates a Product Acting UGC video: an AI creator presents or reacts to a
 * product image in a selected real-world scenario.
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
const VALID_DURATIONS = new Set([5, 10, 15]);
const VALID_SUBTITLE_STYLES = new Set(['hormozi', 'none']);
const VALID_TEMPLATES = new Set([
  'product-in-hand',
  'mirror-selfie',
  'bathroom-reaction',
  'kitchen-counter',
  'car-selfie',
  'couch-review',
  'expert-interview',
  'product-closeup',
]);
const VALID_ACTING_STYLES = new Set([
  'raw-selfie',
  'shocked',
  'angry',
  'excited',
  'dramatic',
  'weird-hook',
  'casual-demo',
  'honest-review',
]);
const WORDS_PER_SECOND = 3;

const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  submitted: chalk.blue,
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

  const spinner = createSpinner('Building Product Acting UGC video...');
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
            spinner.succeed(`Product Acting UGC video produced in ${formatElapsed(elapsed)}`);
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

export function registerProductActingCommand(program: Command): void {
  program
    .command('product-acting', { hidden: true })
    .description(
      'Generate Product Acting UGC — AI creator presents a product image\n\n' +
      'Examples:\n' +
      '  $ agent-media product-acting \\\n' +
      '      --product-image https://cdn.example.com/perfume.png \\\n' +
      '      --actor sarah \\\n' +
      '      --script "I did not expect this perfume to smell this expensive" \\\n' +
      '      --sync\n\n' +
      '  $ agent-media product-acting \\\n' +
      '      --product-image https://cdn.example.com/bottle.webp \\\n' +
      '      --actor marcus --product-name "Hydra Boost" \\\n' +
      '      --about "Daily electrolyte drink for gym recovery" \\\n' +
      '      --template kitchen-counter --acting-style excited --duration 10 --sync\n\n' +
      'The product image must be a publicly accessible image URL. If --script is omitted,\n' +
      '--about is required and the API generates a short script.',
    )
    .requiredOption('--product-image <url>', 'Public URL of the product image')
    .requiredOption('--actor <slug>', 'Actor slug from `agent-media actor list`')
    .option('--actor-variant-id <uuid>', 'Optional actor variant UUID')
    .option('--product-name <name>', 'Product name for script/frame context')
    .option('--about <text>', 'Product description/context. Required if --script is omitted')
    .option('--script <text>', 'Exact script the actor should say')
    .option('--template <name>', 'Scenario: product-in-hand, mirror-selfie, bathroom-reaction, kitchen-counter, car-selfie, couch-review, expert-interview, product-closeup', 'product-in-hand')
    .option('--acting-style <name>', 'Acting style: raw-selfie, shocked, angry, excited, dramatic, weird-hook, casual-demo, honest-review', 'raw-selfie')
    .option('--visual-style <text>', 'Extra visual/camera direction')
    .option('--duration <seconds>', 'Video duration: 5, 10, or 15', '5')
    .option('--subtitle-style <style>', 'Subtitle style: hormozi or none', 'hormozi')
    .option('--webhook-url <url>', 'Webhook to call on completion')
    .option('-s, --sync', 'Wait for completion and print the output URL')
    .action(async (cmdOpts: {
      productImage: string;
      actor: string;
      actorVariantId?: string;
      productName?: string;
      about?: string;
      script?: string;
      template: string;
      actingStyle: string;
      visualStyle?: string;
      duration: string;
      subtitleStyle: string;
      webhookUrl?: string;
      sync?: boolean;
    }) => {
      printDeprecation('product-acting');
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
      if (!VALID_TEMPLATES.has(cmdOpts.template)) {
        throw new CLIError(`Invalid --template: ${cmdOpts.template}`, {
          code: 'VALIDATION_ERROR',
          suggestion: `Use one of: ${Array.from(VALID_TEMPLATES).join(', ')}.`,
        });
      }
      if (!VALID_ACTING_STYLES.has(cmdOpts.actingStyle)) {
        throw new CLIError(`Invalid --acting-style: ${cmdOpts.actingStyle}`, {
          code: 'VALIDATION_ERROR',
          suggestion: `Use one of: ${Array.from(VALID_ACTING_STYLES).join(', ')}.`,
        });
      }
      if (!cmdOpts.script && !cmdOpts.about) {
        throw new CLIError('Either --script or --about is required.', {
          code: 'VALIDATION_ERROR',
          suggestion: 'Pass exact words with --script or product context with --about.',
        });
      }
      if (cmdOpts.script) {
        const wordCount = cmdOpts.script.trim().split(/\s+/).filter(Boolean).length;
        const maxWords = duration * WORDS_PER_SECOND;
        if (wordCount > maxWords) {
          throw new CLIError(`Script too long: ${wordCount} words. Max ${maxWords} for ${duration}s.`, {
            code: 'VALIDATION_ERROR',
            suggestion: `Shorten the script to ≤${maxWords} words or increase --duration.`,
          });
        }
      }

      try {
        const api = new AgentMediaAPI(apiKey);
        const submitSpinner = createSpinner('Submitting Product Acting UGC job...');
        if (mode === 'human') submitSpinner.start();

        const result = await api.productActingGenerate({
          product_image_url: cmdOpts.productImage,
          actor_slug: cmdOpts.actor,
          actor_variant_id: cmdOpts.actorVariantId,
          product_name: cmdOpts.productName,
          product_description: cmdOpts.about,
          script: cmdOpts.script,
          template: cmdOpts.template,
          acting_style: cmdOpts.actingStyle,
          visual_style: cmdOpts.visualStyle,
          duration,
          subtitles: cmdOpts.subtitleStyle !== 'none',
          subtitle_style: cmdOpts.subtitleStyle as 'hormozi' | 'none',
          webhook_url: cmdOpts.webhookUrl,
        });

        if (mode === 'human') submitSpinner.succeed('Product Acting UGC job submitted');

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
              console.log(`  ${chalk.bold('Actor:')}      ${result.actor_slug}`);
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
          console.log(`  ${chalk.bold('Actor:')}      ${result.actor_slug}`);
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
          console.log(chalk.yellow('  No output — Product Acting UGC job did not complete successfully.'));
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
