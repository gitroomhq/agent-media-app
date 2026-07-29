// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media login` command.
 *
 * Authenticates via the OAuth device-code flow:
 * 1. CLI calls POST /functions/v1/device-token to get a device code.
 * 2. Opens the verification URL in the user's default browser.
 * 3. Polls GET /functions/v1/device-token?code=XXXX every N seconds.
 * 4. On approval, stores the API key in ~/.agent-media/credentials.json.
 *
 * Supports --profile for multi-account, --no-browser to skip auto-open,
 * and --timeout to override the default 5-minute polling window.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { AgentMediaAPI } from '../lib/api.js';
import type { DevicePollResponse } from '../lib/api.js';
import { createSpinner, detectOutputMode, printJson, printQuiet } from '../lib/output.js';
import { saveProfile, resolveProfileName } from '../lib/credentials.js';
import { CLIError, handleError } from '../lib/errors.js';

/** Default polling timeout in milliseconds (5 minutes). */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate via browser (OAuth device flow)')
    .option('--no-browser', 'Print the URL instead of opening a browser')
    .option('--timeout <seconds>', 'Polling timeout in seconds (default: 300)', '300')
    .action(async (cmdOpts: { browser: boolean; timeout: string }) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);
      const timeoutMs = Math.min(
        parseInt(cmdOpts.timeout, 10) * 1000 || DEFAULT_TIMEOUT_MS,
        10 * 60 * 1000, // Hard cap at 10 minutes
      );

      try {
        // Step 1: Initiate device flow
        const spinner = createSpinner('Initiating device login...');
        if (mode === 'human') spinner.start();

        const device = await AgentMediaAPI.initiateDeviceFlow();

        if (mode === 'human') {
          spinner.stop();
          console.log();
          console.log(
            chalk.bold('  Open this URL in your browser to authenticate:'),
          );
          console.log();
          console.log(`  ${chalk.cyan.underline(device.verification_url)}`);
          console.log();
          console.log(
            `  Your code: ${chalk.bold.yellow(device.user_code)}`,
          );
          console.log();
          console.log(
            `  Confirmation code: ${chalk.bold.yellow(device.confirmation_code)}`,
          );
          console.log();
        }

        // Step 2: Auto-open browser (unless --no-browser)
        if (cmdOpts.browser) {
          try {
            const open = (await import('open')).default;
            await open(device.verification_url);
            if (mode === 'human') {
              console.log(
                chalk.dim('  Browser opened automatically. Waiting for approval...'),
              );
              console.log();
            }
          } catch {
            if (mode === 'human') {
              console.log(
                chalk.dim('  Could not open browser. Please open the URL manually.'),
              );
              console.log();
            }
          }
        }

        // Step 3: Poll for approval
        if (mode === 'human') {
          spinner.text = 'Waiting for browser approval...';
          spinner.start();
        }

        const pollInterval = (device.interval || 3) * 1000;
        const deadline = Date.now() + timeoutMs;
        let result: DevicePollResponse | null = null;

        while (Date.now() < deadline) {
          await sleep(pollInterval);

          const poll = await AgentMediaAPI.pollDeviceToken(device.device_code);

          if (poll.status === 'approved' && poll.api_key) {
            result = poll;
            break;
          }

          if (poll.status === 'expired') {
            if (mode === 'human') spinner.fail('Device code expired.');
            throw new CLIError('Device code expired before approval.', {
              code: 'DEVICE_CODE_EXPIRED',
              suggestion: 'Run `agent-media login` to try again.',
            });
          }

          // Still pending -- continue polling
        }

        if (!result || !result.api_key) {
          if (mode === 'human') spinner.fail('Login timed out.');
          throw new CLIError('Login timed out waiting for browser approval.', {
            code: 'LOGIN_TIMEOUT',
            suggestion: 'Run `agent-media login` to try again.',
          });
        }

        // Step 4: Save credentials
        saveProfile(profileName, {
          apiKey: result.api_key,
          email: '',
          userId: result.user_id ?? '',
          createdAt: new Date().toISOString(),
        });

        // Step 5: Output
        switch (mode) {
          case 'json':
            printJson({
              success: true,
              profile: profileName,
              userId: result.user_id ?? null,
            });
            break;

          case 'quiet':
            printQuiet('authenticated');
            break;

          default:
            spinner.succeed(
              chalk.green(
                `Logged in successfully` +
                  (profileName !== 'default'
                    ? ` (profile: ${profileName})`
                    : ''),
              ),
            );
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
