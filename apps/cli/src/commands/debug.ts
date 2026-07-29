// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media debug` command group.
 *
 * Provides deep-inspection subcommands for troubleshooting generation
 * jobs and credit balances. Intended for power users and support
 * engineers who need to trace the full lifecycle of a job or verify
 * credit consistency.
 *
 * Subcommands:
 *   debug job <job-id>  - Fetch job details, credit transactions,
 *                         webhook history, and dead-letter entries.
 *                         Renders a chronological timeline.
 *   debug credits       - Fetch balance, transactions, and run a
 *                         client-side reconciliation check.
 *
 * Both subcommands support --json and --quiet output modes.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the authenticated API client or throw.
 */
function resolveApi(profileName: string): AgentMediaAPI {
  const apiKey = getApiKey(profileName);
  if (!apiKey) {
    throw new CLIError('Not authenticated', {
      code: 'AUTH_REQUIRED',
      suggestion: 'Run `agent-media login` to authenticate.',
    });
  }
  return new AgentMediaAPI(apiKey);
}

/**
 * Format an ISO timestamp to a concise local string.
 */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a relative duration from an ISO timestamp.
 */
function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Return a colored status label for a job status.
 */
function colorStatus(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green(status);
    case 'failed':
    case 'canceled':
      return chalk.red(status);
    case 'processing':
    case 'submitted':
      return chalk.yellow(status);
    default:
      return chalk.dim(status);
  }
}

// ── Subcommand: debug job ──────────────────────────────────────────────────────

async function debugJob(
  jobId: string,
  profileName: string,
  mode: 'human' | 'json' | 'quiet',
): Promise<void> {
  const api = resolveApi(profileName);
  const info = await api.getJobDebugInfo(jobId);

  // ── JSON mode ──────────────────────────────────────────────────────────────
  if (mode === 'json') {
    printJson(info);
    return;
  }

  // ── Quiet mode ─────────────────────────────────────────────────────────────
  if (mode === 'quiet') {
    printQuiet(info.job.id);
    return;
  }

  // ── Human mode: render timeline ────────────────────────────────────────────
  const { job, transactions, webhookHistory, deadLetterEntries } = info;

  console.log();
  console.log(chalk.bold(`  Job Debug: ${chalk.cyan(job.id)}`));
  console.log();

  // Job summary
  console.log(chalk.dim('  ─── Job Details ───────────────────────────────────'));
  console.log(`  Status:      ${colorStatus(job.status)}`);
  console.log(`  Model:       ${chalk.white(job.model_slug)}`);
  console.log(`  Operation:   ${job.operation}`);
  console.log(`  Credits:     ${chalk.yellow(String(job.credit_cost))} charged${job.credits_refunded ? chalk.green(' (refunded)') : ''}`);
  if (job.provider_slug) {
    console.log(`  Provider:    ${job.provider_slug}`);
  }
  if (job.provider_job_id) {
    console.log(`  Provider ID: ${chalk.dim(job.provider_job_id)}`);
  }
  if (job.error_message) {
    console.log(`  Error:       ${chalk.red(job.error_message)}`);
  }
  if (job.error_code) {
    console.log(`  Error Code:  ${chalk.dim(job.error_code)}`);
  }
  console.log(`  Created:     ${fmtTime(job.created_at)} (${fmtRelative(job.created_at)})`);
  if (job.started_at) {
    console.log(`  Started:     ${fmtTime(job.started_at)}`);
  }
  if (job.completed_at) {
    console.log(`  Completed:   ${fmtTime(job.completed_at)}`);
  }

  // Timeline: merge and sort all events chronologically
  interface TimelineEvent {
    time: string;
    type: string;
    label: string;
    detail: string;
  }

  const events: TimelineEvent[] = [];

  // Job lifecycle events
  events.push({
    time: job.created_at,
    type: 'job',
    label: 'Job Created',
    detail: `${job.operation} on ${job.model_slug}`,
  });

  if (job.started_at) {
    events.push({
      time: job.started_at,
      type: 'job',
      label: 'Processing Started',
      detail: job.provider_slug ?? 'unknown provider',
    });
  }

  if (job.completed_at) {
    events.push({
      time: job.completed_at,
      type: 'job',
      label: job.status === 'completed' ? 'Completed' : `Ended (${job.status})`,
      detail: job.error_message ?? 'Success',
    });
  }

  // Credit transactions
  for (const tx of transactions) {
    events.push({
      time: tx.created_at,
      type: 'credit',
      label: `Credit ${tx.type}`,
      detail: `${tx.amount > 0 ? '+' : ''}${tx.amount} credits: ${tx.description}`,
    });
  }

  // Webhook events
  for (const wh of webhookHistory) {
    events.push({
      time: wh.created_at,
      type: 'webhook',
      label: `Webhook: ${wh.event}`,
      detail: wh.status,
    });
  }

  // Dead letter entries
  for (const dl of deadLetterEntries) {
    events.push({
      time: dl.created_at,
      type: 'dead-letter',
      label: 'Dead Letter',
      detail: `${dl.error} (${dl.attempts} attempts)`,
    });
  }

  // Sort chronologically
  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (events.length > 0) {
    console.log();
    console.log(chalk.dim('  ─── Timeline ──────────────────────────────────────'));
    console.log();

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;
      const isLast = i === events.length - 1;
      const connector = isLast ? '  ' : '  ';

      const typeColors: Record<string, (s: string) => string> = {
        job: chalk.cyan,
        credit: chalk.yellow,
        webhook: chalk.magenta,
        'dead-letter': chalk.red,
      };

      const colorFn = typeColors[event.type] ?? chalk.white;
      const bullet = isLast ? '\u2514' : '\u251c';
      const line = isLast ? ' ' : '\u2502';

      console.log(`  ${chalk.dim(bullet + '\u2500')} ${chalk.dim(fmtTime(event.time))}  ${colorFn(event.label)}`);
      console.log(`  ${chalk.dim(line)}    ${chalk.dim(event.detail)}`);
    }
  }

  console.log();
}

