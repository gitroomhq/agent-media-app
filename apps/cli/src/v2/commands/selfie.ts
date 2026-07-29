// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media selfie` — generate a v2 Selfie video.
 *
 * Two character paths:
 *   - saved character: --character char_xxxxxxxxxx
 *   - inline character: --photo <file|url> --description "..."
 *
 * Cost / pricing comes from V2_GENERATORS.selfie.pricing — single source.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import {
  V2_GENERATORS,
  V2_SHOT_PRESETS,
  V2_VIBES,
  V2_PHONE_IN_FRAME,
  V2_POLISH_INTENSITIES,
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

interface SelfieCommandOptions {
  character?: string;
  description?: string;
  photo?: string;
  script?: string;
  sceneAction?: string;
  backgroundMusic?: string | boolean;
  duration?: number;
  subtitles?: boolean;
  shotPreset?: string;
  vibe?: string;
  cameraLocked?: boolean;
  cameraHandheld?: boolean;
  phoneInFrame?: string;
  polish?: string;
}

export function registerSelfieCommand(program: Command): void {
  const def = V2_GENERATORS.selfie;
  program
    .command(def.cli!.command)
    .summary(def.summary)
    .description(def.description)
    .option('--character <id>', 'Saved character id (char_XXXXXXXXXX). Use this OR --description.')
    .option('--description <text>', 'Character description. agent-media generates the person from this text — no photo required.')
    .option('--photo <file|url>', 'Optional reference photo for an exact-likeness person. Combine with --description.')
    .option('--script <text|@file>', 'What the character says. Prefix with @ to read from a file. Optional — pair with --scene-action for non-speech clips.')
    .option('--scene-action <text>', 'What the character is DOING (overrides the default "talking to camera" template). e.g. "dancing freestyle to upbeat music".')
    .option('--background-music [text]', 'Add background music. Pass a string for direction ("lo-fi jazz") or use the flag alone for the default ("soft upbeat music, no dialogue").')
    .option('--duration <seconds>', 'Clip duration: 5 | 10 | 15', (v: string) => {
      const n = Number(v);
      if (![5, 10, 15].includes(n)) {
        throw new CLIError(`--duration must be 5, 10, or 15 (got ${v})`, { code: 'INVALID_DURATION' });
      }
      return n;
    }, 10)
    .option('--subtitles <bool>', 'Burn Hormozi-style subs', (v: string) => v !== 'false', true)
    // ── Realism opt-in controls (Phase 1 of realism cascade fix) ──────
    .option(
      '--shot-preset <preset>',
      `Pin the scene composition (one of: ${V2_SHOT_PRESETS.join(', ')}, or "custom-scene:<text>"). Optional — orchestrator picks based on script when omitted.`,
      (v: string) => {
        if ((V2_SHOT_PRESETS as readonly string[]).includes(v) || v.startsWith('custom-scene:')) return v;
        throw new CLIError(
          `--shot-preset must be one of: ${V2_SHOT_PRESETS.join(', ')}, or "custom-scene:<text>"`,
          { code: 'INVALID_SHOT_PRESET' },
        );
      },
    )
    .option(
      '--vibe <vibe>',
      `Energy / tone of the actor (one of: ${V2_VIBES.join(', ')}). Optional — defaults to "excited".`,
      (v: string) => {
        if ((V2_VIBES as readonly string[]).includes(v)) return v;
        throw new CLIError(
          `--vibe must be one of: ${V2_VIBES.join(', ')}`,
          { code: 'INVALID_VIBE' },
        );
      },
    )
    .option(
      '--camera-locked',
      'Deprecated compatibility flag. Locked camera is already the default; use --camera-handheld to opt in to motion.',
    )
    .option(
      '--camera-handheld',
      'Enable handheld camera movement (sets camera_locked=false). Default remains locked when this flag is omitted.',
    )
    .option(
      '--phone-in-frame <mode>',
      `Phone-in-frame composition (one of: ${V2_PHONE_IN_FRAME.join(', ')}). Default "forbidden" — no phone/selfie-stick unless explicitly requested.`,
      (v: string) => {
        if ((V2_PHONE_IN_FRAME as readonly string[]).includes(v)) return v;
        throw new CLIError(
          `--phone-in-frame must be one of: ${V2_PHONE_IN_FRAME.join(', ')}`,
          { code: 'INVALID_PHONE_IN_FRAME' },
        );
      },
    )
    .option(
      '--polish <intensity>',
      `Post-Seedance polish pass intensity (one of: ${V2_POLISH_INTENSITIES.join(', ')}). Default "default" — adds subtle grain + warm grade + vignette to flip output from AI-clean to iPhone-real. Set "off" to bypass.`,
      (v: string) => {
        if ((V2_POLISH_INTENSITIES as readonly string[]).includes(v)) return v;
        throw new CLIError(
          `--polish must be one of: ${V2_POLISH_INTENSITIES.join(', ')}`,
          { code: 'INVALID_POLISH' },
        );
      },
    )
    .option('--profile <name>', 'Credentials profile.')
    .action(async (opts: SelfieCommandOptions, cmd: Command) => {
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

        // Validation. Three valid input shapes:
        //   1. --character <char_id>            (reuse saved character)
        //   2. --description "..."              (text-only — agent-media generates the portrait)
        //   3. --description "..." + --photo X  (exact-likeness reference)
        const character = typeof opts.character === 'string' ? opts.character : undefined;
        const photo = typeof opts.photo === 'string' ? opts.photo : undefined;
        const description = typeof opts.description === 'string' ? opts.description : undefined;
        const hasCharacter = !!character;
        const hasDescription = !!description;
        const hasInline = hasDescription; // description is sufficient; photo is bonus
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

        // Resolve script: literal, @file, or empty (when scene_action is given).
        let script: string | undefined = typeof opts.script === 'string' ? opts.script : undefined;
        if (script && script.startsWith('@')) {
          script = readFileSync(script.slice(1), 'utf-8').trim();
        }
        const sceneAction = typeof opts.sceneAction === 'string' ? opts.sceneAction : undefined;
        const backgroundMusic =
          typeof opts.backgroundMusic === 'string' ? opts.backgroundMusic :
          opts.backgroundMusic === true ? true : undefined;
        if (!script && !sceneAction) {
          throw new CLIError(
            'Provide either --script (what she says) or --scene-action (what she does).',
            { code: 'MISSING_SCRIPT_OR_SCENE' },
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

        const duration = typeof opts.duration === 'number' ? opts.duration : 10;
        // Pricing is intentionally not surfaced to the CLI user. The API
        // debits internally and allows a small overdraft so generations
        // never get blocked on a micro-balance edge.

        // Pull realism-control opts. Each is optional; only forwarded
        // when explicitly set by the caller.
        const shotPreset = typeof opts.shotPreset === 'string' ? opts.shotPreset : undefined;
        const vibe = typeof opts.vibe === 'string' ? opts.vibe : undefined;
        if (opts.cameraLocked === true && opts.cameraHandheld === true) {
          throw new CLIError('Use only one of --camera-locked or --camera-handheld.', {
            code: 'AMBIGUOUS_CAMERA_MODE',
          });
        }
        const cameraLocked = opts.cameraHandheld === true ? false : undefined;
        if (opts.cameraLocked === true && mode === 'human') {
          console.log(
            `${chalk.yellow('!')} --camera-locked is deprecated and now a no-op (locked is already the default).`,
          );
        }
        const phoneInFrame = typeof opts.phoneInFrame === 'string' ? opts.phoneInFrame : undefined;
        const polish = typeof opts.polish === 'string' ? opts.polish : undefined;

        // Submit
        const body = {
          ...(hasCharacter ? { character_id: character } : {}),
          ...(hasDescription ? { description } : {}),
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          ...(script ? { script } : {}),
          ...(sceneAction ? { scene_action: sceneAction } : {}),
          ...(backgroundMusic !== undefined ? { background_music: backgroundMusic } : {}),
          duration,
          subtitles: opts.subtitles,
          ...(shotPreset !== undefined ? { shot_preset: shotPreset } : {}),
          ...(vibe !== undefined ? { vibe } : {}),
          ...(cameraLocked !== undefined ? { camera_locked: cameraLocked } : {}),
          ...(phoneInFrame !== undefined ? { phone_in_frame: phoneInFrame } : {}),
          ...(polish !== undefined ? { polish } : {}),
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
