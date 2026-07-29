// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media usage` command.
 *
 * Displays usage analytics for the authenticated user, including job
 * counts, credit consumption, per-model breakdowns, and per-operation
 * distributions. Data is fetched from the usage-stats edge function.
 *
 * Supports human (box-drawn tables), JSON, and quiet output modes.
 * The time period is configurable via --period (7d, 30d, 90d).
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import {
  detectOutputMode,
  printJson,
  printQuiet,
  createSpinner,
} from '../lib/output.js';
import { getApiKey, resolveProfileName } from '../lib/credentials.js';
import {
  AgentMediaAPI,
  type UsageStats,
  type UsageModelBreakdown,
  type UsageOperationBreakdown,
} from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

// ── Box-drawing characters ─────────────────────────────────────────────────

const BOX = {
  topLeft: '\u256D',
  topRight: '\u256E',
  bottomLeft: '\u2570',
  bottomRight: '\u256F',
  horizontal: '\u2500',
  vertical: '\u2502',
  teeRight: '\u251C',
  teeLeft: '\u2524',
  cross: '\u253C',
  teeDown: '\u252C',
  teeUp: '\u2534',
} as const;

/** Valid period values. */
const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof VALID_PERIODS)[number];

/** Table width for the outer box (content area, excluding box chars). */
const BOX_WIDTH = 61;

// ── Formatting helpers ─────────────────────────────────────────────────────

/**
 * Format a number with thousands separators (e.g., 8540 -> "8,540").
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Compute success rate as a percentage from summary data.
 */
function successRate(stats: UsageStats): string {
  const { total_jobs, failed_jobs } = stats.summary;
  if (total_jobs === 0) return '0.0%';
  const rate = ((total_jobs - failed_jobs) / total_jobs) * 100;
  return `${rate.toFixed(1)}%`;
}

/**
 * Compute average credit cost per job.
 */
function avgCostPerJob(stats: UsageStats): string {
  const { total_jobs, credits_used } = stats.summary;
  if (total_jobs === 0) return '0.0';
  return (credits_used / total_jobs).toFixed(1);
}

/**
 * Pad or truncate a string to an exact width.
 */
function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/**
 * Right-align a string within a given width.
 */
function rpad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return ' '.repeat(width - str.length) + str;
}

/**
 * Draw a horizontal box line (top, bottom, or separator).
 */
function boxLine(
  left: string,
  fill: string,
  right: string,
  width: number,
): string {
  return left + fill.repeat(width) + right;
}

/**
 * Draw a box title row.
 */
function boxTitle(title: string, width: number): string {
  const top = boxLine(BOX.topLeft, BOX.horizontal, BOX.topRight, width);
  const content = `${BOX.vertical}  ${pad(title, width - 3)}${BOX.vertical}`;
  const bottom = boxLine(BOX.bottomLeft, BOX.horizontal, BOX.bottomRight, width);
  return `${top}\n${content}\n${bottom}`;
}

/**
 * Build a bar chart string with filled and empty blocks.
 *
 * @param fraction - Value between 0 and 1.
 * @param barWidth - Total number of block characters.
 */
