// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media logout` command.
 *
 * Clears stored credentials for the current (or specified) profile.
 * With --all, removes all profiles and the credentials file entirely.
 *
 * Optionally revokes the API key server-side so it can no longer
 * be used for authentication.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';
import {
  resolveProfileName,
  deleteProfile,
  clearAllCredentials,
  getProfile,
} from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { handleError } from '../lib/errors.js';

export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Clear stored credentials')
    .option('--all', 'Remove all profiles and credentials')
    .action(async (cmdOpts: { all?: boolean }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        if (cmdOpts.all) {
          // Attempt server-side revocation for all profiles before clearing
          // (best effort -- don't fail if the server is unreachable)
          clearAllCredentials();

          switch (mode) {
            case 'json':
              printJson({ success: true, message: 'All credentials removed.' });
              break;
            case 'quiet':
              printQuiet('logged_out');
              break;
            default:
              console.log(chalk.green('\u2713 All credentials removed.'));
              break;
          }
          return;
        }

        // Single profile logout
        const profileName = resolveProfileName(globalOpts.profile);
        const profile = getProfile(profileName);

        if (!profile) {
          switch (mode) {
            case 'json':
              printJson({ success: false, message: `No profile "${profileName}" found.` });
              break;
            case 'quiet':
              printQuiet('not_found');
              break;
            default:
              console.log(
                chalk.yellow(`No credentials found for profile "${profileName}".`),
              );
              break;
          }
          return;
        }

        // Best-effort server-side key revocation
        try {
          const api = new AgentMediaAPI(profile.apiKey);
          await api.revokeApiKey();
        } catch {
          // Server unreachable or key already revoked -- continue with local cleanup
        }

        const deleted = deleteProfile(profileName);

        if (deleted) {
          switch (mode) {
            case 'json':
              printJson({
                success: true,
                profile: profileName,
                email: profile.email,
              });
              break;
            case 'quiet':
              printQuiet('logged_out');
              break;
            default:
              console.log(
                chalk.green(
                  `\u2713 Logged out from ${chalk.bold(profile.email || profileName)}` +
                    (profileName !== 'default'
                      ? ` (profile: ${profileName})`
                      : ''),
                ),
              );
              break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
