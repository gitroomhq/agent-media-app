import { printDeprecation } from '../lib/deprecation.js';
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media text-to-video` command.
 *
 * Pure-prompt video generation via Seedance 2.0 text-to-video at 720p.
 * No character sheet, no storyboard. The prompt IS the entire creative —
 * style, subject, mood, composition, lighting. Best for stylistic content
 * where you want the model to invent everything from the prompt text.
 *
 * Cost: 350 / 700 / 1050 credits for 5 / 10 / 15s.
 */

import { readFileSync, existsSync } from 'node:fs';
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

const VALID_DURATIONS = new Set([5, 10, 15]);
const VALID_RATIOS = new Set(['9:16', '16:9', '1:1']);

async function pollUntilDone(
  api: AgentMediaAPI,
  jobId: string,
  expectedSeconds: number,
  mode: OutputMode,
): Promise<GenerationJob> {
  const start = Date.now();
  const spinner = createSpinner(`Rendering (~${expectedSeconds}s)...`);
  if (mode === 'human') spinner.start();
  let onSigint: (() => void) | null = null;
  try {
    onSigint = () => {
      if (mode === 'human') spinner.fail('Aborted while waiting');
      process.exit(130);
    };
    process.on('SIGINT', onSigint);

    while (true) {
      const job = await api.getJob(jobId);
      if (TERMINAL_STATUSES.has(job.status)) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (mode === 'human') {
          if (job.status === 'completed') spinner.succeed(`Done (${elapsed}s)`);
          else spinner.fail(`${job.status}: ${job.error_message ?? 'unknown error'}`);
        }
        return job;
      }
      if (mode === 'human') {
        const elapsed = Math.round((Date.now() - start) / 1000);
        spinner.text = `Rendering ${chalk.dim(`(${elapsed}s)`)}`;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  } finally {
    if (onSigint) process.removeListener('SIGINT', onSigint);
  }
}

export function registerTextToVideoCommand(program: Command): void {
  program
    .command('text-to-video', { hidden: true })
    .description(
      'Pure-prompt text-to-video via Seedance 2.0 — no character, no storyboard. The prompt is the entire creative.\n\n' +
      'Examples:\n' +
      '  $ agent-media text-to-video \\\n' +
      '      --prompt "Handcrafted stop-motion. Miniature practical sets, animation on 2s, warm magical lighting." \\\n' +
      '      --duration 5 --aspect 9:16 --wait\n\n' +
      '  $ agent-media text-to-video --prompt-file ./prompts/stop-motion.txt --duration 10 --wait\n\n' +
      'Use --wait to block until the video is rendered and print the R2 URL; without --wait the command prints the job_id and exits.',
    )
    .option('--prompt <text>', 'Full video prompt (20–1000 chars). Style + subject + mood + composition all in one string.')
    .option('--prompt-file <path>', 'Read the prompt from a local file instead of --prompt.')
    .option('--duration <seconds>', 'Video duration: 5, 10, or 15', '10')
    .option('--aspect <ratio>', 'Aspect ratio: 9:16, 16:9, or 1:1', '9:16')
    .option('--no-audio', 'Disable Seedance audio synthesis')
    .option('--webhook-url <url>', 'HTTPS URL to receive a callback on completion')
    .option('--post <ids>', 'Comma-separated Postiz integration IDs to auto-publish to on completion. Get IDs from `agent-media list-postiz` or the web Postiz page.')
    .option('--caption <text>', 'Literal caption text for the social post. Used when --caption-ai is not set.')
    .option('--caption-ai [guidance]', 'Have Claude Opus write the caption on completion. Optionally pass tone/hashtag guidance as the value (e.g. --caption-ai "fun + 3 hashtags").')
    .option('-w, --wait', 'Block until the job completes and print the video URL')
    .action(async (cmdOpts: {
      prompt?: string;
      promptFile?: string;
      duration: string;
      aspect: string;
      audio: boolean;
      webhookUrl?: string;
      post?: string;
      caption?: string;
      captionAi?: string | boolean;
      wait?: boolean;
    }) => {
      printDeprecation('text-to-video');
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean; profile?: string }>();
      const mode = detectOutputMode(globalOpts);
      try {
        // Resolve prompt: --prompt wins; otherwise --prompt-file.
        let promptText = cmdOpts.prompt;
        if (!promptText && cmdOpts.promptFile) {
          if (!existsSync(cmdOpts.promptFile)) {
            throw new CLIError(`Prompt file not found: ${cmdOpts.promptFile}`, { code: 'FILE_NOT_FOUND' });
          }
          promptText = readFileSync(cmdOpts.promptFile, 'utf8').trim();
        }
        if (!promptText || promptText.trim().length < 20 || promptText.length > 1000) {
          throw new CLIError('--prompt (or --prompt-file) is required (20–1000 chars).', { code: 'VALIDATION_ERROR' });
        }

        const duration = Number.parseInt(cmdOpts.duration, 10);
        if (!VALID_DURATIONS.has(duration)) {
          throw new CLIError(`--duration must be 5, 10, or 15 (got ${cmdOpts.duration})`, { code: 'VALIDATION_ERROR' });
        }
        if (!VALID_RATIOS.has(cmdOpts.aspect)) {
          throw new CLIError(`--aspect must be 9:16, 16:9, or 1:1 (got ${cmdOpts.aspect})`, { code: 'VALIDATION_ERROR' });
        }

        const profile = await resolveProfileName(globalOpts.profile);
        const apiKey = await getApiKey(profile);
        const api = new AgentMediaAPI(apiKey ?? undefined);

        // --post = comma-separated Postiz integration IDs.
        const postIds = typeof cmdOpts.post === 'string'
          ? cmdOpts.post.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
          : [];
        const captionAiOn = cmdOpts.captionAi !== undefined && cmdOpts.captionAi !== false;
        if (postIds.length > 0 && !captionAiOn && !cmdOpts.caption) {
          throw new CLIError(
            '--post requires either --caption "..." or --caption-ai (with optional guidance)',
            { code: 'VALIDATION_ERROR' },
          );
        }

        const submit = await api.textToVideoGenerate({
          prompt: promptText.trim(),
          duration: duration as 5 | 10 | 15,
          aspect_ratio: cmdOpts.aspect as '9:16' | '16:9' | '1:1',
          generate_audio: cmdOpts.audio,
          ...(cmdOpts.webhookUrl ? { webhook_url: cmdOpts.webhookUrl } : {}),
          ...(postIds.length > 0
            ? {
                postiz_integration_ids: postIds,
                caption_mode: captionAiOn ? 'ai' : 'static',
                ...(cmdOpts.caption ? { caption: cmdOpts.caption } : {}),
                ...(typeof cmdOpts.captionAi === 'string' && cmdOpts.captionAi.length > 0
                  ? { caption_guidance: cmdOpts.captionAi }
                  : {}),
              }
            : {}),
        });

        if (!cmdOpts.wait) {
          if (mode === 'json') printJson({ job_id: submit.job_id, status: submit.status, credits_deducted: submit.credits_deducted });
          else if (mode === 'quiet') printQuiet(submit.job_id);
          else {
            console.log(chalk.green(`✔ Submitted job ${submit.job_id} (${submit.credits_deducted} cr deducted).`));
            console.log(`  Poll with: ${chalk.cyan(`agent-media inspect ${submit.job_id}`)}`);
          }
          return;
        }

        const job = await pollUntilDone(api, submit.job_id, duration * 30, mode);
        if (job.status !== 'completed') {
          throw new CLIError(
            `Job ${job.status}: ${job.error_message ?? 'unknown error'}`,
            { code: 'GENERATION_FAILED' },
          );
        }
        const videoUrl = job.output_media_url;
        if (!videoUrl) {
          throw new CLIError(`Job completed without an output URL (id ${submit.job_id})`, { code: 'GENERATION_FAILED' });
        }
        if (mode === 'json') {
          printJson({
            job_id: submit.job_id,
            video_url: videoUrl,
            duration: submit.duration,
            aspect_ratio: submit.aspect_ratio,
          });
        } else if (mode === 'quiet') {
          printQuiet(videoUrl);
        } else {
          console.log(chalk.green(`\n✔ Done.`));
          console.log(`  ${chalk.cyan(videoUrl)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