function barChart(fraction: number, barWidth: number): string {
  const filled = Math.round(fraction * barWidth);
  const empty = barWidth - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Format an operation slug for display (e.g., "text_to_video" -> "text_to_video").
 * Keeps underscores for alignment consistency.
 */
function formatOperation(op: string): string {
  return op;
}

/**
 * Compute per-model success rate. The edge function does not return
 * per-model success counts, so we approximate using the overall
 * success rate for display. In a future version the edge function
 * could be extended to return per-model success/fail counts.
 *
 * For now, we compute model-level success from available data.
 * Since the edge function only provides job_count and credits_used
 * per model (no per-model fail count), we show "N/A" unless we can
 * derive it. We'll use the overall success rate as a stand-in.
 */
function modelSuccessLabel(_model: UsageModelBreakdown, overallRate: string): string {
  return overallRate;
}

// ── Table rendering ────────────────────────────────────────────────────────

/**
 * Render the "By Model" table section.
 */
function renderByModelTable(
  models: UsageModelBreakdown[],
  overallRate: string,
): string {
  const lines: string[] = [];

  // Column widths: Model(14) | Jobs(6) | Credits(9) | Avg Cost(10) | Success(18)
  const colModel = 14;
  const colJobs = 6;
  const colCredits = 9;
  const colAvgCost = 10;
  const colSuccess = 18;

  const headerLabels = [
    pad('Model', colModel),
    pad('Jobs', colJobs),
    pad('Credits', colCredits),
    pad('Avg Cost', colAvgCost),
    pad('Success', colSuccess),
  ];

  // Top border with column dividers
  lines.push(
    BOX.topLeft +
      BOX.horizontal.repeat(BOX_WIDTH) +
      BOX.topRight,
  );

  // Section title
  lines.push(
    `${BOX.vertical}  ${pad('By Model', BOX_WIDTH - 3)}${BOX.vertical}`,
  );

  // Header separator with column tees
  const colWidths = [colModel, colJobs, colCredits, colAvgCost, colSuccess];
  lines.push(
    BOX.teeRight +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeDown) +
      BOX.teeLeft,
  );

  // Header row
  lines.push(
    `${BOX.vertical}${headerLabels.join(BOX.vertical)}${BOX.vertical}`,
  );

  // Header/data separator
  lines.push(
    BOX.teeRight +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.cross) +
      BOX.teeLeft,
  );

  // Data rows
  for (const model of models) {
    const avgCost =
      model.job_count > 0
        ? (model.credits_used / model.job_count).toFixed(1)
        : '0.0';

    const row = [
      ' ' + pad(model.model_slug, colModel - 1),
      rpad(formatNumber(model.job_count), colJobs - 1) + ' ',
      rpad(formatNumber(model.credits_used), colCredits - 1) + ' ',
      rpad(avgCost, colAvgCost - 1) + ' ',
      ' ' + pad(modelSuccessLabel(model, overallRate), colSuccess - 1),
    ];

    lines.push(`${BOX.vertical}${row.join(BOX.vertical)}${BOX.vertical}`);
  }

  // Bottom border
  lines.push(
    BOX.bottomLeft +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeUp) +
      BOX.bottomRight,
  );

  return lines.join('\n');
}

/**
 * Render the "By Operation" table section.
 */
function renderByOperationTable(
  operations: UsageOperationBreakdown[],
  totalCredits: number,
): string {
  const lines: string[] = [];

  // For credits per operation, we need credit data. The edge function
  // returns job_count per operation but not credits_used per operation.
  // We'll estimate credits proportionally based on job count share
  // of total credits. The bar chart uses job_count share.
  const totalJobs = operations.reduce((sum, op) => sum + op.job_count, 0);

  // Column widths: Type(17) | Jobs(6) | Credits(9) | Share(26)
  const colType = 17;
  const colJobs = 6;
  const colCredits = 9;
  const colShare = 26;

  const headerLabels = [
    pad('Type', colType),
    pad('Jobs', colJobs),
    pad('Credits', colCredits),
    pad('Share', colShare),
  ];

  const colWidths = [colType, colJobs, colCredits, colShare];

  // Top border
  lines.push(
    BOX.topLeft +
      BOX.horizontal.repeat(BOX_WIDTH - 3) +
      BOX.horizontal.repeat(3) +
      BOX.topRight,
  );

  // Section title
  lines.push(
    `${BOX.vertical}  ${pad('By Operation', BOX_WIDTH - 3)}${BOX.vertical}`,
  );

  // Header separator
  lines.push(
    BOX.teeRight +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeDown) +
      BOX.teeLeft,
  );

  // Header row
  lines.push(
    `${BOX.vertical}${headerLabels.join(BOX.vertical)}${BOX.vertical}`,
  );

  // Header/data separator
  lines.push(
    BOX.teeRight +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.cross) +
      BOX.teeLeft,
  );

  // Data rows
  for (const op of operations) {
    const fraction = totalJobs > 0 ? op.job_count / totalJobs : 0;
    const pct = Math.round(fraction * 100);
    // Estimate credits proportionally
    const estCredits =
      totalJobs > 0
        ? Math.round((op.job_count / totalJobs) * totalCredits)
        : 0;

    const barWidth = 17;
    const bar = barChart(fraction, barWidth);
    const shareStr = `${bar}  ${rpad(String(pct), 3)}%`;

    const row = [
      ' ' + pad(formatOperation(op.operation), colType - 1),
      rpad(formatNumber(op.job_count), colJobs - 1) + ' ',
      rpad(formatNumber(estCredits), colCredits - 1) + ' ',
      ' ' + pad(shareStr, colShare - 1),
    ];

    lines.push(`${BOX.vertical}${row.join(BOX.vertical)}${BOX.vertical}`);
  }

  // Bottom border
  lines.push(
    BOX.bottomLeft +
      colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeUp) +
      BOX.bottomRight,
  );

  return lines.join('\n');
}

