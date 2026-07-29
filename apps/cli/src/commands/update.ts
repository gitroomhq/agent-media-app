// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media update` command.
 *
 * Checks the npm registry for the latest published version of the
 * agent-media package, compares it against the locally installed version,
 * installs the update, and refreshes the Claude Code skill docs.
 *
 * Flags:
 *   --check   Check-only mode (do not prompt or install).
 *   --force   Reinstall the CLI and skill docs even if already current.
 *   --cli-only   Update only the CLI package.
 *   --skills-only   Update only the Claude Code skill docs.
 */

import type { Command } from 'commander';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../lib/output.js';
import { CLIError, handleError } from '../lib/errors.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string };

/** npm registry URL for the package. */
const REGISTRY_URL = `https://registry.npmjs.org/${pkg.name}/latest`;

/** Canonical Claude Code skill repo installed by the public docs. */
const SKILL_REPO = 'gitroomhq/agent-media';

/** Timeout for the registry fetch (5 seconds). */
const FETCH_TIMEOUT_MS = 5_000;

type PackageManager = 'pnpm' | 'npm' | 'yarn';

type CliUpdateState = {
  current: string;
  latest: string;
  update_available: boolean;
  forced?: boolean;
  install_command?: string;
  updated?: boolean;
  skipped?: boolean;
};

type SkillUpdateState = {
  repository: string;
  update_command: string;
  forced?: boolean;
  updated?: boolean;
  skipped?: boolean;
};

function commandErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const maybeExecError = error as Error & { stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = maybeExecError.stderr?.toString().trim();
    const stdout = maybeExecError.stdout?.toString().trim();
    return stderr || stdout || error.message;
  }
  return String(error);
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Fetch the latest version string from the npm registry.
 */
