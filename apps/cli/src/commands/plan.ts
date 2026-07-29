// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media plan` command.
 *
 * Displays the authenticated user's subscription plan details including
 * plan name, status, pricing, features, and trial information. Provides
 * a link to the billing portal for plan upgrades.
 *
 * Requires a valid API key. If not logged in, prompts the user to
 * authenticate via `agent-media login`.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

const BILLING_URL = 'https://agent-media.ai/billing';

/** Plan feature descriptions keyed by plan slug. */
const PLAN_FEATURES: Record<string, { price: string; features: string[] }> = {
  starter: {
    price: '$39/month',
    features: [
      '3,900 credits/month (~13 at 10s, ~26 at 5s)',
      'All models (up to 10s video)',
      '1080p resolution',
      'No watermark',
      'Email support',
    ],
  },
  creator: {
    price: '$69/month',
    features: [
      '6,900 credits/month (~23 at 10s, ~46 at 5s)',
      'All models (up to 15s video)',
      'Up to 2K resolution',
      'No watermark',
      'Priority support',
      'Priority queue',
    ],
  },
  pro_plus: {
    price: '$129/month',
    features: [
      '12,900 credits/month (~43 at 10s, ~86 at 5s)',
      'All models (up to 15s video)',
      'Up to 2K resolution',
      'No watermark',
      'Priority support',
      'Priority queue',
      'Full API access',
    ],
  },
};

export function registerPlanCommand(program: Command): void {
  program
    .command('plan')
    .description('Show subscription plan details')
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
        const spinner = createSpinner('Fetching plan details...');
        if (mode === 'human') spinner.start();

        const api = new AgentMediaAPI(apiKey);
        const data = await api.getCredits();

        if (mode === 'human') spinner.stop();

        const planSlug = data.plan.tier;
        const planLabel = data.plan.name;
        const status = data.plan.status;
        const periodEnd = data.plan.current_period_end;
        const planInfo = PLAN_FEATURES[planSlug];

        const isTrial = data.plan.trial_active;

        switch (mode) {
          case 'json':
            printJson({
              plan: planSlug,
              plan_label: planLabel,
              status,
              price: planInfo?.price ?? 'Unknown',
              features: planInfo?.features ?? [],
              period_end: periodEnd,
              is_trial: isTrial,
              monthly_remaining: data.credits.monthly_remaining,
              purchased: data.credits.purchased,
              total: data.credits.total,
              upgrade_url: BILLING_URL,
            });
            break;

          case 'quiet':
            printQuiet(planSlug);
            break;

          default: {
            const planColor =
              planSlug === 'pro' || planSlug === 'pro_plus'
                ? chalk.magenta
                : planSlug === 'creator'
                  ? chalk.blue
                  : planSlug === 'starter'
                    ? chalk.green
                    : chalk.dim;

            console.log();
            console.log(chalk.bold('  Subscription Plan'));
            console.log();
            console.log(
              `  ${chalk.bold('Plan:')}      ${planColor(planLabel)}`,
            );
            console.log(
              `  ${chalk.bold('Status:')}    ${status}`,
            );
            console.log(
              `  ${chalk.bold('Price:')}     ${planInfo?.price ?? 'Unknown'}`,
            );
            if (periodEnd) {
              console.log(
                `  ${chalk.bold('Period:')}    ends ${periodEnd}`,
              );
            }
            console.log(
              `  ${chalk.bold('Credits:')}   ${data.credits.total} total (${data.credits.monthly_remaining} monthly + ${data.credits.purchased} purchased)`,
            );

            if (isTrial) {
              console.log();
              console.log(
                chalk.yellow(`  Trial ends: ${data.plan.trial_ends_at}`),
              );
            }

            // Features list
            if (planInfo?.features.length) {
              console.log();
              console.log(chalk.bold('  Features'));
              for (const feature of planInfo.features) {
                console.log(`    ${chalk.green('\u2713')} ${feature}`);
              }
            }

            console.log();
            console.log(
              chalk.dim(`  To change your plan, visit: ${chalk.underline(BILLING_URL)}`),
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
