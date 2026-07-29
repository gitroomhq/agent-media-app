// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media credits` command group.
 *
 * Displays the authenticated user's credit balance with a breakdown
 * of monthly remaining, purchased, and total credits. Shows plan tier
 * context and uses color-coded output to indicate credit health.
 *
 * Subcommands:
 * - `agent-media credits` (default) -- show balance
 * - `agent-media credits estimate <model>` -- estimate cost for a generation
 * - `agent-media credits history` -- show credit transaction history
 *
 * Requires a valid API key. If not logged in, prompts the user to
 * authenticate via `agent-media login`.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI, type CreditTransaction, type UpdateAutoTopUpConfigParams } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

/** Valid transaction types for the --type filter. */
const VALID_TRANSACTION_TYPES = ['debit', 'credit', 'refund', 'reset'];

/**
 * Thresholds for credit health color coding (as a fraction of monthly allowance).
 */
const LOW_THRESHOLD = 0.2;
const ZERO_THRESHOLD = 0;

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

export function registerCreditsCommand(program: Command): void {
  const creditsCmd = program
    .command('credits')
    .description('Show credit balance and usage')
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
        const spinner = createSpinner('Fetching credit balance...');
        if (mode === 'human') spinner.start();

        const api = new AgentMediaAPI(apiKey);
        const data = await api.getCredits();

        if (mode === 'human') spinner.stop();

        const monthlyRemaining = data.credits.monthly_remaining;
        const monthlyAllowance = data.credits.monthly_allowance ?? monthlyRemaining;
        const purchased = data.credits.purchased;
        const total = data.credits.total;
        const planTier = data.plan.tier;

        switch (mode) {
          case 'json':
            printJson({
              monthly_remaining: monthlyRemaining,
              monthly_allowance: monthlyAllowance,
              purchased,
              total,
              plan_tier: planTier,
            });
            break;

          case 'quiet':
            printQuiet(String(total));
            break;

          default: {
            // Determine color based on credit health
            const ratio = monthlyAllowance > 0
              ? monthlyRemaining / monthlyAllowance
              : 0;

            const creditColor =
              monthlyRemaining <= ZERO_THRESHOLD
                ? chalk.red
                : ratio <= LOW_THRESHOLD
                  ? chalk.yellow
                  : chalk.green;

            const planLabel = planTier.charAt(0).toUpperCase() + planTier.slice(1);

            console.log();
            console.log(chalk.bold('  Credit Balance'));
            console.log();
            console.log(
              `  ${chalk.bold('Plan:')}       ${planLabel} plan`,
            );
            console.log(
              `  ${chalk.bold('Monthly:')}    ${creditColor(`${monthlyRemaining}`)} / ${monthlyAllowance} remaining`,
            );
            console.log(
              `  ${chalk.bold('Purchased:')}  ${purchased}`,
            );
            console.log(
              `  ${chalk.bold('Total:')}      ${creditColor(String(total))}`,
            );
            console.log();

            // Contextual summary line
            console.log(
              chalk.dim(
                `  ${planLabel} plan: ${monthlyRemaining}/${monthlyAllowance} monthly` +
                  (purchased > 0 ? ` + ${purchased} purchased` : ''),
              ),
            );
            console.log();
            break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // ── agent-media credits history ───────────────────────────────────────────
  creditsCmd
    .command('history')
    .description('Show credit transaction history')
    .option('-n, --limit <n>', 'Number of transactions to show', '20')
    .option('-t, --type <type>', 'Filter by type: debit, credit, refund, reset')
    .action(
      async (cmdOpts: { limit?: string; type?: string }) => {
        const globalOpts = program.opts<{
          json?: boolean;
          quiet?: boolean;
          profile?: string;
        }>();
        const mode = detectOutputMode(globalOpts);
        const profileName = resolveProfileName(globalOpts.profile);
        const apiKey = requireAuth(profileName);

        // Validate --type flag
        if (cmdOpts.type && !VALID_TRANSACTION_TYPES.includes(cmdOpts.type)) {
          throw new CLIError(`Invalid transaction type: ${cmdOpts.type}`, {
            code: 'INVALID_ARGUMENT',
            suggestion: `Valid types: ${VALID_TRANSACTION_TYPES.join(', ')}`,
          });
        }

        // Parse --limit flag
        const limit = parseInt(cmdOpts.limit ?? '20', 10);
        if (isNaN(limit) || limit < 1) {
          throw new CLIError('--limit must be a positive integer.', {
            code: 'INVALID_ARGUMENT',
            suggestion: 'Provide a number greater than 0.',
          });
        }

        try {
          const spinner = createSpinner('Fetching credit history...');
          if (mode === 'human') spinner.start();

          const api = new AgentMediaAPI(apiKey);
          const transactions = await api.getCreditHistory({
            limit,
            type: cmdOpts.type,
          });

          if (mode === 'human') spinner.stop();

          // ── Empty state ──────────────────────────────────────────
          if (transactions.length === 0) {
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
                  chalk.dim('  No credit transactions found.'),
                );
                console.log();
                break;
            }
            return;
          }

          // ── Output ───────────────────────────────────────────────
          switch (mode) {
            case 'json':
              printJson(transactions);
              break;

            case 'quiet':
              printQuiet(
                transactions.map(
                  (tx) => `${tx.type}\t${tx.amount}\t${tx.description}`,
                ),
              );
              break;

            default:
              printCreditHistoryTable(transactions, cmdOpts.type);
              break;
          }
        } catch (error: unknown) {
          handleError(error);
        }
      },
    );

  // ── agent-media credits topup ─────────────────────────────────────────────
  const VALID_PACKS = new Set(['pack_3900']);
  const PACK_LABELS: Record<string, string> = {
    pack_3900: '3,900 credits ($39)',
  };

  creditsCmd
    .command('topup')
    .description('Manage auto-top-up settings for credits')
    .option('--enable', 'Enable auto-top-up')
    .option('--disable', 'Disable auto-top-up')
    .option('--threshold <credits>', 'Set credit threshold (min: 10)')
    .option('--pack <slug>', 'Set pack: pack_3900')
    .option('--max <count>', 'Set max monthly top-ups (1-10)')
    .action(
      async (cmdOpts: {
        enable?: boolean;
        disable?: boolean;
        threshold?: string;
        pack?: string;
        max?: string;
      }) => {
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

          // Determine if this is a read or write operation
          const hasUpdates =
            cmdOpts.enable !== undefined ||
            cmdOpts.disable !== undefined ||
            cmdOpts.threshold !== undefined ||
            cmdOpts.pack !== undefined ||
            cmdOpts.max !== undefined;

          if (hasUpdates) {
            // Build the update payload
            const updates: UpdateAutoTopUpConfigParams = {};

            if (cmdOpts.enable) {
              updates.enabled = true;
            }
            if (cmdOpts.disable) {
              updates.enabled = false;
            }

            if (cmdOpts.threshold !== undefined) {
              const threshold = parseInt(cmdOpts.threshold, 10);
              if (isNaN(threshold) || threshold < 10) {
                throw new CLIError('Threshold must be an integer >= 10.', {
                  code: 'INVALID_THRESHOLD',
                  suggestion: 'Example: agent-media credits topup --threshold 50',
                });
              }
              updates.threshold_credits = threshold;
            }

            if (cmdOpts.pack !== undefined) {
              if (!VALID_PACKS.has(cmdOpts.pack)) {
                throw new CLIError(
                  `Invalid pack slug: ${cmdOpts.pack}`,
                  {
                    code: 'INVALID_PACK',
                    suggestion: `Valid packs: ${[...VALID_PACKS].join(', ')}`,
                  },
                );
              }
              updates.pack_slug = cmdOpts.pack;
            }

            if (cmdOpts.max !== undefined) {
              const max = parseInt(cmdOpts.max, 10);
              if (isNaN(max) || max < 1 || max > 10) {
                throw new CLIError('Max monthly top-ups must be between 1 and 10.', {
                  code: 'INVALID_MAX_MONTHLY',
                  suggestion: 'Example: agent-media credits topup --max 3',
                });
              }
              updates.max_monthly_topups = max;
            }

            const spinner = createSpinner('Updating auto-top-up settings...');
            if (mode === 'human') spinner.start();

            const config = await api.updateAutoTopUpConfig(updates);

            if (mode === 'human') spinner.stop();

            switch (mode) {
              case 'json':
                printJson({
                  enabled: config.enabled,
                  threshold_credits: config.threshold_credits,
                  pack_slug: config.pack_slug,
                  max_monthly_topups: config.max_monthly_topups,
                  updated_at: config.updated_at,
                });
                break;

              case 'quiet':
                printQuiet(config.enabled ? 'enabled' : 'disabled');
                break;

              default:
                console.log();
                console.log(chalk.green('  Auto-top-up settings updated.'));
                console.log();
                printTopUpConfig(config.enabled, config.threshold_credits, config.pack_slug, config.max_monthly_topups);
                break;
            }
          } else {
            // Read-only: show current config
            const spinner = createSpinner('Fetching auto-top-up settings...');
            if (mode === 'human') spinner.start();

            const config = await api.getAutoTopUpConfig();

            if (mode === 'human') spinner.stop();

            switch (mode) {
              case 'json':
                printJson({
                  enabled: config.enabled,
                  threshold_credits: config.threshold_credits,
                  pack_slug: config.pack_slug,
                  max_monthly_topups: config.max_monthly_topups,
                  updated_at: config.updated_at,
                });
                break;

              case 'quiet':
                printQuiet(config.enabled ? 'enabled' : 'disabled');
                break;

              default:
                console.log();
                console.log(chalk.bold('  Auto Top-Up Configuration'));
                console.log();
                printTopUpConfig(config.enabled, config.threshold_credits, config.pack_slug, config.max_monthly_topups);
                break;
            }
          }
        } catch (error: unknown) {
          handleError(error);
        }
      },
    );

  /** Color coding for transaction types. */
  const TX_TYPE_COLORS: Record<string, (text: string) => string> = {
    debit: chalk.red,
    credit: chalk.green,
    refund: chalk.yellow,
    reset: chalk.blue,
  };

  /**
   * Pad or truncate a string to an exact fixed width for column alignment.
   * Strips ANSI codes when measuring length.
   */
  function fixedWidth(str: string, width: number): string {
    const stripped = str.replace(
      // eslint-disable-next-line no-control-regex
      /\x1B\[[0-9;]*m/g,
      '',
    );
    if (stripped.length >= width) return str;
    return str + ' '.repeat(width - stripped.length);
  }

  /**
   * Format a date string into a short human-readable label (e.g., "Feb 17").
   */
  function formatShortDate(dateStr: string): string {
    const date = new Date(dateStr);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return `${months[date.getMonth()]} ${date.getDate().toString().padStart(2, ' ')}`;
  }

  /**
   * Format a credit amount with sign and alignment.
   */
  function formatAmount(amount: number): string {
    if (amount > 0) return chalk.green(`+${amount}`);
    if (amount < 0) return chalk.red(String(amount));
    return chalk.dim('0');
  }

  /**
   * Print a formatted table of credit transactions.
   */
  function printCreditHistoryTable(
    transactions: CreditTransaction[],
    typeFilter?: string,
  ): void {
    const COL_DATE = 10;
    const COL_TYPE = 10;
    const COL_AMOUNT = 10;

    const header =
      fixedWidth('DATE', COL_DATE) +
      fixedWidth('TYPE', COL_TYPE) +
      fixedWidth('AMOUNT', COL_AMOUNT) +
      'DESCRIPTION';

    const separator =
      '\u2500'.repeat(COL_DATE) +
      '\u2500'.repeat(COL_TYPE) +
      '\u2500'.repeat(COL_AMOUNT) +
      '\u2500'.repeat(30);

    console.log();
    console.log(chalk.bold('  Credit History'));
    console.log();
    console.log(`  ${chalk.bold(header)}`);
    console.log(`  ${chalk.dim(separator)}`);

    for (const tx of transactions) {
      const dateCol = fixedWidth(formatShortDate(tx.created_at), COL_DATE);
      const colorize = TX_TYPE_COLORS[tx.type] ?? chalk.white;
      const typeCol = fixedWidth(colorize(tx.type.toUpperCase()), COL_TYPE);
      const amountCol = fixedWidth(formatAmount(tx.amount), COL_AMOUNT);
      const desc = tx.description;

      console.log(`  ${dateCol}${typeCol}${amountCol}${desc}`);
    }

    console.log();

    // Summary line
    const filterStr = typeFilter ? ` (filtered: type=${typeFilter})` : '';
    console.log(
      chalk.dim(`  Showing ${transactions.length} transactions${filterStr}`),
    );
    console.log();
  }

  /** Helper: print human-readable auto-top-up config. */
  function printTopUpConfig(
    enabled: boolean,
    threshold: number,
    packSlug: string,
    maxMonthly: number,
  ): void {
    const statusColor = enabled ? chalk.green : chalk.red;
    const statusLabel = enabled ? 'Enabled' : 'Disabled';
    const packLabel = PACK_LABELS[packSlug] ?? packSlug;

    console.log(
      `  ${chalk.bold('Status:')}     ${statusColor(statusLabel)}`,
    );
    console.log(
      `  ${chalk.bold('Threshold:')}  ${threshold} credits`,
    );
    console.log(
      `  ${chalk.bold('Pack:')}       ${packLabel}`,
    );
    console.log(
      `  ${chalk.bold('Max/month:')}  ${maxMonthly}`,
    );
    console.log();

    if (!enabled) {
      console.log(
        chalk.dim(
          '  Enable with: agent-media credits topup --enable',
        ),
      );
      console.log();
    }
  }
}
