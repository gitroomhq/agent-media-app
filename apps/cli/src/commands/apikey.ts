// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media apikey` command group.
 *
 * Manages user API keys: list, create, and revoke. API keys are used
 * for authenticating CLI and programmatic access to the agent-media
 * platform.
 *
 * Subcommands:
 * - `agent-media apikey list`            -- list all active API keys
 * - `agent-media apikey create <name>`   -- create a new API key
 * - `agent-media apikey revoke <key-id>` -- revoke an existing key
 *
 * Supports human, JSON, and quiet output modes via global flags.
 */

import { createInterface } from 'node:readline';
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
  type ApiKeyRecord,
} from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

/**
 * Require authentication and return the API key or throw.
 */
function requireAuth(profileName: string): string {
  const apiKey = getApiKey(profileName);
  if (!apiKey) {
    throw new CLIError('Not logged in.', {
      code: 'NOT_AUTHENTICATED',
      suggestion: "Run 'agent-media login' to authenticate.",
    });
  }
  return apiKey;
}

/**
 * Format a date string into a short human-readable label.
 * Returns "Never" for null/undefined values.
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const month = months[date.getMonth()]!;
  const day = date.getDate();

  // If same year, show "Mon DD"; otherwise "Mon DD, YYYY"
  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Pad or truncate a string to an exact column width.
 * Strips ANSI codes for length calculation.
 */
function fixedWidth(str: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1B\[[0-9;]*m/g, '');
  if (stripped.length >= width) return str;
  return str + ' '.repeat(width - stripped.length);
}

/**
 * Truncate a string to a maximum length, appending ellipsis if needed.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Print a formatted table of API keys.
 */
function printKeyTable(keys: ApiKeyRecord[]): void {
  const COL_PREFIX = 10;
  const COL_NAME = 14;
  const COL_CREATED = 12;
  const COL_LAST_USED = 12;

  const header =
    fixedWidth('PREFIX', COL_PREFIX) +
    fixedWidth('NAME', COL_NAME) +
    fixedWidth('CREATED', COL_CREATED) +
    'LAST USED';

  const separator =
    '\u2500'.repeat(COL_PREFIX) +
    '\u2500'.repeat(COL_NAME) +
    '\u2500'.repeat(COL_CREATED) +
    '\u2500'.repeat(COL_LAST_USED);

  console.log();
  console.log(chalk.bold(`  API Keys (${keys.length})`));
  console.log();
  console.log(`  ${chalk.bold(header)}`);
  console.log(`  ${chalk.dim(separator)}`);

  for (const key of keys) {
    const prefix = fixedWidth(key.key_prefix, COL_PREFIX);
    const name = fixedWidth(truncate(key.name, COL_NAME - 2), COL_NAME);
    const created = fixedWidth(formatDate(key.created_at), COL_CREATED);
    const lastUsed = formatDate(key.last_used_at);

    console.log(`  ${prefix}${name}${created}${lastUsed}`);
  }

  console.log();
}

/**
 * Ask a yes/no question on stdin and return the result.
 * Defaults to "no" (destructive action requires explicit confirmation).
 */
function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

export function registerApikeyCommand(program: Command): void {
  const apikeyCmd = program
    .command('apikey')
    .description('Manage API keys');

  // ── agent-media apikey list ──────────────────────────────────────────────
  apikeyCmd
    .command('list')
    .description('List all active API keys')
    .action(async () => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = requireAuth(profileName);

      try {
        const spinner = createSpinner('Fetching API keys...');
        if (mode === 'human') spinner.start();

        const api = new AgentMediaAPI(apiKey);
        const keys = await api.listApiKeys();

        if (mode === 'human') spinner.stop();

        // ── Empty state ──────────────────────────────────────────────
        if (keys.length === 0) {
          switch (mode) {
            case 'json':
              printJson([]);
              break;

            case 'quiet':
              // No output for quiet mode on empty result
              break;

            default:
              console.log();
              console.log(
                chalk.dim(
                  "  No API keys found. Create one with 'agent-media apikey create <name>'.",
                ),
              );
              console.log();
              break;
          }
          return;
        }

        // ── Output ───────────────────────────────────────────────────
        switch (mode) {
          case 'json':
            printJson(keys);
            break;

          case 'quiet':
            printQuiet(keys.map((k) => k.key_prefix));
            break;

          default:
            printKeyTable(keys);
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media apikey create <name> ─────────────────────────────────────
  apikeyCmd
    .command('create <name>')
    .description('Create a new API key')
    .action(async (name: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = requireAuth(profileName);

      try {
        const spinner = createSpinner('Creating API key...');
        if (mode === 'human') spinner.start();

        const api = new AgentMediaAPI(apiKey);
        const result = await api.createApiKey(name);

        if (mode === 'human') spinner.stop();

        switch (mode) {
          case 'json':
            printJson({
              id: result.id,
              name: result.name,
              api_key: result.key,
              key_prefix: result.key_prefix,
            });
            break;

          case 'quiet':
            printQuiet(result.key);
            break;

          default:
            console.log();
            console.log(
              `  ${chalk.green('\u2713')} API key created: ${chalk.bold(`"${result.name}"`)}`,
            );
            console.log();
            console.log(`  ${chalk.cyan(result.key)}`);
            console.log();
            console.log(
              `  ${chalk.yellow('\u26A0')} Copy this key now. You won't see it again.`,
            );
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media apikey revoke <key-id> ──────────────────────────────────
  apikeyCmd
    .command('revoke <key-id>')
    .description('Revoke an API key')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (keyId: string, cmdOpts: { force?: boolean }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const apiKey = requireAuth(profileName);

      try {
        const api = new AgentMediaAPI(apiKey);

        // Fetch the key list to show details before confirming
        if (mode === 'human' && !cmdOpts.force) {
          const spinner = createSpinner('Looking up API key...');
          spinner.start();

          const keys = await api.listApiKeys();
          const targetKey = keys.find((k) => k.id === keyId);

          spinner.stop();

          if (targetKey) {
            console.log();
            console.log(`  ${chalk.bold('Key:')}      ${targetKey.key_prefix}`);
            console.log(`  ${chalk.bold('Name:')}     ${targetKey.name}`);
            console.log(`  ${chalk.bold('Created:')}  ${formatDate(targetKey.created_at)}`);
            console.log();
          }

          const confirmed = await askConfirmation(
            `  Revoke API key ${chalk.cyan(keyId.slice(0, 8))}? This cannot be undone. [y/N] `,
          );

          if (!confirmed) {
            console.log(chalk.dim('  Revocation cancelled.'));
            return;
          }
        }

        const revokeSpinner = createSpinner('Revoking API key...');
        if (mode === 'human') revokeSpinner.start();

        const result = await api.revokeManagedApiKey(keyId);

        if (mode === 'human') revokeSpinner.succeed('API key revoked');

        switch (mode) {
          case 'json':
            printJson({
              id: result.id,
              revoked: result.revoked,
            });
            break;

          case 'quiet':
            printQuiet('revoked');
            break;

          default:
            console.log();
            console.log(`  ${chalk.green('API key revoked successfully.')}`);
            console.log(
              chalk.dim('  Any applications using this key will lose access immediately.'),
            );
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
