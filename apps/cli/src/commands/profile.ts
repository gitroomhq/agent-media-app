// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media profile` command group.
 *
 * Manages credential profiles for multi-account usage.
 * Subcommands: list, switch, delete, current.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet, printTable } from '../lib/output.js';
import {
  loadCredentials,
  saveCredentials,
  resolveProfileName,
  getProfile,
  deleteProfile as removeProfile,
  listProfiles,
  type CredentialProfile,
} from '../lib/credentials.js';
import { CLIError, handleError } from '../lib/errors.js';

/**
 * Mask an API key for display. Shows the prefix and last 4 characters.
 * Example: "ma_abc123xyz7890" => "ma_****7890"
 */
function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 7) {
    return '****';
  }
  const prefix = apiKey.startsWith('ma_') ? 'ma_' : '';
  const last4 = apiKey.slice(-4);
  return `${prefix}****${last4}`;
}

/**
 * Format an ISO 8601 date string for human display.
 * Returns a locale-appropriate short date, or the raw string on parse failure.
 */
function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Build a JSON-safe profile object with masked API key.
 */
function toProfileJson(
  name: string,
  profile: CredentialProfile,
  isActive: boolean,
): Record<string, unknown> {
  return {
    name,
    email: profile.email,
    user_id: profile.userId,
    api_key: maskApiKey(profile.apiKey),
    created_at: profile.createdAt,
    active: isActive,
  };
}

export function registerProfileCommand(program: Command): void {
  const profileCmd = program
    .command('profile')
    .description('Manage credential profiles');

  // ── agent-media profile list ──────────────────────────────────────────
  profileCmd
    .command('list')
    .description('List all saved profiles')
    .action(() => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const store = loadCredentials();
        const names = listProfiles();
        const currentProfile = resolveProfileName(globalOpts.profile);

        if (names.length === 0) {
          switch (mode) {
            case 'json':
              printJson([]);
              break;
            case 'quiet':
              // No output for empty list in quiet mode
              break;
            default:
              console.log(chalk.yellow('No profiles found.'));
              console.log(
                chalk.dim('  Run `agent-media login` to create a profile.'),
              );
              break;
          }
          return;
        }

        switch (mode) {
          case 'json': {
            const data = names.map((name) =>
              toProfileJson(
                name,
                store.profiles[name]!,
                name === currentProfile,
              ),
            );
            printJson(data);
            break;
          }

          case 'quiet':
            printQuiet(names);
            break;

          default: {
            const headers = ['Name', 'Email', 'API Key', 'Created'];
            const rows = names.map((name) => {
              const p = store.profiles[name]!;
              const marker = name === currentProfile ? ' *' : '';
              return [
                `${name}${marker}`,
                p.email,
                maskApiKey(p.apiKey),
                formatDate(p.createdAt),
              ];
            });
            printTable(headers, rows, globalOpts);
            console.log();
            console.log(chalk.dim('  * = active profile'));
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media profile switch <name> ─────────────────────────────────
  profileCmd
    .command('switch <name>')
    .description('Switch to a different profile')
    .action((name: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const store = loadCredentials();

        if (!store.profiles[name]) {
          const available = listProfiles();
          throw new CLIError(`Profile "${name}" does not exist.`, {
            code: 'PROFILE_NOT_FOUND',
            suggestion: available.length > 0
              ? `Available profiles: ${available.join(', ')}`
              : 'Run `agent-media login` to create a profile.',
          });
        }

        store.currentProfile = name;
        saveCredentials(store);

        const profile = store.profiles[name]!;

        switch (mode) {
          case 'json':
            printJson({
              success: true,
              profile: name,
              email: profile.email,
            });
            break;

          case 'quiet':
            printQuiet(name);
            break;

          default:
            console.log(
              chalk.green(
                `\u2713 Switched to profile '${chalk.bold(name)}' (${profile.email})`,
              ),
            );
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media profile delete <name> ─────────────────────────────────
  profileCmd
    .command('delete <name>')
    .description('Delete a saved profile')
    .action((name: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const store = loadCredentials();

        if (!store.profiles[name]) {
          throw new CLIError(`Profile "${name}" does not exist.`, {
            code: 'PROFILE_NOT_FOUND',
            suggestion: `Run \`agent-media profile list\` to see available profiles.`,
          });
        }

        const currentProfile = resolveProfileName(globalOpts.profile);
        if (name === currentProfile) {
          throw new CLIError(
            `Cannot delete the active profile "${name}".`,
            {
              code: 'CANNOT_DELETE_ACTIVE',
              suggestion:
                'Switch to another profile first with `agent-media profile switch <name>`.',
            },
          );
        }

        const deleted = removeProfile(name);

        if (!deleted) {
          throw new CLIError(`Failed to delete profile "${name}".`, {
            code: 'DELETE_FAILED',
          });
        }

        switch (mode) {
          case 'json':
            printJson({ success: true, profile: name });
            break;

          case 'quiet':
            printQuiet(name);
            break;

          default:
            console.log(
              chalk.green(`\u2713 Deleted profile '${chalk.bold(name)}'`),
            );
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media profile current ───────────────────────────────────────
  profileCmd
    .command('current')
    .description('Show the current active profile')
    .action(() => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const profileName = resolveProfileName(globalOpts.profile);
        const profile = getProfile(profileName);

        if (!profile) {
          throw new CLIError(`No credentials found for profile "${profileName}".`, {
            code: 'NOT_AUTHENTICATED',
            suggestion: 'Run `agent-media login` to authenticate.',
          });
        }

        switch (mode) {
          case 'json':
            printJson(toProfileJson(profileName, profile, true));
            break;

          case 'quiet':
            printQuiet(profileName);
            break;

          default:
            console.log();
            console.log(
              `  ${chalk.bold('Profile:')}  ${chalk.cyan(profileName)}`,
            );
            console.log(
              `  ${chalk.bold('Email:')}    ${profile.email}`,
            );
            console.log(
              `  ${chalk.bold('User ID:')}  ${chalk.dim(profile.userId)}`,
            );
            console.log(
              `  ${chalk.bold('API Key:')}  ${maskApiKey(profile.apiKey)}`,
            );
            console.log(
              `  ${chalk.bold('Created:')}  ${formatDate(profile.createdAt)}`,
            );
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
