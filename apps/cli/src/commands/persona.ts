// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media persona` command group.
 *
 * Manages user personas (voice + face combinations for UGC videos).
 *
 * Subcommands:
 *   list   — List all personas
 *   create — Create a new persona from voice sample + face photo
 *   delete — Delete a persona and its cloned voice
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
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

const VALID_VOICE_EXTENSIONS = new Set(['.mp3', '.wav']);
const VALID_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

export function registerPersonaCommand(program: Command): void {
  const persona = program
    .command('persona')
    .description('Manage personas (voice + face for UGC videos)');

  // ── persona list ──────────────────────────────────────────────────────

  persona
    .command('list')
    .description('List all your personas')
    .action(async () => {
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

      try {
        const api = new AgentMediaAPI(apiKey);
        const spinner = createSpinner('Fetching personas...');
        if (mode === 'human') spinner.start();

        const result = await api.listPersonas();

        if (mode === 'human') spinner.succeed(`Found ${result.personas.length} persona(s)`);

        if (mode === 'json') {
          printJson(result);
          return;
        }

        if (mode === 'quiet') {
          for (const p of result.personas) {
            printQuiet(p.slug);
          }
          return;
        }

        if (result.personas.length === 0) {
          console.log();
          console.log(chalk.dim('  No personas yet. Create one with:'));
          console.log(chalk.dim('  agent-media persona create "My Persona" --voice ./voice.mp3 --face ./photo.jpg'));
          console.log();
          return;
        }

        console.log();
        for (const p of result.personas) {
          const defaultBadge = p.is_default ? chalk.green(' [default]') : '';
          const voiceStatus = p.voice_clone_status === 'ready'
            ? chalk.green('ready')
            : p.voice_clone_status === 'pending'
              ? chalk.yellow('pending')
              : chalk.red(p.voice_clone_status);

          console.log(`  ${chalk.bold(p.name)}${defaultBadge}  ${chalk.dim(`(${p.slug})`)}`);
          console.log(`    Voice: ${voiceStatus}  ${chalk.dim(p.voice_id ? `id:${p.voice_id.substring(0, 12)}...` : 'none')}`);
          console.log(`    Created: ${chalk.dim(new Date(p.created_at).toLocaleDateString())}`);
          console.log();
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── persona create ────────────────────────────────────────────────────

  persona
    .command('create <name>')
    .description(
      'Create a new persona from a voice sample and face photo\n\n' +
      'Examples:\n' +
      '  $ agent-media persona create "Alex" --voice ./voice.mp3 --face ./photo.jpg\n' +
      '  $ agent-media persona create "Sarah" --voice ~/recordings/sarah.wav --face ~/photos/sarah.png',
    )
    .requiredOption('--voice <file>', 'Path to voice sample (MP3 or WAV, 1-2 min)')
    .requiredOption('--face <file>', 'Path to face photo (JPG, PNG, or WebP, min 512x512)')
    .action(async (name: string, cmdOpts: { voice: string; face: string }) => {
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

      try {
        // Validate voice file
        const voicePath = cmdOpts.voice;
        if (!existsSync(voicePath)) {
          throw new CLIError(`Voice file not found: ${voicePath}`, {
            code: 'FILE_NOT_FOUND',
            suggestion: 'Check the file path and try again.',
          });
        }

        const voiceExt = extname(voicePath).toLowerCase();
        if (!VALID_VOICE_EXTENSIONS.has(voiceExt)) {
          throw new CLIError(`Invalid voice file type '${voiceExt}'. Use MP3 or WAV.`, {
            code: 'INVALID_INPUT',
            suggestion: 'Provide an MP3 or WAV file (1-2 minutes of speech).',
          });
        }

        // Validate face file
        const facePath = cmdOpts.face;
        if (!existsSync(facePath)) {
          throw new CLIError(`Face photo not found: ${facePath}`, {
            code: 'FILE_NOT_FOUND',
            suggestion: 'Check the file path and try again.',
          });
        }

        const faceExt = extname(facePath).toLowerCase();
        if (!VALID_IMAGE_EXTENSIONS.has(faceExt)) {
          throw new CLIError(`Invalid face photo type '${faceExt}'. Use JPG, PNG, or WebP.`, {
            code: 'INVALID_INPUT',
            suggestion: 'Provide a JPG, PNG, or WebP image (min 512x512).',
          });
        }

        // Read files
        const voiceBuffer = readFileSync(voicePath);
        const faceBuffer = readFileSync(facePath);

        if (mode === 'human') {
          console.log(`  Voice: ${chalk.cyan(basename(voicePath))} (${(voiceBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
          console.log(`  Face:  ${chalk.cyan(basename(facePath))} (${(faceBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
        }

        const api = new AgentMediaAPI(apiKey);
        const spinner = createSpinner('Creating persona (cloning voice)...');
        if (mode === 'human') spinner.start();

        const result = await api.createPersona({
          name,
          voiceSample: voiceBuffer,
          voiceFileName: basename(voicePath),
          voiceMimeType: getMimeType(voicePath),
          facePhoto: faceBuffer,
          faceFileName: basename(facePath),
          faceMimeType: getMimeType(facePath),
        });

        if (mode === 'human') {
          if (result.voice_clone_status === 'ready') {
            spinner.succeed(`Persona "${result.name}" created with cloned voice`);
          } else {
            spinner.warn(`Persona "${result.name}" created (voice clone ${result.voice_clone_status})`);
          }
        }

        if (mode === 'json') {
          printJson(result);
          return;
        }

        if (mode === 'quiet') {
          printQuiet(result.slug);
          return;
        }

        console.log();
        console.log(`  ${chalk.bold('Persona:')}  ${chalk.cyan(result.name)} (${result.slug})`);
        console.log(`  ${chalk.bold('Voice:')}    ${result.voice_clone_status === 'ready' ? chalk.green('cloned') : chalk.yellow(result.voice_clone_status)}`);
        console.log(`  ${chalk.bold('ID:')}       ${chalk.dim(result.persona_id)}`);
        console.log();
        console.log(chalk.dim(`  Use with: agent-media ugc "your script" --persona ${result.slug} --sync`));
        console.log();
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── persona delete ────────────────────────────────────────────────────

  persona
    .command('delete <slug-or-id>')
    .description('Delete a persona and its cloned voice')
    .action(async (slugOrId: string) => {
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

      try {
        const api = new AgentMediaAPI(apiKey);
        const spinner = createSpinner('Deleting persona...');
        if (mode === 'human') spinner.start();

        // Determine if it's a UUID or a slug
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
        const result = await api.deletePersona(
          isUUID ? { persona_id: slugOrId } : { slug: slugOrId },
        );

        if (mode === 'human') {
          const voiceNote = result.voice_deleted ? ' (voice removed)' : '';
          spinner.succeed(`Persona deleted${voiceNote}`);
        }

        if (mode === 'json') {
          printJson(result);
          return;
        }

        if (mode === 'quiet') {
          printQuiet(result.persona_id);
          return;
        }

        console.log();
        console.log(`  ${chalk.bold('Deleted:')}       ${chalk.dim(result.persona_id)}`);
        console.log(`  ${chalk.bold('Voice removed:')} ${result.voice_deleted ? chalk.green('yes') : chalk.yellow('no')}`);
        console.log();
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
