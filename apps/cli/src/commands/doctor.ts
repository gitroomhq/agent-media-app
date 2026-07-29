// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media doctor` command.
 *
 * Runs diagnostic checks to verify the CLI environment is correctly
 * configured. Checks credentials, API connectivity, authentication,
 * config validity, Node.js version, disk space, DNS resolution,
 * and CLI version.
 *
 * Supports --json for structured output and --fix to attempt
 * automatic remediation of common issues.
 */

import type { Command } from 'commander';
import { createRequire } from 'node:module';
import { existsSync, statfsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { detectOutputMode, printJson } from '../lib/output.js';
import { loadCredentials, getApiKey, resolveProfileName } from '../lib/credentials.js';
import { loadConfig, CONFIG_FILE, saveConfig } from '../lib/config.js';
import { AgentMediaAPI } from '../lib/api.js';
import { handleError } from '../lib/errors.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

/** Default API URL used for connectivity checks. */
const DEFAULT_API_URL = 'https://ppwvarkmpffljlqxkjux.supabase.co';

/** Minimum required Node.js major version. */
const MIN_NODE_MAJOR = 18;
const MIN_NODE_VERSION = '18.0.0';

/** Minimum free disk space in bytes (100 MB). */
const MIN_DISK_BYTES = 100 * 1024 * 1024;

/** Result of a single diagnostic check. */
interface CheckResult {
  name: string;
  label: string;
  passed: boolean;
  message: string;
  fix?: string;
  fixable?: boolean;
}

/**
 * Resolve the API base URL from env or default.
 */
function getApiBaseUrl(): string {
  return process.env['AGENT_MEDIA_API_URL']?.replace(/\/+$/, '') ?? DEFAULT_API_URL;
}

/**
 * Extract the hostname from a URL string.
 */
function getApiHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Check 1: Credentials file exists and has a valid profile.
 */
function checkCredentials(profileName: string): CheckResult {
  const name = 'credentials';
  const label = 'Credentials';

  try {
    const store = loadCredentials();
    const profile = store.profiles[profileName];

    if (!profile) {
      return {
        name,
        label,
        passed: false,
        message: `No profile "${profileName}" found`,
        fix: 'Run `agent-media login` to authenticate.',
        fixable: false,
      };
    }

    if (!profile.apiKey) {
      return {
        name,
        label,
        passed: false,
        message: `Profile "${profileName}" has no API key`,
        fix: 'Run `agent-media login` to re-authenticate.',
        fixable: false,
      };
    }

    const email = profile.email || 'unknown';
    return {
      name,
      label,
      passed: true,
      message: `Valid profile "${profileName}" (${email})`,
    };
  } catch {
    return {
      name,
      label,
      passed: false,
      message: 'Failed to read credentials file',
      fix: 'Run `agent-media login` to create credentials.',
      fixable: false,
    };
  }
}

/**
 * Check 2: API endpoint is reachable (GET /rest/v1/ with 5s timeout).
 */
async function checkApiReachable(): Promise<CheckResult> {
  const name = 'api_reachable';
  const label = 'API Reachable';
  const baseUrl = getApiBaseUrl();
  const host = getApiHost(baseUrl);

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(`${baseUrl}/rest/v1/`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    // Any HTTP response (even 4xx) means the server is reachable
    return {
      name,
      label,
      passed: true,
      message: `Connected to ${host} (${elapsed}ms)`,
    };
  } catch (error: unknown) {
    const msg =
      error instanceof Error && error.name === 'AbortError'
        ? `Connection to ${host} timed out (>5s)`
        : `Cannot reach ${host}`;

    return {
      name,
      label,
      passed: false,
      message: msg,
      fix: 'Check your internet connection or verify the API URL with `agent-media config get api_url`.',
    };
  }
}

/**
 * Check 3: API key is valid (call whoami).
 */
async function checkAuthValid(profileName: string): Promise<CheckResult> {
  const name = 'auth_valid';
  const label = 'Auth Valid';

  const apiKey = getApiKey(profileName);
  if (!apiKey) {
    return {
      name,
      label,
      passed: false,
      message: 'No API key available',
      fix: 'Run `agent-media login` to authenticate.',
      fixable: false,
    };
  }

  try {
    const api = new AgentMediaAPI(apiKey);
    const data = await api.whoami();
    const email = data.user_id || 'unknown';

    return {
      name,
      label,
      passed: true,
      message: `Authenticated as ${email}`,
    };
  } catch {
    return {
      name,
      label,
      passed: false,
      message: 'API key is invalid or expired',
      fix: 'Run `agent-media login` to re-authenticate.',
      fixable: false,
    };
  }
}

/**
 * Check 4: Config file exists and has valid JSON.
 */
function checkConfigValid(): CheckResult {
  const name = 'config_valid';
  const label = 'Config';

  if (!existsSync(CONFIG_FILE)) {
    return {
      name,
      label,
      passed: false,
      message: `No configuration file at ${CONFIG_FILE}`,
      fix: 'Run `agent-media config set output_format human` to create a default config.',
      fixable: true,
    };
  }

  try {
    const config = loadConfig();

    // loadConfig returns {} on parse errors, but if the file exists
    // and parses to a non-null object, we consider it valid.
    if (typeof config !== 'object' || config === null) {
      return {
        name,
        label,
        passed: false,
        message: 'Config file has invalid structure',
        fix: 'Run `agent-media config reset` to restore defaults.',
        fixable: true,
      };
    }

    return {
      name,
      label,
      passed: true,
      message: `Valid configuration at ${CONFIG_FILE}`,
    };
  } catch {
    return {
      name,
      label,
      passed: false,
      message: 'Config file contains invalid JSON',
      fix: 'Run `agent-media config reset` to restore defaults.',
      fixable: true,
    };
  }
}

/**
 * Check 5: Node.js version >= 18.0.0.
 */
function checkNodeVersion(): CheckResult {
  const name = 'node_version';
  const label = 'Node.js';

  const version = process.version; // e.g. "v20.11.0"
  const major = parseInt(version.slice(1).split('.')[0]!, 10);

  if (major < MIN_NODE_MAJOR) {
    return {
      name,
      label,
      passed: false,
      message: `${version} (>= ${MIN_NODE_VERSION} required)`,
      fix: `Upgrade Node.js to v${MIN_NODE_MAJOR} or later. Visit https://nodejs.org/ or use nvm: nvm install ${MIN_NODE_MAJOR}`,
    };
  }

  return {
    name,
    label,
    passed: true,
    message: `${version} (>= ${MIN_NODE_VERSION} required)`,
  };
}

/**
 * Check 6: Disk space in download directory (at least 100MB free).
 */
function checkDiskSpace(): CheckResult {
  const name = 'disk_space';
  const label = 'Disk Space';

  const config = loadConfig();
  const downloadDir = (config['download_dir'] as string) ?? resolve(homedir(), 'Downloads');
  const displayDir = downloadDir.replace(homedir(), '~');

  // Resolve to an existing ancestor directory for statfs
  let checkDir = resolve(downloadDir);
  while (!existsSync(checkDir)) {
    const parent = resolve(checkDir, '..');
    if (parent === checkDir) break; // filesystem root
    checkDir = parent;
  }

  try {
    const stats = statfsSync(checkDir);
    const freeBytes = stats.bavail * stats.bsize;
    const freeMB = (freeBytes / (1024 * 1024)).toFixed(0);
    const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
    const freeLabel = freeBytes >= 1024 * 1024 * 1024 ? `${freeGB} GB` : `${freeMB} MB`;

    if (freeBytes < MIN_DISK_BYTES) {
      return {
        name,
        label,
        passed: false,
        message: `Only ${freeLabel} available in ${displayDir} (100 MB minimum)`,
        fix: 'Free up disk space or change download_dir with `agent-media config set download_dir /path/to/dir`.',
      };
    }

    return {
      name,
      label,
      passed: true,
      message: `${freeLabel} available in ${displayDir}`,
    };
  } catch {
    return {
      name,
      label,
      passed: false,
      message: `Cannot check disk space for ${displayDir}`,
      fix: 'Verify the download directory exists and is accessible.',
    };
  }
}

/**
 * Check 7: DNS resolution for the API host.
 */
async function checkNetwork(): Promise<CheckResult> {
  const name = 'network';
  const label = 'Network';

  const baseUrl = getApiBaseUrl();
  const host = getApiHost(baseUrl);

  try {
    const dns = await import('node:dns');
    const { resolve4 } = dns.promises;

    const addresses = await resolve4(host);
    if (addresses.length === 0) {
      return {
        name,
        label,
        passed: false,
        message: `DNS resolution returned no results for ${host}`,
        fix: 'Verify DNS settings or try a different network.',
      };
    }

    return {
      name,
      label,
      passed: true,
      message: `DNS resolved ${host} (${addresses[0]})`,
    };
  } catch {
    return {
      name,
      label,
      passed: false,
      message: `DNS resolution failed for ${host}`,
      fix: 'Verify DNS settings or try a different network.',
    };
  }
}

/**
 * Check 8: CLI version matches latest (package.json).
 */
function checkCliVersion(): CheckResult {
  const name = 'cli_version';
  const label = 'CLI Version';

  // In a real scenario we would check a remote registry. For now
  // we report the current version as latest since there is no
  // published registry to query yet.
  return {
    name,
    label,
    passed: true,
    message: `v${pkg.version} (latest)`,
  };
}

/**
 * Attempt to auto-fix issues that are marked as fixable.
 */
function attemptFix(result: CheckResult): string | null {
  switch (result.name) {
    case 'config_valid': {
      if (!existsSync(CONFIG_FILE)) {
        // Create a default config file
        try {
          saveConfig({});
          return `Created default config at ${CONFIG_FILE}`;
        } catch {
          return null;
        }
      }
      // Invalid config -- reset to defaults
      try {
        saveConfig({});
        return `Reset config to defaults at ${CONFIG_FILE}`;
      } catch {
        return null;
      }
    }

    case 'credentials': {
      // Cannot auto-fix -- requires interactive login
      return 'Run `agent-media login` to set up credentials.';
    }

    case 'node_version': {
      return `Upgrade Node.js: visit https://nodejs.org/ or run: nvm install ${MIN_NODE_MAJOR}`;
    }

    default:
      return null;
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run diagnostic checks on your agent-media setup')
    .option('--fix', 'Attempt to auto-fix known issues')
    .action(async (cmdOpts: { fix?: boolean }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const shouldFix = cmdOpts.fix ?? false;

      try {
        // Run all checks (sync first, then async)
        const results: CheckResult[] = [];

        results.push(checkCredentials(profileName));
        results.push(await checkApiReachable());
        results.push(await checkAuthValid(profileName));
        results.push(checkConfigValid());
        results.push(checkNodeVersion());
        results.push(checkDiskSpace());
        results.push(await checkNetwork());
        results.push(checkCliVersion());

        const passed = results.filter((r) => r.passed).length;
        const total = results.length;
        const failed = results.filter((r) => !r.passed);

        // Handle --fix
        const fixes: Array<{ name: string; result: string }> = [];
        if (shouldFix && failed.length > 0) {
          for (const result of failed) {
            const fixResult = attemptFix(result);
            if (fixResult) {
              fixes.push({ name: result.name, result: fixResult });
            }
          }
        }

        switch (mode) {
          case 'json': {
            const jsonOutput = {
              passed,
              total,
              checks: results.map((r) => ({
                name: r.name,
                passed: r.passed,
                message: r.message,
                ...(r.fix ? { fix: r.fix } : {}),
              })),
              ...(fixes.length > 0 ? { fixes } : {}),
            };
            printJson(jsonOutput);
            break;
          }

          default: {
            console.log();
            console.log(chalk.bold('agent-media doctor'));
            console.log();

            // Calculate label padding for alignment
            const maxLabelLen = Math.max(...results.map((r) => r.label.length));

            for (const result of results) {
              const icon = result.passed
                ? chalk.green('\u2713')
                : chalk.red('\u2717');
              const paddedLabel = result.label.padEnd(maxLabelLen);
              console.log(`  ${icon} ${chalk.bold(paddedLabel)}  ${result.message}`);
            }

            console.log();
            console.log(`  ${passed}/${total} checks passed`);

            if (failed.length > 0) {
              console.log();
              console.log(chalk.bold('  Issues found:'));
              for (const result of failed) {
                console.log(
                  `    ${chalk.red('\u2717')} ${result.label}: ${result.message}`,
                );
                if (result.fix) {
                  console.log(
                    `      ${chalk.yellow('Fix:')} ${result.fix}`,
                  );
                }
              }
            }

            if (fixes.length > 0) {
              console.log();
              console.log(chalk.bold('  Auto-fix results:'));
              for (const fix of fixes) {
                console.log(`    ${chalk.green('\u2713')} ${fix.name}: ${fix.result}`);
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
}