async function fetchLatestVersion(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(REGISTRY_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new CLIError(
        `Failed to check for updates (HTTP ${res.status})`,
        {
          code: 'REGISTRY_ERROR',
          suggestion: 'Check your network connection or try again later.',
        },
      );
    }

    const data = (await res.json()) as { version?: string };

    if (!data.version) {
      throw new CLIError('Unexpected response from npm registry.', {
        code: 'REGISTRY_PARSE_ERROR',
        suggestion: 'Try again later or check https://www.npmjs.com/package/agent-media-cli manually.',
      });
    }

    return data.version;
  } catch (error: unknown) {
    if (error instanceof CLIError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new CLIError('Timed out checking for updates.', {
        code: 'REGISTRY_TIMEOUT',
        suggestion: 'Check your network connection or try again later.',
      });
    }

    throw new CLIError('Failed to check for updates.', {
      code: 'REGISTRY_ERROR',
      suggestion: 'Check your network connection or try again later.',
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pick the package manager for self-updates.
 *
 * Default to npm because the public install path is `npm install -g`.
 * Users who intentionally manage globals with pnpm/yarn can override with
 * AGENT_MEDIA_UPDATE_PM=pnpm or AGENT_MEDIA_UPDATE_PM=yarn.
 */
function detectPackageManager(): PackageManager {
  const override = process.env['AGENT_MEDIA_UPDATE_PM'];
  if (override === 'npm' || override === 'pnpm' || override === 'yarn') {
    return override;
  }

  return 'npm';
}

/**
 * Build the install command string for the detected package manager.
 */
function buildInstallCommand(pm: PackageManager, version: string): string {
  const spec = `${pkg.name}@${version}`;

  switch (pm) {
    case 'pnpm':
      return `pnpm add -g ${spec}`;
    case 'yarn':
      return `yarn global add ${spec}`;
    default:
      return `npm install -g ${spec}`;
  }
}

function buildSkillUpdateCommand(): string {
  return `npx --yes skills add ${SKILL_REPO} --agent claude-code --yes`;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update the CLI and Claude Code skill docs')
    .option('--check', 'Check only, do not install')
    .option('--force', 'Force reinstall/refresh even when already current')
    .option('--cli-only', 'Update only the global CLI package')
    .option('--skills-only', 'Update only the Claude Code skill docs')
    .action(async (cmdOpts: { check?: boolean; force?: boolean; cliOnly?: boolean; skillsOnly?: boolean }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
      }>();
      const mode = detectOutputMode(globalOpts);
      const checkOnly = cmdOpts.check ?? false;
      const force = cmdOpts.force ?? false;
      const cliOnly = cmdOpts.cliOnly ?? false;
      const skillsOnly = cmdOpts.skillsOnly ?? false;

      if (cliOnly && skillsOnly) {
        handleError(new CLIError('Choose either --cli-only or --skills-only, not both.', {
          code: 'UPDATE_INVALID_FLAGS',
          suggestion: 'Run either agent-media update --cli-only or agent-media update --skills-only.',
        }));
      }

      const shouldUpdateCli = !skillsOnly;
      const shouldUpdateSkills = !cliOnly;

      try {
        const pm = detectPackageManager();
        const skillUpdateCommand = buildSkillUpdateCommand();
        let cliState: CliUpdateState | null = null;
        let skillState: SkillUpdateState | null = null;

        if (shouldUpdateCli) {
          const spinner = createSpinner('Checking for CLI updates...');
          if (mode === 'human') spinner.start();

          const latestVersion = await fetchLatestVersion();
          const currentVersion = pkg.version;
          const comparison = compareSemver(currentVersion, latestVersion);

          if (mode === 'human') spinner.stop();

          cliState = {
            current: currentVersion,
            latest: latestVersion,
            update_available: comparison < 0,
            forced: force,
          };

          if (comparison < 0 || force) {
            const installCmd = buildInstallCommand(pm, force ? 'latest' : latestVersion);
            cliState.install_command = installCmd;

            if (!checkOnly) {
              if (mode === 'human') {
                console.log();
                console.log(chalk.bold(comparison < 0 ? '  CLI update available' : '  Forcing CLI reinstall'));
                console.log(`  ${chalk.dim('Current:')}  v${currentVersion}`);
                console.log(`  ${chalk.green('Latest:')}   v${latestVersion}`);
                console.log();
              }

              const installSpinner = createSpinner(`Updating CLI with ${pm}...`);
              if (mode === 'human') installSpinner.start();

              try {
                execSync(installCmd, {
                  encoding: 'utf-8',
                  stdio: 'pipe',
                });
                cliState.updated = true;
                if (mode === 'human') {
                  installSpinner.succeed(
                    `Updated agent-media CLI from v${currentVersion} to v${latestVersion}`,
                  );
                }
              } catch (installError: unknown) {
                if (mode === 'human') installSpinner.fail('CLI update failed');
                throw new CLIError(`Failed to install CLI update: ${commandErrorMessage(installError)}`, {
                  code: 'UPDATE_INSTALL_FAILED',
                  suggestion: `Try installing manually:\n  ${installCmd}`,
                });
              }
            } else {
              cliState.skipped = true;
            }
          } else {
            cliState.updated = false;
          }
        }

        if (shouldUpdateSkills) {
          skillState = {
            repository: SKILL_REPO,
            update_command: skillUpdateCommand,
            forced: force,
          };

          if (!checkOnly) {
            const skillSpinner = createSpinner('Refreshing Claude Code skill docs...');
            if (mode === 'human') skillSpinner.start();

            try {
              execSync(skillUpdateCommand, {
                encoding: 'utf-8',
                stdio: 'pipe',
              });
              skillState.updated = true;
              if (mode === 'human') skillSpinner.succeed(`Refreshed skill docs from ${SKILL_REPO}`);
            } catch (skillError: unknown) {
              if (mode === 'human') skillSpinner.fail('Skill refresh failed');
              throw new CLIError(`Failed to update Claude Code skill docs: ${commandErrorMessage(skillError)}`, {
                code: 'SKILL_UPDATE_FAILED',
                suggestion: `Try running manually:\n  ${skillUpdateCommand}`,
              });
            }
          } else {
            skillState.skipped = true;
          }
        }

        switch (mode) {
          case 'json':
            printJson({
              cli: cliState,
              skills: skillState,
              check_only: checkOnly,
            });
            break;

          case 'quiet':
            printQuiet([
              cliState ? `cli:${cliState.latest}` : 'cli:skipped',
              skillState ? `skills:${skillState.repository}` : 'skills:skipped',
            ]);
            break;

          default:
            console.log();
            if (checkOnly) {
              if (cliState) {
                if (cliState.update_available) {
                  console.log(`${chalk.bold('CLI update available')}: v${cliState.current} -> v${cliState.latest}`);
                  console.log(`  ${chalk.cyan(cliState.install_command)}`);
                } else if (cliState.forced) {
                  console.log(`${chalk.bold('CLI force reinstall command')}:`);
                  console.log(`  ${chalk.cyan(cliState.install_command)}`);
                } else {
                  console.log(`${chalk.green('CLI up to date')}: v${cliState.current}`);
                }
              }
              if (skillState) {
                console.log(`${chalk.bold('Skill refresh command')}:`);
                console.log(`  ${chalk.cyan(skillState.update_command)}`);
              }
            } else {
              if (cliState && !cliState.update_available) {
                console.log(cliState.updated
                  ? `${chalk.green('CLI reinstalled')}: v${cliState.latest}`
                  : `${chalk.green('CLI up to date')}: v${cliState.current}`);
              }
              if (skillState?.updated) {
                console.log(`${chalk.green('Skill docs refreshed')}: ${skillState.repository}`);
              }
              console.log();
              console.log(chalk.dim('Restart your terminal if the CLI binary was updated.'));
            }
            console.log();
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