/**
 * Render the full human-readable usage report.
 */
function renderHumanReport(stats: UsageStats): void {
  const periodLabel = stats.period === '7d'
    ? '7 days'
    : stats.period === '90d'
      ? '90 days'
      : '30 days';

  console.log();

  // Title box
  console.log(boxTitle(`Usage Report (${periodLabel})`, BOX_WIDTH));

  console.log();

  // Summary section
  const totalJobsStr = formatNumber(stats.summary.total_jobs);
  const creditsStr = formatNumber(stats.summary.credits_used);
  const rateStr = successRate(stats);
  const avgStr = avgCostPerJob(stats);

  console.log(
    `  Total Jobs:      ${chalk.bold(pad(totalJobsStr, 14))}Success Rate: ${chalk.bold(rateStr)}`,
  );
  console.log(
    `  Credits Used:    ${chalk.bold(pad(creditsStr, 14))}Avg Cost/Job: ${chalk.bold(avgStr)}`,
  );

  // By Model table
  if (stats.by_model.length > 0) {
    console.log();
    console.log(renderByModelTable(stats.by_model, rateStr));
  }

  // By Operation table
  if (stats.by_operation.length > 0) {
    console.log();
    console.log(renderByOperationTable(stats.by_operation, stats.summary.credits_used));
  }

  console.log();
}

// ── Command registration ───────────────────────────────────────────────────

export function registerUsageCommand(program: Command): void {
  program
    .command('usage')
    .description('Show usage analytics and credit consumption')
    .option(
      '--period <period>',
      'Time period: 7d, 30d, or 90d (default: 30d)',
    )
    .action(async (cmdOpts: { period?: string }) => {
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

      // Validate --period flag
      const period = (cmdOpts.period ?? '30d') as Period;
      if (!VALID_PERIODS.includes(period)) {
        throw new CLIError(`Invalid period: ${cmdOpts.period}`, {
          code: 'INVALID_ARGUMENT',
          suggestion: `Valid periods: ${VALID_PERIODS.join(', ')}`,
        });
      }

      try {
        const api = new AgentMediaAPI(apiKey);

        const spinner = createSpinner('Fetching usage data...');
        if (mode === 'human') spinner.start();

        const stats = await api.getUsageStats(period);

        if (mode === 'human') spinner.stop();

        switch (mode) {
          case 'json':
            printJson({
              period: stats.period,
              period_start: stats.period_start,
              period_end: stats.period_end,
              summary: {
                total_jobs: stats.summary.total_jobs,
                completed_jobs: stats.summary.completed_jobs,
                failed_jobs: stats.summary.failed_jobs,
                credits_used: stats.summary.credits_used,
                success_rate: stats.summary.total_jobs > 0
                  ? parseFloat(
                      (
                        ((stats.summary.total_jobs - stats.summary.failed_jobs) /
                          stats.summary.total_jobs) *
                        100
                      ).toFixed(1),
                    )
                  : 0,
                avg_cost_per_job: stats.summary.total_jobs > 0
                  ? parseFloat(
                      (stats.summary.credits_used / stats.summary.total_jobs).toFixed(1),
                    )
                  : 0,
              },
              by_model: stats.by_model,
              by_operation: stats.by_operation,
              daily: stats.daily,
            });
            break;

          case 'quiet':
            printQuiet(
              `${stats.summary.total_jobs}\t${stats.summary.credits_used}\t${successRate(stats)}`,
            );
            break;

          default:
            // Empty state
            if (stats.summary.total_jobs === 0) {
              console.log();
              console.log(
                chalk.dim(
                  `  No usage data for the past ${period}. Run 'agent-media generate <model>' to get started.`,
                ),
              );
              console.log();
              return;
            }

            renderHumanReport(stats);
            break;
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
