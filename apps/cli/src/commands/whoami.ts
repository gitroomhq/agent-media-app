// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media whoami` command.
 *
 * Shows the authenticated user's identity, subscription plan,
 * and credit balances. Requires a valid API key.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../lib/output.js';
import { getApiKey, getProfile, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

export function registerWhoAmICommand(program: Command): void {
  program
    .command('whoami')
    .description('Show current user, plan, and credit balances')
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
          suggestion: 'Run `agent-media login` to authenticate.',
        });
      }

      try {
        const spinner = createSpinner('Fetching account info...');
        if (mode === 'human') spinner.start();

        const api = new AgentMediaAPI(apiKey);
        const data = await api.whoami();
        const profile = getProfile(profileName);

        if (mode === 'human') spinner.stop();

        const email = profile?.email ?? 'unknown';

        switch (mode) {
          case 'json':
            printJson(data);
            break;

          case 'quiet':
            printQuiet(email);
            break;

          default: {
            console.log();
            console.log(
              `  ${chalk.bold('User:')}     ${email}`,
            );
            console.log(
              `  ${chalk.bold('ID:')}       ${chalk.dim(data.user_id)}`,
            );

            const tier = data.plan.tier;
            const planColor =
              tier === 'pro' || tier === 'pro_plus'
                ? chalk.magenta
                : tier === 'creator'
                  ? chalk.blue
                  : tier === 'starter'
                    ? chalk.green
                    : chalk.dim;

            console.log(
              `  ${chalk.bold('Plan:')}     ${planColor(data.plan.name)}` +
                ` (${data.plan.status})`,
            );
            if (data.plan.current_period_end) {
              console.log(
                `  ${chalk.bold('Period:')}   ends ${data.plan.current_period_end}`,
              );
            }

            console.log();
            console.log(chalk.bold('  Credits'));
            console.log(
              `    Monthly:   ${data.credits.monthly_remaining}`,
            );
            console.log(
              `    Purchased: ${data.credits.purchased}`,
            );
            console.log(
              `    ${chalk.bold('Total:')}     ${chalk.cyan(String(data.credits.total))}`,
            );

            console.log();
            console.log(chalk.bold('  Limits'));
            console.log(
              `    Max concurrent jobs:  ${data.limits.max_concurrent_jobs}`,
            );
            console.log(
              `    Max video duration:   ${data.limits.max_video_duration}s`,
            );
            console.log(
              `    Available models:     ${data.limits.models_available.length}`,
            );
            console.log();
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
