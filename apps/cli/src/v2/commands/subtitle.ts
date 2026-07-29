// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media subtitle` — burn styled subtitles onto a video.
 *
 *   agent-media subtitle --video https://… --style hormozi
 *   agent-media subtitle --video https://… --transcript "exact words" --style neon
 *
 * Pricing comes from V2_GENERATORS.subtitle.pricing — single source.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import {
  V2_GENERATORS,
  V2_SUBTITLE_STYLES,
} from '@agentmedia/schema/v2';
import { AgentMediaAPI } from '../../lib/api.js';
import { getApiKey, resolveProfileName } from '../../lib/credentials.js';
import { CLIError, handleError } from '../../lib/errors.js';
import { detectOutputMode, printJson, printQuiet } from '../../lib/output.js';
import { postJSON, pollWithFeedback, v2SubmitError } from '../lib.js';

interface SubmissionResponse {
  job_id: string;
  credits_deducted?: number;
}

interface JobFinal {
  status?: string;
  video_url?: string | null;
  result_url?: string | null;
  error_message?: string | null;
}

export function registerSubtitleCommand(program: Command): void {
  const def = V2_GENERATORS.subtitle;
  program
    .command(def.cli!.command)
    .summary(def.summary)
    .description(def.description)
    .requiredOption('--video <url>', 'Public URL of the source video (mp4/webm/mov).')
    .option(
      '--style <name>',
      `Subtitle style (one of: ${V2_SUBTITLE_STYLES.join(', ')})`,
      'hormozi',
    )
    .option(
      '--transcript <text|@file>',
      'Exact transcript to use (skips Whisper). Prefix with @ to read from a file.',
    )
    .option('--language <code>', 'ISO 639-1 language hint for Whisper (e.g. "en", "es").')
    .option('--profile <name>', 'Credentials profile.')
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      try {
        const globals = cmd.optsWithGlobals() as { json?: boolean; quiet?: boolean; profile?: string };
        const mode = detectOutputMode(globals);
        const profile = resolveProfileName(globals.profile);
        const apiKey = getApiKey(profile);
        if (!apiKey) {
          throw new CLIError('Not authenticated. Run `agent-media login` first.', {
            code: 'UNAUTHENTICATED',
          });
        }
        const api = new AgentMediaAPI(apiKey);

        const videoUrl = String(opts.video);
        const style = String(opts.style ?? 'hormozi');

        // Resolve transcript: literal or @file
        let transcript: string | undefined;
        if (typeof opts.transcript === 'string') {
          transcript = opts.transcript;
          if (transcript.startsWith('@')) {
            transcript = readFileSync(transcript.slice(1), 'utf-8').trim();
          }
        }

        // Pricing intentionally not surfaced.

        const body = {
          video_url: videoUrl,
          style,
          ...(transcript ? { transcript } : {}),
          ...(opts.language ? { language: opts.language } : {}),
        };
        const { status, data } = await postJSON(api, def.rest!.path, body);
        if (status !== 201) {
          throw v2SubmitError(status, data);
        }
        const submission = data as SubmissionResponse;

        if (mode === 'json') {
          printJson(submission);
        } else if (mode === 'quiet') {
          printQuiet(submission.job_id);
        } else {
          console.log(
            `${chalk.green('✓')} submitted ${chalk.bold(submission.job_id)}`,
          );
        }

        const final = (await pollWithFeedback(api, submission.job_id, {
          mode,
          label: 'Subtitling',
        })) as JobFinal;

        if (final.status === 'failed') {
          throw new CLIError(final.error_message ?? 'Subtitle failed', { code: 'JOB_FAILED' });
        }
        const url = final.video_url || final.result_url;
        if (mode === 'human') console.log(`${chalk.green('✓')} Subtitled video ready`);
        if (mode === 'json') {
          printJson(final);
        } else if (mode === 'quiet') {
          printQuiet(url ?? submission.job_id);
        } else {
          console.log(`${chalk.green('●')} ${chalk.bold(url ?? '(no url returned)')}`);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
