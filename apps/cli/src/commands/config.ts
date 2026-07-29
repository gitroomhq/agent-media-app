// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media config` command.
 *
 * Manages CLI configuration stored at ~/.agent-media/config.json.
 * Supports get, set, list, and reset subcommands for controlling
 * default behavior of the CLI.
 *
 * Supported keys:
 * - api_url: Supabase Edge Functions URL
 * - output_format: default output format (human/json/quiet)
 * - default_model: default model for generate command
 * - auto_open_browser: whether to auto-open browser on login (default: true)
 * - download_dir: default download directory
 */

import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  resetConfig,
  CONFIG_FILE,
  VALID_CONFIG_KEYS,
  CONFIG_DEFAULTS,
  isValidConfigKey,
  type ConfigData,
} from '../lib/config.js';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';
import { handleError } from '../lib/errors.js';
import { CLIError } from '../lib/errors.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  // agent-media config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        if (!isValidConfigKey(key)) {
          throw new CLIError(`Unknown config key: "${key}"`, {
            code: 'INVALID_CONFIG_KEY',
            suggestion: `Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`,
          });
        }

        // Validate specific keys
        if (key === 'output_format' && !['human', 'json', 'quiet'].includes(value)) {
          throw new CLIError(`Invalid output_format: "${value}"`, {
            code: 'INVALID_CONFIG_VALUE',
            suggestion: 'Valid values: human, json, quiet',
          });
        }

        if (key === 'auto_open_browser' && !['true', 'false'].includes(value)) {
          throw new CLIError(`Invalid auto_open_browser: "${value}"`, {
            code: 'INVALID_CONFIG_VALUE',
            suggestion: 'Valid values: true, false',
          });
        }

        // Coerce boolean values
        const coerced = key === 'auto_open_browser' ? value === 'true' : value;

        setConfigValue(key, coerced);

        switch (mode) {
          case 'json':
            printJson({ key, value: coerced, success: true });
            break;
          case 'quiet':
            printQuiet(String(coerced));
            break;
          default:
            console.log(chalk.green(`\u2713 Set ${chalk.bold(key)} = ${coerced}`));
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // agent-media config get <key>
  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        if (!isValidConfigKey(key)) {
          throw new CLIError(`Unknown config key: "${key}"`, {
            code: 'INVALID_CONFIG_KEY',
            suggestion: `Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`,
          });
        }

        const value = getConfigValue(key);
        const defaultValue = CONFIG_DEFAULTS[key];
        const effectiveValue = value ?? defaultValue;

        switch (mode) {
          case 'json':
            printJson({
              key,
              value: effectiveValue ?? null,
              is_default: value === undefined,
            });
            break;
          case 'quiet':
            printQuiet(effectiveValue !== undefined ? String(effectiveValue) : '');
            break;
          default:
            if (value !== undefined) {
              console.log(`${chalk.bold(key)} = ${value}`);
            } else if (defaultValue !== undefined) {
              console.log(`${chalk.bold(key)} = ${defaultValue} ${chalk.dim('(default)')}`);
            } else {
              console.log(`${chalk.bold(key)} = ${chalk.dim('(not set)')}`);
            }
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // agent-media config list
  configCmd
    .command('list')
    .description('List all configuration values')
    .action(() => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const config = loadConfig();

        switch (mode) {
          case 'json': {
            // Merge defaults with current config for a complete picture
            const merged: Record<string, unknown> = {};
            for (const key of VALID_CONFIG_KEYS) {
              merged[key] = config[key] ?? CONFIG_DEFAULTS[key] ?? null;
            }
            printJson(merged);
            break;
          }

          case 'quiet': {
            const lines: string[] = [];
            for (const key of VALID_CONFIG_KEYS) {
              const val = config[key] ?? CONFIG_DEFAULTS[key];
              lines.push(`${key}=${val !== undefined ? val : ''}`);
            }
            printQuiet(lines);
            break;
          }

          default: {
            console.log();
            console.log(chalk.bold('  Configuration'));
            console.log(chalk.dim(`  ${CONFIG_FILE}`));
            console.log();

            for (const key of VALID_CONFIG_KEYS) {
              const value = config[key];
              const defaultValue = CONFIG_DEFAULTS[key];

              if (value !== undefined) {
                console.log(`  ${chalk.bold(key)} = ${value}`);
              } else if (defaultValue !== undefined) {
                console.log(
                  `  ${chalk.bold(key)} = ${chalk.dim(String(defaultValue))} ${chalk.dim('(default)')}`,
                );
              } else {
                console.log(`  ${chalk.bold(key)} = ${chalk.dim('(not set)')}`);
              }
            }
            console.log();
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // agent-media config reset
  configCmd
    .command('reset')
    .description('Reset all configuration to defaults')
    .action(() => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        resetConfig();

        switch (mode) {
          case 'json':
            printJson({ success: true, message: 'Configuration reset to defaults.' });
            break;
          case 'quiet':
            printQuiet('reset');
            break;
          default:
            console.log(chalk.green('\u2713 Configuration reset to defaults.'));
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // agent-media config export
  configCmd
    .command('export')
    .description('Output full configuration as JSON to stdout')
    .action(() => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const config = loadConfig();

        // Build a complete view: merge defaults with stored values
        const merged: Record<string, unknown> = {};
        for (const key of VALID_CONFIG_KEYS) {
          merged[key] = config[key] ?? CONFIG_DEFAULTS[key] ?? null;
        }

        switch (mode) {
          case 'json':
          case 'quiet':
            // Both modes output raw JSON for piping
            printJson(merged);
            break;
          default:
            // Human mode: also output raw JSON (this is the export)
            printJson(merged);
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // agent-media config import <file>
  configCmd
    .command('import <file>')
    .description('Import configuration from a JSON file, merging into current config')
    .action((file: string) => {
      const globalOpts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(globalOpts);

      try {
        // 1. Read and parse the file
        let raw: string;
        try {
          raw = readFileSync(file, 'utf-8');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown read error';
          throw new CLIError(`Failed to read file: ${msg}`, {
            code: 'FILE_READ_ERROR',
            suggestion: 'Verify the file path exists and is readable.',
          });
        }

        let imported: unknown;
        try {
          imported = JSON.parse(raw);
        } catch {
          throw new CLIError('File is not valid JSON.', {
            code: 'INVALID_JSON',
            suggestion: 'Ensure the file contains a valid JSON object.',
          });
        }

        // 2. Validate schema: must be a plain object
        if (imported === null || typeof imported !== 'object' || Array.isArray(imported)) {
          throw new CLIError('Imported config must be a JSON object.', {
            code: 'INVALID_CONFIG_SCHEMA',
            suggestion: 'The file should contain a JSON object like { "key": "value" }.',
          });
        }

        const importedObj = imported as Record<string, unknown>;

        // 3. Validate all keys are recognized config keys
        const unknownKeys: string[] = [];
        for (const key of Object.keys(importedObj)) {
          if (!isValidConfigKey(key)) {
            unknownKeys.push(key);
          }
        }

        if (unknownKeys.length > 0) {
          throw new CLIError(
            `Unknown config key${unknownKeys.length > 1 ? 's' : ''}: ${unknownKeys.join(', ')}`,
            {
              code: 'INVALID_CONFIG_KEY',
              suggestion: `Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`,
            },
          );
        }

        // 4. Validate individual values
        if ('output_format' in importedObj) {
          const val = importedObj['output_format'];
          if (typeof val !== 'string' || !['human', 'json', 'quiet'].includes(val)) {
            throw new CLIError(`Invalid output_format: "${val}"`, {
              code: 'INVALID_CONFIG_VALUE',
              suggestion: 'Valid values: human, json, quiet',
            });
          }
        }

        if ('auto_open_browser' in importedObj) {
          const val = importedObj['auto_open_browser'];
          if (typeof val !== 'boolean' && val !== 'true' && val !== 'false') {
            throw new CLIError(`Invalid auto_open_browser: "${val}"`, {
              code: 'INVALID_CONFIG_VALUE',
              suggestion: 'Valid values: true, false',
            });
          }
          // Normalize string booleans
          if (typeof val === 'string') {
            importedObj['auto_open_browser'] = val === 'true';
          }
        }

        // 5. Merge into current config and save
        const current = loadConfig();
        const merged: ConfigData = { ...current, ...importedObj };
        saveConfig(merged);

        const importedKeyCount = Object.keys(importedObj).length;

        switch (mode) {
          case 'json':
            printJson({
              success: true,
              keys_imported: importedKeyCount,
              config: merged,
            });
            break;
          case 'quiet':
            printQuiet(String(importedKeyCount));
            break;
          default:
            console.log(
              chalk.green(
                `\u2713 Imported ${importedKeyCount} config key${importedKeyCount !== 1 ? 's' : ''} from ${chalk.bold(file)}`,
              ),
            );
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
