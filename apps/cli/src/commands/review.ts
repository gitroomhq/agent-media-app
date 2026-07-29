// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media saas-review --saas <name>` command.
 *
 * Generates a UGC-style SaaS review video. Builds a specialized script
 * prompt from the SaaS name, angle, talking points, and optional URL,
 * then delegates to the existing ugc-video pipeline with the saas-review
 * template.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { extname } from 'node:path';
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
  processing: chalk.blue,
  submitted: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

const VALID_ANGLES = ['honest', 'enthusiastic', 'roast', 'tutorial', 'comparison'] as const;

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

  const spinner = createSpinner('Producing SaaS review video...');
  if (mode === 'human') spinner.start();

  try {
    while (!interrupted) {
      const poll = await api.pollProvider(jobId);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const status = poll.status;

      if (mode === 'human') {
        const checkpoint = (poll as { checkpoint?: string }).checkpoint;
        const stagePart = checkpoint && checkpoint !== 'processing'
          ? `  ${chalk.dim(checkpoint.replace(/_/g, ' '))}`
          : '';
        spinner.text = `${formatStatus(status)}${stagePart}  elapsed ${formatElapsed(elapsed)}  (Ctrl+C to stop)`;
      }

      if (TERMINAL_STATUSES.has(status)) {
        const job = await api.getJob(jobId);

        if (mode === 'human') {
          if (status === 'completed') {
            spinner.succeed(
              `SaaS review video produced in ${formatElapsed(elapsed)}`,
            );
          } else if (status === 'failed') {
            spinner.fail(
              `Review job failed after ${formatElapsed(elapsed)}` +
                (job.error_message ? `: ${job.error_message}` : ''),
            );
          } else {
            spinner.warn(
              `Review job canceled after ${formatElapsed(elapsed)}`,
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

function buildScriptPrompt(opts: {
  saas: string;
  angle?: string;
  talkingPoints?: string;
  url?: string;
}): string {
  const parts: string[] = [
    `Write a SaaS review script for "${opts.saas}".`,
  ];

  if (opts.angle) {
    parts.push(`Angle/tone: ${opts.angle}`);
  } else {
    parts.push('Angle: honest review');
  }

  if (opts.talkingPoints) {
    parts.push(`Key points to cover: ${opts.talkingPoints}`);
  }

  if (opts.url) {
    parts.push(`Product URL for reference: ${opts.url}`);
  }

  return parts.join('\n');
}

function buildSaasReviewCommand(program: Command, commandName: 'saas-review' | 'review', deprecatedAlias = false): void {
  const command = deprecatedAlias
    ? program.command(commandName, { hidden: true })
    : program.command(commandName);

  command
    .description(
      'Generate a SaaS review video with an AI actor\n\n' +
      'Examples:\n' +
      `  $ agent-media ${commandName} --saas "Linear" --sync\n` +
      `  $ agent-media ${commandName} --saas "Cursor" --angle enthusiastic --actor sofia --sync\n` +
      `  $ agent-media ${commandName} --saas "Notion" --url https://notion.so --screenshots img1.png,img2.png --sync\n` +
      `  $ agent-media ${commandName} --saas "Jira" --angle roast --talking-points "slow, complex, expensive" --sync\n\n` +
      'Provide a SaaS product name and the AI generates a review script,\n' +
      'then produces a complete video with talking heads, B-roll, and subtitles.',
    )
    .requiredOption('--saas <name>', 'SaaS product name to review (required)')
    .option('--url <product-url>', 'Product URL for additional context')
    .option('--screenshots <urls>', 'Comma-separated screenshot URLs for B-roll walkthrough scenes')
    .option('--angle <type>', `Review angle: ${VALID_ANGLES.join(', ')} (default: honest)`)
    .option('--talking-points <text>', 'Key points the reviewer should mention (features, pros/cons, pricing)')
    .option('--actor <slug>', 'AI actor for talking heads (see `agent-media actor list`)')
    .option('--persona <slug>', 'Use a persona for voice + face (created via `agent-media persona create`)')
    .option('--voice <name>', 'TTS voice override (alloy, echo, fable, onyx, nova, shimmer)')
    .option('--style <name>', 'Subtitle style (default: hormozi). Options: hormozi, tiktok, minimal, clean, bold, impact, fire, pop, spotlight, aesthetic, pastel, glow, neon, electric, gradient, karaoke, boxed', 'hormozi')
    .option('-d, --duration <seconds>', 'Target video duration in seconds (5, 10, 15)', parseInt)
    .option('--aspect <ratio>', 'Aspect ratio: 9:16, 16:9, 1:1 (default: 9:16)', '9:16')
    .option('--music <genre>', 'Background music: chill, energetic, corporate, dramatic, upbeat')
    .option('--cta <text>', 'End screen call-to-action text (max 100 chars)')
    .option('--face-url <url>', 'Direct URL or local file path to a face photo')
    .option('--product-image <url>', 'Product image URL used as default B-roll reference')
    // --broll-model removed (Sprint 3: model abstraction). Backend auto-selects.
    .option('--voice-speed <n>', 'TTS speed multiplier (0.7–1.5, default: 1.0)', parseFloat)
    .option('-s, --sync', 'Wait for completion and print the output URL')
    .action(async (cmdOpts: {
      saas: string;
      url?: string;
      screenshots?: string;
      angle?: string;
      talkingPoints?: string;
      actor?: string;
      persona?: string;
      voice?: string;
      style: string;
      duration?: number;
      aspect: string;
      music?: string;
      cta?: string;
      faceUrl?: string;
      productImage?: string;
      brollModel?: string;
      voiceSpeed?: number;
      sync?: boolean;
    }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = getApiKey(profileName);

      if (deprecatedAlias && mode === 'human') {
        console.warn(chalk.yellow("  `agent-media review` is deprecated. Use `agent-media saas-review` instead."));
        console.warn();
      }

      if (!apiKey) {
        throw new CLIError('Not logged in.', {
          code: 'NOT_AUTHENTICATED',
          suggestion: "Run 'agent-media login' to authenticate.",
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        // ── Validate SaaS-specific inputs ──────────────────────────────
        if (cmdOpts.angle && !VALID_ANGLES.includes(cmdOpts.angle as typeof VALID_ANGLES[number])) {
          throw new CLIError(
            `Invalid angle '${cmdOpts.angle}'. Must be one of: ${VALID_ANGLES.join(', ')}`,
            { code: 'INVALID_INPUT' },
          );
        }

        // Parse screenshots
        let screenshotUrls: string[] | undefined;
        if (cmdOpts.screenshots) {
          screenshotUrls = cmdOpts.screenshots.split(',').map((u) => u.trim()).filter(Boolean);
          if (screenshotUrls.length === 0) {
            throw new CLIError('--screenshots must contain at least one URL', { code: 'INVALID_INPUT' });
          }
          for (const u of screenshotUrls) {
            if (!u.startsWith('http://') && !u.startsWith('https://')) {
              throw new CLIError(`Invalid screenshot URL: ${u}`, {
                code: 'INVALID_INPUT',
                suggestion: 'All screenshot URLs must be HTTP/HTTPS URLs.',
              });
            }
          }
        }

        // ── Build script prompt ────────────────────────────────────────
        const scriptPrompt = buildScriptPrompt({
          saas: cmdOpts.saas,
          angle: cmdOpts.angle,
          talkingPoints: cmdOpts.talkingPoints,
          url: cmdOpts.url,
        });

        if (mode === 'human') {
          console.log();
          console.log(`  ${chalk.bold('SaaS Review')} for ${chalk.cyan(cmdOpts.saas)}`);
          if (cmdOpts.angle) console.log(`  Angle:   ${chalk.cyan(cmdOpts.angle)}`);
          if (cmdOpts.url) console.log(`  URL:     ${chalk.cyan(cmdOpts.url)}`);
          if (cmdOpts.talkingPoints) console.log(`  Points:  ${chalk.cyan(cmdOpts.talkingPoints)}`);
          if (screenshotUrls) console.log(`  Screenshots: ${chalk.cyan(screenshotUrls.length + ' image(s)')}`);
          console.log();
        }

        // ── Build UGC params ───────────────────────────────────────────
        const ugcParams: import('../lib/api.js').UGCGenerateParams = {
          script: '',
          generate_script: true,
          script_prompt: scriptPrompt,
          template: 'saas-review',
          allow_broll: true,
          style: cmdOpts.style,
          aspect_ratio: cmdOpts.aspect as '9:16' | '16:9' | '1:1',
        };

        if (cmdOpts.url) ugcParams.product_url = cmdOpts.url;
        if (screenshotUrls) ugcParams.broll_images = screenshotUrls;

        // Duration defaults to 15 for reviews
        if (cmdOpts.duration) {
          const validDurations = [5, 10, 15];
          if (!validDurations.includes(cmdOpts.duration)) {
            throw new CLIError(
              `Invalid duration ${cmdOpts.duration}s. Must be one of: ${validDurations.join(', ')}`,
              { code: 'INVALID_INPUT' },
            );
          }
          ugcParams.target_duration = cmdOpts.duration;
        } else {
          ugcParams.target_duration = 15;
        }

        if (cmdOpts.voice) ugcParams.voice = cmdOpts.voice;

        if (cmdOpts.music) {
          const validGenres = ['chill', 'energetic', 'corporate', 'dramatic', 'upbeat'];
          if (!validGenres.includes(cmdOpts.music)) {
            throw new CLIError(
              `Invalid music genre '${cmdOpts.music}'. Must be one of: ${validGenres.join(', ')}`,
              { code: 'INVALID_INPUT' },
            );
          }
          ugcParams.music = cmdOpts.music;
        }

        if (cmdOpts.cta) {
          if (cmdOpts.cta.length > 100) {
            throw new CLIError(`CTA text too long (${cmdOpts.cta.length} chars). Maximum is 100 characters.`, { code: 'INVALID_INPUT' });
          }
          ugcParams.cta = cmdOpts.cta;
        }

        if (cmdOpts.persona) {
          ugcParams.persona_slug = cmdOpts.persona;
        }

        if (cmdOpts.actor) {
          if (cmdOpts.faceUrl) {
            throw new CLIError('--actor and --face-url are mutually exclusive.', { code: 'INVALID_INPUT' });
          }
          if (cmdOpts.persona) {
            throw new CLIError('--actor and --persona are mutually exclusive.', { code: 'INVALID_INPUT' });
          }
          ugcParams.actor_slug = cmdOpts.actor;
        }

        if (cmdOpts.productImage) {
          if (!cmdOpts.productImage.startsWith('http://') && !cmdOpts.productImage.startsWith('https://')) {
            throw new CLIError(`--product-image must be an HTTP/HTTPS URL.`, { code: 'INVALID_INPUT' });
          }
          ugcParams.product_image_url = cmdOpts.productImage;
        }

        // broll_model removed — backend auto-selects the best model

        if (cmdOpts.voiceSpeed != null) {
          if (cmdOpts.voiceSpeed < 0.7 || cmdOpts.voiceSpeed > 1.5) {
            throw new CLIError(`Invalid voice-speed ${cmdOpts.voiceSpeed}. Must be between 0.7 and 1.5`, { code: 'INVALID_INPUT' });
          }
          ugcParams.voice_speed = cmdOpts.voiceSpeed;
        }

        if (cmdOpts.faceUrl) {
          let faceUrl = cmdOpts.faceUrl;
          if (!faceUrl.startsWith('http://') && !faceUrl.startsWith('https://')) {
            if (!existsSync(faceUrl)) {
              throw new CLIError(`Face photo file not found: ${faceUrl}`, { code: 'INVALID_INPUT' });
            }
            if (mode === 'human') {
              console.log(`  Uploading face photo: ${chalk.cyan(faceUrl)}...`);
            }
            const fileBuffer = readFileSync(faceUrl);
            const ext = extname(faceUrl).toLowerCase();
            const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
            const filename = `face-photo${ext || '.png'}`;
            const uploadInfo = await api.getUploadUrl(filename, contentType);
            await api.uploadFile(uploadInfo.upload_url, fileBuffer.buffer as ArrayBuffer, contentType);
            faceUrl = `${api.baseUrl}/storage/v1/object/public/generation-inputs/${uploadInfo.storage_path}`;
          }
          ugcParams.face_photo_url = faceUrl;
        }

        // ── Submit ──────────────────────────────────────────────────────
        const submitSpinner = createSpinner('Submitting SaaS review job...');
        if (mode === 'human') submitSpinner.start();

        const result = await api.ugcGenerate(ugcParams);

        if (mode === 'human') submitSpinner.succeed('SaaS review job submitted');

        if (result.voice_auto_detected && result.selected_voice && mode === 'human') {
          console.log(`  ${chalk.dim('Voice auto-detected:')} ${chalk.cyan(result.selected_voice)}`);
        }

        if (result.generated_script && mode === 'human') {
          console.log();
          console.log(`  ${chalk.yellow('Generated SaaS Review Script:')}`);
          console.log(`  ${chalk.dim('─'.repeat(60))}`);
          for (const line of result.generated_script.split('\n')) {
            console.log(`  ${line}`);
          }
          console.log(`  ${chalk.dim('─'.repeat(60))}`);
          console.log();
        }

        const shouldWait = !!cmdOpts.sync;

        if (!shouldWait) {
          switch (mode) {
            case 'json':
              printJson({
                job_id: result.job_id,
                status: result.status,
                estimated_duration: result.estimated_duration,
                credits_deducted: result.credits_deducted,
              });
              break;

            case 'quiet':
              printQuiet(result.job_id);
              break;

            default:
              console.log();
              console.log(`  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`);
              console.log(`  ${chalk.bold('Status:')}     ${chalk.yellow(result.status)}`);
              console.log(`  ${chalk.bold('Duration:')}   ~${result.estimated_duration}s estimated`);
              console.log(`  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`);
              console.log();
              console.log(chalk.dim(`  Run 'agent-media status ${result.job_id}' to check progress`));
              console.log(chalk.dim(`  Or use --sync to wait for completion`));
              console.log();
              break;
          }
          return;
        }

        // ── Wait for completion (--sync) ────────────────────────────────
        if (mode === 'human') {
          console.log();
          console.log(`  ${chalk.bold('Job ID:')}     ${chalk.cyan(result.job_id)}`);
          console.log(`  ${chalk.bold('Duration:')}   ~${result.estimated_duration}s estimated`);
          console.log(`  ${chalk.bold('Credits:')}    ${result.credits_deducted} deducted`);
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
          console.log(`  ${chalk.bold('URL:')}  ${chalk.cyan(finishedJob.output_media_url)}`);
          console.log();
        } else if (finishedJob.status !== 'completed') {
          console.log();
          console.log(chalk.yellow('  No output -- SaaS review job did not complete successfully.'));
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}

export function registerSaasReviewCommand(program: Command): void {
  // Both saas-review and the legacy `review` alias are HIDDEN from --help
  // in v1.13.x — the v2 surface replaces them. They remain callable for
  // any old script that still references them, but agents reading --help
  // only see the v2 commands.
  buildSaasReviewCommand(program, 'saas-review', true);
  buildSaasReviewCommand(program, 'review', true);
}
