// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media character` — manage saved v2 characters.
 *
 * Subcommands:
 *   create   — generate portrait + sheet, pin seed, persist row, return char_xxxxxxxxxx
 *   list     — list the user's active characters (TBD; deferred until /v2/characters GET lands)
 *   show     — print details for a single character (TBD)
 *   delete   — archive a character (TBD)
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { V2_GENERATORS, V2_SHOT_PRESETS } from '@agentmedia/schema/v2';
import { AgentMediaAPI } from '../../lib/api.js';
import { getApiKey, resolveProfileName } from '../../lib/credentials.js';
import { CLIError, handleError, contentPolicySuggestion } from '../../lib/errors.js';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../../lib/output.js';
import { resolvePhotoOrUrl, postJSON, pollWithFeedback, v2SubmitError } from '../lib.js';

interface SubmissionResponse {
  job_id: string;
  credits_deducted?: number;
}

interface JobFinal {
  status?: string;
  character_id?: string | null;
  error_message?: string | null;
}

export function registerCharacterCommand(program: Command): void {
  const root = program.command('character').description('Manage saved v2 characters.');

  // ── create ───────────────────────────────────────────────────────────
  const def = V2_GENERATORS.character_create;
  root
    .command('create')
    .summary(def.summary)
    .description(def.description)
    .requiredOption('--name <text>', 'Display name (letters, digits, space, _, -).')
    .requiredOption('--description <text>', 'Character description (8-400 chars). agent-media generates the portrait from this.')
    .option('--photo <file|url>', 'Optional reference photo for an exact real-person likeness.')
    .option('--voice-brief <text>', 'One-line voice direction.')
    .option('--preset <name>', `Default shot preset (one of: ${V2_SHOT_PRESETS.join(', ')})`)
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

        // Pricing intentionally not surfaced.

        // Optional photo upload — only when user opted in for exact-likeness mode
        const photo = typeof opts.photo === 'string' ? opts.photo : undefined;
        let photoUrl: string | undefined;
        if (photo) {
          const upload = createSpinner('Uploading photo…');
          if (mode === 'human') upload.start();
          try {
            photoUrl = await resolvePhotoOrUrl(api, photo);
          } finally {
            if (mode === 'human') upload.succeed('Photo ready');
          }
        }

        // Submit
        const { status, data } = await postJSON(api, def.rest!.path, {
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          display_name: opts.name,
          description: opts.description,
          ...(opts.voiceBrief ? { voice_brief: opts.voiceBrief } : {}),
          ...(opts.preset ? { preset_default: opts.preset } : {}),
        });
        if (status !== 201) {
          throw v2SubmitError(status, data);
        }
        const submission = data as SubmissionResponse;

        // Surface the job id immediately — BEFORE the multi-minute poll — so a
        // Ctrl-C / disconnect never leaves the paid job unidentifiable.
        if (mode === 'human') {
          console.log(chalk.dim(`Job ${submission.job_id} submitted — generating…`));
        } else {
          process.stderr.write(`job ${submission.job_id} submitted\n`);
        }

        const final = (await pollWithFeedback(api, submission.job_id, {
          mode,
          label: 'Generating portrait + sheet',
        })) as JobFinal;

        if (final.status === 'failed') {
          throw new CLIError(final.error_message ?? 'Character creation failed', {
            code: 'JOB_FAILED',
            suggestion: contentPolicySuggestion(final.error_message),
          });
        }
        if (mode === 'human') console.log(`${chalk.green('✓')} Character created`);

        const charId = final.character_id ?? null;
        if (mode === 'json') {
          printJson({
            character_id: charId,
            credits_deducted: submission.credits_deducted,
            ...final,
          });
        } else if (mode === 'quiet') {
          printQuiet(charId ?? submission.job_id);
        } else {
          console.log(`${chalk.green('●')} ${chalk.bold(charId ?? '(missing id)')}`);
          if (charId) {
            console.log(chalk.dim(`Pass --character ${charId} to any v2 video command.`));
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  // ── list / show / delete — deferred until /v2/characters GET lands ───
  // Stubs that explain status, so users get a clear "not yet" instead
  // of a silent missing command.
  root
    .command('list')
    .description('List your saved v2 characters.')
    .option('--profile <name>', 'Credentials profile.')
    .action(async (opts: { profile?: string; json?: boolean; quiet?: boolean }, cmd: Command) => {
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

        // GET /v2/characters
        const resp = await fetch(`${api.baseUrl}/v2/characters`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!resp.ok) {
          throw new CLIError(`Failed to list characters (HTTP ${resp.status})`, {
            code: 'LIST_FAILED',
          });
        }
        const body = await resp.json() as {
          characters: Array<{
            character_id: string;
            display_name: string;
            description: string;
            portrait_url: string | null;
            voice_brief: string | null;
            preset_default: string | null;
            created_at: string;
          }>;
        };

        if (mode === 'json') {
          printJson(body);
          return;
        }
        if (mode === 'quiet') {
          for (const c of body.characters) printQuiet(c.character_id);
          return;
        }

        if (!body.characters.length) {
          console.log(chalk.dim('No saved characters yet. Use `agent-media character create` to make one.'));
          return;
        }

        for (const c of body.characters) {
          const age = relativeAge(c.created_at);
          console.log(
            `${chalk.green('●')} ${chalk.bold(c.character_id)}  ${chalk.cyan(c.display_name)}  ${chalk.dim(age)}`,
          );
          console.log(`  ${chalk.dim(c.description.slice(0, 96))}${c.description.length > 96 ? '…' : ''}`);
          if (c.voice_brief) console.log(`  ${chalk.dim('voice: ')}${chalk.dim(c.voice_brief.slice(0, 64))}`);
        }
        console.log(chalk.dim(`\n${body.characters.length} character${body.characters.length === 1 ? '' : 's'}. Use --character <id> on selfie to reuse.`));
      } catch (err) {
        handleError(err);
      }
    });

  root
    .command('show')
    .description('Show details for a saved v2 character.')
    .argument('<character_id>', 'char_XXXXXXXXXX')
    .option('--profile <name>', 'Credentials profile.')
    .action(async (characterId: string, _opts: { profile?: string }, cmd: Command) => {
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

        // No GET /v2/characters/:id endpoint exists yet — filter the list response.
        const resp = await fetch(`${api.baseUrl}/v2/characters`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!resp.ok) {
          throw new CLIError(`Failed to fetch characters (HTTP ${resp.status})`, {
            code: 'LIST_FAILED',
          });
        }
        const body = (await resp.json()) as {
          characters: Array<{
            character_id: string;
            display_name: string;
            description: string;
            portrait_url: string | null;
            voice_brief: string | null;
            preset_default: string | null;
            created_at: string;
          }>;
        };
        const match = body.characters.find((c) => c.character_id === characterId);
        if (!match) {
          throw new CLIError(`No saved character with id ${characterId}.`, {
            code: 'CHARACTER_NOT_FOUND',
            suggestion: 'Run `agent-media character list` to see your saved characters.',
          });
        }

        if (mode === 'json') {
          printJson(match);
          return;
        }
        if (mode === 'quiet') {
          printQuiet(match.character_id);
          return;
        }
        console.log(
          `${chalk.green('●')} ${chalk.bold(match.character_id)}  ${chalk.cyan(match.display_name)}  ${chalk.dim(relativeAge(match.created_at))}`,
        );
        console.log(`  ${chalk.dim('description: ')}${match.description}`);
        if (match.voice_brief) console.log(`  ${chalk.dim('voice:       ')}${match.voice_brief}`);
        if (match.preset_default) console.log(`  ${chalk.dim('preset:      ')}${match.preset_default}`);
        console.log(`  ${chalk.dim('portrait:    ')}${match.portrait_url ?? chalk.yellow('(none)')}`);
        console.log(chalk.dim(`\nUse --character ${match.character_id} on a selfie/video command to reuse.`));
      } catch (err) {
        handleError(err);
      }
    });

  root
    .command('delete')
    .description('Archive a saved v2 character.')
    .argument('<character_id>', 'char_XXXXXXXXXX')
    .action(() => {
      console.error(chalk.yellow('Not implemented yet — coming with `character list`.'));
      process.exit(2);
    });
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