// ── Subcommand: debug credits ──────────────────────────────────────────────────

async function debugCredits(
  profileName: string,
  mode: 'human' | 'json' | 'quiet',
): Promise<void> {
  const api = resolveApi(profileName);
  const info = await api.getCreditDebugInfo();

  // ── JSON mode ──────────────────────────────────────────────────────────────
  if (mode === 'json') {
    printJson(info);
    return;
  }

  // ── Quiet mode ─────────────────────────────────────────────────────────────
  if (mode === 'quiet') {
    printQuiet(String(info.balance.total));
    return;
  }

  // ── Human mode ─────────────────────────────────────────────────────────────
  const { balance, transactions, reconciliation } = info;

  console.log();
  console.log(chalk.bold('  Credit Debug'));
  console.log();

  // Balance summary
  console.log(chalk.dim('  ─── Current Balance ───────────────────────────────'));
  console.log(`  Plan Credits:      ${chalk.cyan(String(balance.plan_credits))}`);
  console.log(`  Purchased Credits: ${chalk.cyan(String(balance.purchased_credits))}`);
  console.log(`  Total:             ${chalk.bold.green(String(balance.total))}`);

  // Reconciliation
  console.log();
  console.log(chalk.dim('  ─── Reconciliation ────────────────────────────────'));

  const reconIcon = reconciliation.isBalanced
    ? chalk.green('\u2713')
    : chalk.red('\u2717');
  const reconLabel = reconciliation.isBalanced
    ? chalk.green('Balanced')
    : chalk.red('MISMATCH');

  console.log(`  Status:           ${reconIcon} ${reconLabel}`);
  console.log(`  Expected Balance: ${chalk.white(String(reconciliation.expectedBalance))}`);
  console.log(`  Actual Balance:   ${chalk.white(String(reconciliation.actualBalance))}`);

  if (!reconciliation.isBalanced) {
    const sign = reconciliation.discrepancy > 0 ? '+' : '';
    console.log(
      `  Discrepancy:      ${chalk.red(`${sign}${reconciliation.discrepancy}`)}`,
    );
  }

  if (reconciliation.lastCheckedAt) {
    console.log(
      `  Last Checked:     ${fmtTime(reconciliation.lastCheckedAt)} (${fmtRelative(reconciliation.lastCheckedAt)})`,
    );
  }

  // Recent transactions
  if (transactions.length > 0) {
    console.log();
    console.log(chalk.dim('  ─── Recent Transactions ───────────────────────────'));
    console.log();

    // Table header
    const headers = ['Time', 'Type', 'Amount', 'Plan After', 'Purch After', 'Description'];
    const widths = [18, 8, 8, 11, 11, 30];

    const headerLine = headers
      .map((h, i) => h.padEnd(widths[i]!))
      .join('  ');
    console.log(`  ${chalk.bold(headerLine)}`);
    console.log(`  ${widths.map((w) => '\u2500'.repeat(w)).join('  ')}`);

    for (const tx of transactions.slice(0, 20)) {
      const time = fmtTime(tx.created_at).padEnd(widths[0]!);
      const type = tx.type.padEnd(widths[1]!);
      const amount = (tx.amount > 0 ? `+${tx.amount}` : String(tx.amount)).padEnd(widths[2]!);
      const planAfter = String(tx.plan_credits_after).padEnd(widths[3]!);
      const purchAfter = String(tx.purchased_credits_after).padEnd(widths[4]!);
      const desc = tx.description.substring(0, widths[5]!);

      const amountColor = tx.amount >= 0 ? chalk.green : chalk.red;

      console.log(
        `  ${chalk.dim(time)}  ${type}  ${amountColor(amount)}  ${planAfter}  ${purchAfter}  ${chalk.dim(desc)}`,
      );
    }

    if (transactions.length > 20) {
      console.log(chalk.dim(`  ... and ${transactions.length - 20} more transactions`));
    }
  }

  console.log();
}

// ── Register command group ─────────────────────────────────────────────────────

export function registerDebugCommand(program: Command): void {
  const debug = program
    .command('debug')
    .description('Debug and troubleshoot jobs and credits');

  debug
    .command('job <job-id>')
    .description('Inspect a job with full timeline, transactions, and webhook history')
    .action(async (jobId: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);

      try {
        await debugJob(jobId, profileName, mode);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  debug
    .command('credits')
    .description('Inspect credit balance, transactions, and reconciliation status')
    .action(async () => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
        profile?: string;
      }>();
      const mode = detectOutputMode(globalOpts);
      const profileName = resolveProfileName(globalOpts.profile);

      try {
        await debugCredits(profileName, mode);
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
