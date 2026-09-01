// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media crazy-look` — generate a v2 Crazy Look clip.
 *
 * Silent extreme close-up reaction video with a static caption overlay.
 * The volume workflow: a saved character (--character) keeps the same
 * face across a whole posting series; omit --look and every call picks
 * a different random expression for the same caption.
 *
 * Two character paths (same contract as `selfie`):
 *   - saved character: --character char_xxxxxxxxxx
 *   - inline character: --description "..." (+ optional --photo)
 *
 * Cost / pricing comes from V2_GENERATORS.crazy_look.pricing — single source.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import {
  V2_GENERATORS,
  V2_LOOK_PRESETS,
  V2_POLISH_INTENSITIES,
  V2_VIDEO_ENGINES,
  V2_DEFAULT_ENGINE,
} from '@agentmedia/schema/v2';
import { AgentMediaAPI } from '../../lib/api.js';
import { getApiKey, resolveProfileName } from '../../lib/credentials.js';
import { CLIError, handleError, contentPolicySuggestion } from '../../lib/errors.js';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../../lib/output.js';
import { resolvePhotoOrUrl, postJSON, pollWithFeedback, v2SubmitError } from '../lib.js';

interface SubmissionResponse {
  job_id: string;
  status?: string;
  credits_deducted?: number;
}

interface JobFinal {
  status?: string;
  video_url?: string | null;
  result_url?: string | null;
  error_message?: string | null;
}

interface CrazyLookCommandOptions {
  character?: string;
  description?: string;
  photo?: string;
  caption?: string;
  look?: string;
  duration?: number;
  polish?: string;
  engine?: string;
}

export function registerCrazyLookCommand(program: Command): void {
  const def = V2_GENERATORS.crazy_look;
  program
    .command(def.cli!.command)
    .summary(def.summary)
    .description(def.description)
    .option('--character <id>', 'Saved character id (char_XXXXXXXXXX). Use this OR --description. Recommended — same face across the whole series.')
    .option('--description <text>', 'Character description. agent-media generates the person from this text — no photo required.')
    .option('--photo <file|url>', 'Optional reference photo for an exact-likeness person. Combine with --description.')
    .option('--caption <text>', 'The hook text burned over the full clip (REQUIRED). Use "\\n" for explicit line breaks. Deliberate typos welcome.')
    .option(
      '--look <preset>',
      `Expression (one of: ${V2_LOOK_PRESETS.join(', ')}, or "custom:<text>"). Omit for a random preset per call — the volume workflow.`,
      (v: string) => {
        if ((V2_LOOK_PRESETS as readonly string[]).includes(v) || v.startsWith('custom:')) return v;
        throw new CLIError(
          `--look must be one of: ${V2_LOOK_PRESETS.join(', ')}, or "custom:<text>"`,
          { code: 'INVALID_LOOK' },
        );
      },
    )
    .option('--duration <seconds>', 'Clip duration: 5 | 10', (v: string) => {
      const n = Number(v);
      if (![5, 10].includes(n)) {
        throw new CLIError(`--duration must be 5 or 10 (got ${v})`, { code: 'INVALID_DURATION' });
      }
      return n;
    }, 5)
    .option(
      '--polish <intensity>',
      `Post-Seedance polish pass intensity (one of: ${V2_POLISH_INTENSITIES.join(', ')}). Default "default" — the lo-fi grain is load-bearing for this format. Set "off" to bypass.`,
      (v: string) => {
        if ((V2_POLISH_INTENSITIES as readonly string[]).includes(v)) return v;
        throw new CLIError(
          `--polish must be one of: ${V2_POLISH_INTENSITIES.join(', ')}`,
          { code: 'INVALID_POLISH' },
        );
      },
    )
    .option(
      '--engine <name>',
      `Video engine (one of: ${V2_VIDEO_ENGINES.join(', ')}). Default "${V2_DEFAULT_ENGINE}". seedance-2.5 is the newer, sharper model and a premium tier — pass it only when you want the best possible quality.`,
      (v: string) => {
        if ((V2_VIDEO_ENGINES as readonly string[]).includes(v)) return v;
        throw new CLIError(
          `--engine must be one of: ${V2_VIDEO_ENGINES.join(', ')}`,
          { code: 'INVALID_ENGINE' },
        );
      },
    )
    .option('--profile <name>', 'Credentials profile.')
    .action(async (opts: CrazyLookCommandOptions, cmd: Command) => {
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

        // Validation. Three valid input shapes (same as `selfie`):
        //   1. --character <char_id>            (reuse saved character)
        //   2. --description "..."              (text-only)
        //   3. --description "..." + --photo X  (exact-likeness reference)
        const character = typeof opts.character === 'string' ? opts.character : undefined;
        const photo = typeof opts.photo === 'string' ? opts.photo : undefined;
        const description = typeof opts.description === 'string' ? opts.description : undefined;
        const hasCharacter = !!character;
        const hasDescription = !!description;
        if (!hasCharacter && !hasDescription) {
          throw new CLIError(
            'Provide either --character <id>, OR --description (with optional --photo).',
            { code: 'MISSING_CHARACTER_INPUT' },
          );
        }
        if (hasCharacter && (photo || description)) {
          throw new CLIError(
            'Use --character OR --description (+ optional --photo), not both.',
            { code: 'AMBIGUOUS_CHARACTER_INPUT' },
          );
        }
        if (photo && !description) {
          throw new CLIError(
            '--photo requires --description so we know what to emphasize.',
            { code: 'PHOTO_WITHOUT_DESCRIPTION' },
          );
        }

        const caption = typeof opts.caption === 'string' ? opts.caption.replace(/\\n/g, '\n') : undefined;
        if (!caption || !caption.trim()) {
          throw new CLIError(
            'Provide --caption — the hook text IS the content of a crazy-look clip.',
            { code: 'MISSING_CAPTION' },
          );
        }

        // Resolve photo if user opted in (optional)
        let photoUrl: string | undefined;
        if (photo) {
          const spin = createSpinner('Uploading photo…');
          if (mode === 'human') spin.start();
          try {
            photoUrl = await resolvePhotoOrUrl(api, photo);
          } finally {
            if (mode === 'human') spin.succeed('Photo ready');
          }
        }

        const duration = typeof opts.duration === 'number' ? opts.duration : 5;
        const look = typeof opts.look === 'string' ? opts.look : undefined;
        const polish = typeof opts.polish === 'string' ? opts.polish : undefined;
        const engine = typeof opts.engine === 'string' ? opts.engine : undefined;

        // Submit
        const body = {
          ...(hasCharacter ? { character_id: character } : {}),
          ...(hasDescription ? { description } : {}),
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          caption,
          ...(look !== undefined ? { look } : {}),
          duration,
          ...(polish !== undefined ? { polish } : {}),
          ...(engine !== undefined ? { engine } : {}),
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

        // Poll until done — visible elapsed/heartbeat + Ctrl-C detach.
        const final = (await pollWithFeedback(api, submission.job_id, {
          mode,
          label: 'Generating',
        })) as JobFinal;

        if (final.status === 'failed') {
          throw new CLIError(final.error_message ?? 'Generation failed', {
            code: 'JOB_FAILED',
            suggestion: contentPolicySuggestion(final.error_message),
          });
        }
        const url = final.video_url || final.result_url;
        if (mode === 'human') console.log(`${chalk.green('✓')} Video ready`);
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
