// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media subscribe` command.
 *
 * Interactive command for purchasing subscription plans and credit packs.
 * Opens Stripe Checkout in the user's browser.
 *
 * Usage:
 *   agent-media subscribe              # Interactive menu
 *   agent-media subscribe --plan starter
 *   agent-media subscribe --credits 500
 *   agent-media subscribe --manage     # Opens Stripe Customer Portal
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
import { AgentMediaAPI, type WhoAmIResponse } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

/** Available subscription plans. */
const PLANS = [
  { tier: 'starter', name: 'Creator', price: '$39/mo', credits: '3,900 credits/mo' },
  { tier: 'creator', name: 'Pro', price: '$69/mo', credits: '6,900 credits/mo' },
  { tier: 'pro_plus', name: 'Pro+', price: '$129/mo', credits: '12,900 credits/mo' },
] as const;

/** Available credit packs. */
const CREDIT_PACKS = [
  { packId: 'pack_3900', credits: 3900, price: '$39.00' },
] as const;

/**
 * Ask a question on stdin and return the trimmed answer.
 */
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Open a URL in the user's default browser.
 */
async function openInBrowser(url: string): Promise<void> {
  try {
    const open = (await import('open')).default;
    await open(url);
  } catch {
    // Silently fail if browser can't be opened
  }
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Poll `whoami()` until a subscription change is detected or timeout.
 */
async function waitForSubscription(
  api: AgentMediaAPI,
  before: WhoAmIResponse,
  type: 'plan' | 'credits',
): Promise<WhoAmIResponse | null> {
  const spinner = createSpinner('Waiting for payment confirmation...');
  spinner.start();

  const start = Date.now();
  let aborted = false;

  const onSigint = () => {
    aborted = true;
  };
  process.once('SIGINT', onSigint);

  try {
    while (!aborted && Date.now() - start < POLL_TIMEOUT_MS) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      spinner.text = `Waiting for payment confirmation... ${chalk.dim(`(${elapsed}s)`)}`;

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (aborted) break;

      try {
        const after = await api.whoami();

        if (type === 'plan' && after.plan.tier !== before.plan.tier) {
          spinner.succeed('Payment confirmed!');
          return after;
        }
        if (type === 'credits' && after.credits.purchased > before.credits.purchased) {
          spinner.succeed('Payment confirmed!');
          return after;
        }
      } catch {
        // Network hiccup — keep polling
      }
    }

    spinner.stop();

    if (aborted) {
      console.log();
      console.log(chalk.dim("  Stopped waiting. Run 'agent-media plan' to check your subscription status."));
    } else {
      console.log();
      console.log(chalk.yellow("  Payment may still be processing. Run 'agent-media plan' to check."));
    }

    return null;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

/**
 * Display a success box after subscription activation.
 */
function showConfirmation(after: WhoAmIResponse, type: 'plan' | 'credits', purchasedDelta?: number): void {
  console.log();
  if (type === 'plan') {
    console.log(chalk.green.bold('  ✓ Subscription activated!'));
    console.log();
    console.log(`    Plan:     ${after.plan.name} (${after.plan.status})`);
    console.log(`    Credits:  ${after.credits.monthly_remaining.toLocaleString()}/mo + ${after.credits.purchased.toLocaleString()} purchased`);
    console.log(`    Status:   ${after.plan.status}`);
  } else {
    console.log(chalk.green.bold('  ✓ Credits added!'));
    console.log();
    console.log(`    Purchased: ${after.credits.purchased.toLocaleString()} credits${purchasedDelta ? ` (+${purchasedDelta.toLocaleString()} new)` : ''}`);
    console.log(`    Plan:      ${after.plan.name}`);
  }
  console.log();
  console.log(chalk.dim('  Start generating:'));
  console.log(chalk.dim('    agent-media generate kling3 -p "your prompt"'));
  console.log();
}

export function registerSubscribeCommand(program: Command): void {
  program
    .command('subscribe')
    .description('Subscribe to a plan or buy credits')
    .option('--plan <tier>', 'Subscribe to a plan (starter, creator, pro_plus)')
    .option('--credits <amount>', 'Buy a credit pack (3900)')
    .option('--manage', 'Open Stripe Customer Portal to manage subscription')
    .action(
      async (cmdOpts: {
        plan?: string;
        credits?: string;
        manage?: boolean;
      }) => {
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
          const api = new AgentMediaAPI(apiKey);

          // ── --manage: Open Stripe Portal ──────────────────────────────
          if (cmdOpts.manage) {
            const spinner = createSpinner('Opening billing portal...');
            if (mode === 'human') spinner.start();

            const { portal_url } = await api.createPortalSession();

            if (mode === 'human') {
              spinner.succeed('Billing portal opened');
              console.log();
              console.log(`  ${chalk.cyan.underline(portal_url)}`);
              console.log();
            }

            if (mode === 'json') {
              printJson({ portal_url });
            } else if (mode === 'quiet') {
              printQuiet(portal_url);
            }

            await openInBrowser(portal_url);
            return;
          }

          // ── --plan: Direct plan subscription ──────────────────────────
          if (cmdOpts.plan) {
            const tier = cmdOpts.plan.toLowerCase();
            const plan = PLANS.find((p) => p.tier === tier);
            if (!plan) {
              throw new CLIError(`Unknown plan: ${cmdOpts.plan}`, {
                code: 'INVALID_ARGUMENT',
                suggestion: `Valid plans: ${PLANS.map((p) => p.tier).join(', ')}`,
              });
            }

            const spinner = createSpinner(`Creating checkout for ${plan.name}...`);
            if (mode === 'human') spinner.start();

            const checkoutResult = await api.createPlanCheckout(tier);

            // Server returns { upgraded: true } when the user already has an
            // active subscription and it was changed in-place (no checkout needed).
            if (checkoutResult.upgraded) {
              if (mode === 'human') {
                spinner.succeed(`Upgraded to ${plan.name}`);
                console.log();
                console.log(chalk.green('  Your subscription has been upgraded.'));
                console.log();
              }
              if (mode === 'json') {
                printJson({ upgraded: true, plan: tier });
              }
              return;
            }

            const { checkout_url } = checkoutResult;

            if (!checkout_url) {
              if (mode === 'human') spinner.fail('Failed to create checkout session');
              throw new CLIError('No checkout URL returned', {
                code: 'CHECKOUT_FAILED',
                suggestion: 'Try again or visit https://agent-media.ai/billing',
              });
            }

            if (mode === 'human') {
              spinner.succeed(`Checkout ready for ${plan.name}`);
              console.log();
              console.log(chalk.bold('  Complete payment in your browser:'));
              console.log(`  ${chalk.cyan.underline(checkout_url)}`);
              console.log();
            }

            if (mode === 'json') {
              printJson({ checkout_url, plan: tier });
            } else if (mode === 'quiet') {
              printQuiet(checkout_url);
            }

            const beforePlan = await api.whoami();
            await openInBrowser(checkout_url);

            if (mode === 'human') {
              const after = await waitForSubscription(api, beforePlan, 'plan');
              if (after) showConfirmation(after, 'plan');
            }
            return;
          }

          // ── --credits: Direct credit pack purchase ────────────────────
          if (cmdOpts.credits) {
            const amount = parseInt(cmdOpts.credits, 10);
            const pack = CREDIT_PACKS.find((p) => p.credits === amount);
            if (!pack) {
              throw new CLIError(`Unknown credit amount: ${cmdOpts.credits}`, {
                code: 'INVALID_ARGUMENT',
                suggestion: `Valid amounts: ${CREDIT_PACKS.map((p) => p.credits).join(', ')}`,
              });
            }

            const spinner = createSpinner(`Creating checkout for ${pack.credits} credits...`);
            if (mode === 'human') spinner.start();

            const paygResult = await api.createPaygCheckout(pack.packId);
            const checkout_url = paygResult.checkout_url;

            if (!checkout_url) {
              if (mode === 'human') spinner.fail('Failed to create checkout session');
              throw new CLIError('No checkout URL returned', {
                code: 'CHECKOUT_FAILED',
                suggestion: 'Try again or visit https://agent-media.ai/billing',
              });
            }

            if (mode === 'human') {
              spinner.succeed(`Checkout ready for ${pack.credits} credits`);
              console.log();
              console.log(chalk.bold('  Complete payment in your browser:'));
              console.log(`  ${chalk.cyan.underline(checkout_url)}`);
              console.log();
            }

            if (mode === 'json') {
              printJson({ checkout_url, credits: pack.credits });
            } else if (mode === 'quiet') {
              printQuiet(checkout_url);
            }

            const beforeCredits = await api.whoami();
            await openInBrowser(checkout_url);

            if (mode === 'human') {
              const after = await waitForSubscription(api, beforeCredits, 'credits');
              if (after) {
                const delta = after.credits.purchased - beforeCredits.credits.purchased;
                showConfirmation(after, 'credits', delta);
              }
            }
            return;
          }

          // ── Interactive mode ──────────────────────────────────────────
          if (mode !== 'human') {
            throw new CLIError('Interactive mode requires a terminal.', {
              code: 'NOT_INTERACTIVE',
              suggestion: 'Use --plan, --credits, or --manage flags.',
            });
          }

          // Show current plan
          const whoamiSpinner = createSpinner('Fetching account info...');
          whoamiSpinner.start();
          const info = await api.whoami();
          whoamiSpinner.stop();

          console.log();
          console.log(chalk.bold('  Current Plan'));
          console.log(
            `  ${info.plan.name} (${info.credits.total} credits available)`,
          );
          console.log();

          // Show menu
          console.log(chalk.bold('  What would you like to do?'));
          console.log();
          console.log('  1) Subscribe to a plan');
          console.log('  2) Buy credits');
          console.log('  3) Manage subscription (Stripe portal)');
          console.log('  4) Cancel');
          console.log();

          const choice = await ask('  Choose [1-4]: ');

          if (choice === '4' || choice === '') {
            console.log(chalk.dim('  Cancelled.'));
            return;
          }

          if (choice === '3') {
            const spinner = createSpinner('Opening billing portal...');
            spinner.start();
            const { portal_url } = await api.createPortalSession();
            spinner.succeed('Billing portal opened');
            console.log();
            console.log(`  ${chalk.cyan.underline(portal_url)}`);
            console.log();
            await openInBrowser(portal_url);
            return;
          }

          if (choice === '1') {
            // Plan selection
            console.log();
            console.log(chalk.bold('  Available Plans'));
            console.log();
            for (let i = 0; i < PLANS.length; i++) {
              const p = PLANS[i]!;
              console.log(
                `  ${i + 1}) ${chalk.cyan(p.name.padEnd(12))} ${p.price.padEnd(10)} ${chalk.dim(p.credits)}`,
              );
            }
            console.log();

            const planChoice = await ask('  Choose plan [1-3]: ');
            const planIdx = parseInt(planChoice, 10) - 1;
            const selectedPlan = PLANS[planIdx];

            if (!selectedPlan) {
              console.log(chalk.dim('  Cancelled.'));
              return;
            }

            const spinner = createSpinner(`Creating checkout for ${selectedPlan.name}...`);
            spinner.start();
            const planResult = await api.createPlanCheckout(selectedPlan.tier);

            if (planResult.upgraded) {
              spinner.succeed(`Upgraded to ${selectedPlan.name}`);
              console.log();
              console.log(chalk.green('  Your subscription has been upgraded.'));
              console.log();
              return;
            }

            if (!planResult.checkout_url) {
              spinner.fail('Failed to create checkout session');
              throw new CLIError('No checkout URL returned', {
                code: 'CHECKOUT_FAILED',
                suggestion: 'Try again or visit https://agent-media.ai/billing',
              });
            }

            spinner.succeed(`Checkout ready for ${selectedPlan.name}`);
            console.log();
            console.log(chalk.bold('  Complete payment in your browser:'));
            console.log(`  ${chalk.cyan.underline(planResult.checkout_url)}`);
            console.log();

            const beforeInteractivePlan = await api.whoami();
            await openInBrowser(planResult.checkout_url);
            const afterPlan = await waitForSubscription(api, beforeInteractivePlan, 'plan');
            if (afterPlan) showConfirmation(afterPlan, 'plan');
            return;
          }

          if (choice === '2') {
            // Credit pack selection
            console.log();
            console.log(chalk.bold('  Credit Packs'));
            console.log();
            for (let i = 0; i < CREDIT_PACKS.length; i++) {
              const p = CREDIT_PACKS[i]!;
              console.log(
                `  ${i + 1}) ${chalk.yellow(String(p.credits).padEnd(8))} credits   ${p.price}`,
              );
            }
            console.log();

            const packChoice = await ask('  Choose pack [1-4]: ');
            const packIdx = parseInt(packChoice, 10) - 1;
            const selectedPack = CREDIT_PACKS[packIdx];

            if (!selectedPack) {
              console.log(chalk.dim('  Cancelled.'));
              return;
            }

            const spinner = createSpinner(`Creating checkout for ${selectedPack.credits} credits...`);
            spinner.start();
            const paygInteractiveResult = await api.createPaygCheckout(selectedPack.packId);

            if (!paygInteractiveResult.checkout_url) {
              spinner.fail('Failed to create checkout session');
              throw new CLIError('No checkout URL returned', {
                code: 'CHECKOUT_FAILED',
                suggestion: 'Try again or visit https://agent-media.ai/billing',
              });
            }

            spinner.succeed(`Checkout ready for ${selectedPack.credits} credits`);
            console.log();
            console.log(chalk.bold('  Complete payment in your browser:'));
            console.log(`  ${chalk.cyan.underline(paygInteractiveResult.checkout_url)}`);
            console.log();

            const beforeInteractiveCredits = await api.whoami();
            await openInBrowser(paygInteractiveResult.checkout_url);
            const afterCredits = await waitForSubscription(api, beforeInteractiveCredits, 'credits');
            if (afterCredits) {
              const delta = afterCredits.credits.purchased - beforeInteractiveCredits.credits.purchased;
              showConfirmation(afterCredits, 'credits', delta);
            }
            return;
          }

          console.log(chalk.dim('  Invalid choice.'));
        } catch (error: unknown) {
          handleError(error);
        }
      },
    );
}
