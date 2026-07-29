// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media alias` command group.
 *
 * Manages user-defined command aliases stored at ~/.agent-media/aliases.json.
 * Aliases expand to full CLI invocations, allowing frequently used commands
 * to be accessed with shorter names.
 *
 * Subcommands:
 *   - `agent-media alias set <name> <expansion>`  -- create or update an alias
 *   - `agent-media alias list`                    -- show all aliases
 *   - `agent-media alias delete <name>`           -- remove an alias
 *
 * Supports human, JSON, and quiet output modes via global flags.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';
import { CONFIG_DIR } from '../lib/config.js';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';
import { CLIError, handleError } from '../lib/errors.js';

// ── Constants ────────────────────────────────────────────────────────────────

const ALIASES_FILE = join(CONFIG_DIR, 'aliases.json');
const MAX_ALIAS_NAME_LENGTH = 50;
const MAX_EXPANSION_LENGTH = 500;

/**
 * Reserved names that cannot be used as aliases because they conflict with
 * built-in commands.
 */
const RESERVED_NAMES = new Set([
  'alias',
  'apikey',
  'cancel',
  'config',
  'credits',
  'debug',
  'delete',
  'doctor',
  'download',
  'generate',
  'help',
  'inspect',
  'list',
  'login',
  'logout',
  'models',
  'plan',
  'pricing',
  'profile',
  'retry',
  'status',
  'subscribe',
  'text',
  'usage',
  'version',
  'whoami',
]);

// ── Alias Store ──────────────────────────────────────────────────────────────

type AliasMap = Record<string, string>;

/**
 * Ensure the config directory exists.
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load aliases from disk. Returns an empty object if the file does not
 * exist or is malformed.
 */
function loadAliases(): AliasMap {
  if (!existsSync(ALIASES_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(ALIASES_FILE, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }
    return data as AliasMap;
  } catch {
    return {};
  }
}

/**
 * Persist the aliases map to disk.
 */
function saveAliases(aliases: AliasMap): void {
  ensureConfigDir();
  writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2) + '\n', 'utf-8');
}

/**
 * Validate an alias name.
 */
function validateAliasName(name: string): void {
  if (name.length === 0) {
    throw new CLIError('Alias name must not be empty.', {
      code: 'INVALID_ALIAS_NAME',
    });
  }

  if (name.length > MAX_ALIAS_NAME_LENGTH) {
    throw new CLIError(
      `Alias name must be ${MAX_ALIAS_NAME_LENGTH} characters or fewer.`,
      { code: 'INVALID_ALIAS_NAME' },
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new CLIError(
      'Alias name may only contain letters, digits, hyphens, and underscores.',
      { code: 'INVALID_ALIAS_NAME' },
    );
  }

  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new CLIError(`"${name}" is a built-in command and cannot be used as an alias.`, {
      code: 'RESERVED_ALIAS_NAME',
      suggestion: 'Choose a different name that does not conflict with a built-in command.',
    });
  }
}

// ── Command Registration ─────────────────────────────────────────────────────

export function registerAliasCommand(program: Command): void {
  const aliasCmd = program
    .command('alias')
    .description('Manage command aliases');

  // ── agent-media alias set <name> <expansion> ──────────────────────────
  aliasCmd
    .command('set <name> <expansion>')
    .description('Create or update a command alias')
    .action((name: string, expansion: string) => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        validateAliasName(name);

        if (expansion.length === 0) {
          throw new CLIError('Expansion must not be empty.', {
            code: 'INVALID_ALIAS_EXPANSION',
          });
        }

        if (expansion.length > MAX_EXPANSION_LENGTH) {
          throw new CLIError(
            `Expansion must be ${MAX_EXPANSION_LENGTH} characters or fewer.`,
            { code: 'INVALID_ALIAS_EXPANSION' },
          );
        }

        const aliases = loadAliases();
        const isUpdate = name in aliases;
        aliases[name] = expansion;
        saveAliases(aliases);

        switch (mode) {
          case 'json':
            printJson({ name, expansion, updated: isUpdate, success: true });
            break;
          case 'quiet':
            printQuiet(name);
            break;
          default: {
            const verb = isUpdate ? 'Updated' : 'Created';
            console.log(
              chalk.green(`\u2713 ${verb} alias ${chalk.bold(name)} = ${chalk.cyan(expansion)}`),
            );
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media alias list ────────────────────────────────────────────
  aliasCmd
    .command('list')
    .description('List all command aliases')
    .action(() => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const aliases = loadAliases();
        const entries = Object.entries(aliases);

        if (entries.length === 0) {
          switch (mode) {
            case 'json':
              printJson({});
              break;
            case 'quiet':
              // No output for quiet mode on empty result
              break;
            default:
              console.log();
              console.log(
                chalk.dim("  No aliases defined. Create one with 'agent-media alias set <name> <expansion>'."),
              );
              console.log();
              break;
          }
          return;
        }

        switch (mode) {
          case 'json':
            printJson(aliases);
            break;
          case 'quiet':
            printQuiet(entries.map(([name]) => name));
            break;
          default: {
            console.log();
            console.log(chalk.bold(`  Aliases (${entries.length})`));
            console.log(chalk.dim(`  ${ALIASES_FILE}`));
            console.log();

            // Calculate column width for alignment
            const maxNameLen = Math.max(...entries.map(([n]) => n.length));

            for (const [name, expansion] of entries) {
              console.log(`  ${chalk.bold(name.padEnd(maxNameLen))}  ${chalk.cyan(expansion)}`);
            }
            console.log();
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media alias delete <name> ───────────────────────────────────
  aliasCmd
    .command('delete <name>')
    .description('Remove a command alias')
    .action((name: string) => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const aliases = loadAliases();

        if (!(name in aliases)) {
          throw new CLIError(`Alias "${name}" not found.`, {
            code: 'ALIAS_NOT_FOUND',
            suggestion: "Run 'agent-media alias list' to see all aliases.",
          });
        }

        delete aliases[name];
        saveAliases(aliases);

        switch (mode) {
          case 'json':
            printJson({ name, deleted: true, success: true });
            break;
          case 'quiet':
            printQuiet('deleted');
            break;
          default:
            console.log(chalk.green(`\u2713 Deleted alias ${chalk.bold(name)}`));
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
