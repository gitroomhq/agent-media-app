// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media inspect <job-id>` command.
 *
 * Displays a detailed inspection view of a generation job including prompt,
 * parameters, timeline, cost breakdown, provider details, and output URLs.
 * Supports --watch mode for live polling, plus JSON and quiet output modes.
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
import { AgentMediaAPI, type GenerationJob } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';

// ── Box-drawing constants ────────────────────────────────────────────

const BOX_TL = '\u250c';
const BOX_TR = '\u2510';
const BOX_BL = '\u2514';
const BOX_BR = '\u2518';
const BOX_H  = '\u2500';
const BOX_V  = '\u2502';
const BOX_ML = '\u251c';
const BOX_MR = '\u2524';

/** Inner width of the box (excluding border characters). */
const BOX_WIDTH = 43;

// ── Status formatting ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, (text: string) => string> = {
  pending: chalk.yellow,
  submitted: chalk.yellow,
  processing: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  canceled: chalk.dim,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'PENDING',
  submitted: 'SUBMITTED',
  processing: 'PROCESSING',
  completed: 'OK',
  failed: 'FAIL',
  canceled: 'CANCELED',
};

function formatStatus(status: string): string {
  const colorize = STATUS_COLORS[status] ?? chalk.white;
  const label = STATUS_LABELS[status] ?? status.toUpperCase();
  return colorize(`[${label}] ${status}`);
}

// ── Box-drawing helpers ──────────────────────────────────────────────

function topBorder(): string {
  return `${BOX_TL}${BOX_H.repeat(BOX_WIDTH)}${BOX_TR}`;
}

function bottomBorder(): string {
  return `${BOX_BL}${BOX_H.repeat(BOX_WIDTH)}${BOX_BR}`;
}

function midBorder(): string {
  return `${BOX_ML}${BOX_H.repeat(BOX_WIDTH)}${BOX_MR}`;
}

function row(content: string): string {
  // Strip ANSI codes for length calculation
  const stripped = content.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*m/g,
    '',
  );
  const padding = Math.max(0, BOX_WIDTH - 1 - stripped.length);
  return `${BOX_V} ${content}${' '.repeat(padding)}${BOX_V}`;
}

function sectionHeader(title: string): string {
  return row(chalk.bold(title));
}

function kvRow(key: string, value: string, keyWidth = 14): string {
  const paddedKey = key.padEnd(keyWidth);
  return row(`  ${paddedKey}${value}`);
}

// ── Timeline computation ─────────────────────────────────────────────

interface TimelineEntry {
  label: string;
  timestamp: string | null;
  relativeMs: number | null;
}

interface Timeline {
  entries: TimelineEntry[];
  totalMs: number | null;
}

function buildTimeline(job: GenerationJob): Timeline {
  const createdMs = new Date(job.created_at).getTime();
  const entries: TimelineEntry[] = [];

  // Created (always present)
  entries.push({
    label: 'Created',
    timestamp: job.created_at,
    relativeMs: 0,
  });

  // Submitted -> started_at represents when the job was sent to the provider
  if (job.started_at) {
    const startedMs = new Date(job.started_at).getTime();
    entries.push({
      label: 'Submitted',
      timestamp: job.started_at,
      relativeMs: startedMs - createdMs,
    });
  }

  // Processing starts when the provider acknowledges the job
  // We infer this from webhook_checkpoint or started_at
  if (job.started_at && job.status !== 'submitted') {
    const startedMs = new Date(job.started_at).getTime();
    entries.push({
      label: 'Processing',
      timestamp: job.started_at,
      relativeMs: startedMs - createdMs,
    });
  }

  // Completed / Failed
  if (job.completed_at) {
    const completedMs = new Date(job.completed_at).getTime();
    entries.push({
      label: job.status === 'failed' ? 'Failed' : 'Completed',
      timestamp: job.completed_at,
      relativeMs: completedMs - createdMs,
    });
  }

  // Total wall-clock time
  const totalMs = job.completed_at
    ? new Date(job.completed_at).getTime() - createdMs
    : null;

  return { entries, totalMs };
}

function formatRelativeMs(ms: number | null): string {
  if (ms === null) return '...';
  if (ms === 0) return '';
  const seconds = ms / 1000;
  return `+${seconds.toFixed(1)}s`;
}

function formatTimestamp(isoStr: string): string {
  const d = new Date(isoStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${secs}`;
}

// ── Cost computation ─────────────────────────────────────────────────

/** Revenue per credit based on Creator plan pricing: $39 / 3,900 = $0.01 per credit. */
const REVENUE_PER_CREDIT = 0.01;

interface CostBreakdown {
  credits: number;
  revenueUsd: number;
  providerCostUsd: number | null;
  marginPct: number | null;
  marginUsd: number | null;
}

function computeCost(job: GenerationJob): CostBreakdown {
  const credits = job.credit_cost;
  const revenueUsd = credits * REVENUE_PER_CREDIT;
  const providerCostUsd = job.provider_cost_usd != null
    ? Number(job.provider_cost_usd)
    : null;

  let marginPct: number | null = null;
  let marginUsd: number | null = null;

  if (providerCostUsd != null && revenueUsd > 0) {
    marginUsd = revenueUsd - providerCostUsd;
    marginPct = (marginUsd / revenueUsd) * 100;
  }

  return { credits, revenueUsd, providerCostUsd, marginPct, marginUsd };
}

// ── JSON output shape ────────────────────────────────────────────────

interface InspectOutput {
  job: GenerationJob;
  timeline: {
    entries: Array<{ label: string; timestamp: string | null; relativeMs: number | null }>;
    totalMs: number | null;
  };
  costBreakdown: CostBreakdown;
  providerDetails: {
    providerSlug: string | null;
    providerJobId: string | null;
    webhookCheckpoint: string;
  };
}

function buildInspectOutput(job: GenerationJob): InspectOutput {
  return {
    job,
    timeline: buildTimeline(job),
    costBreakdown: computeCost(job),
    providerDetails: {
      providerSlug: job.provider_slug,
      providerJobId: job.provider_job_id,
      webhookCheckpoint: job.webhook_checkpoint,
    },
  };
}

// ── Human-readable card ──────────────────────────────────────────────

function printInspectCard(job: GenerationJob): void {
  const modelDisplay = job.model_display_name
    ? `${job.model_slug} (${job.model_display_name})`
    : job.model_slug;

  const lines: string[] = [];

  // ── Header ──
  lines.push(topBorder());
  lines.push(row(`${chalk.bold('JOB')} ${chalk.cyan(job.id)}`));
  lines.push(row(`Status: ${formatStatus(job.status)}`));
  lines.push(row(`Model: ${modelDisplay}`));

  // ── Prompt ──
  lines.push(midBorder());
  lines.push(sectionHeader('PROMPT'));
  // Word-wrap the prompt to fit inside the box
  const maxPromptLineLen = BOX_WIDTH - 4;
  const promptLines = wrapText(job.prompt, maxPromptLineLen);
  for (const line of promptLines) {
    lines.push(row(`  ${line}`));
  }
  if (job.negative_prompt) {
    lines.push(row(`  ${chalk.dim('Negative:')} ${truncate(job.negative_prompt, maxPromptLineLen - 10)}`));
  }

  // ── Parameters ──
  lines.push(midBorder());
  lines.push(sectionHeader('PARAMETERS'));
  lines.push(kvRow('Operation', formatOperation(job.operation)));
  lines.push(kvRow('Duration', job.duration_seconds != null ? `${job.duration_seconds}s` : '(none)'));
  lines.push(kvRow('Resolution', job.resolution ?? '(none)'));
  lines.push(kvRow('Aspect', job.aspect_ratio ?? '(none)'));
  lines.push(kvRow('Seed', job.seed != null ? String(job.seed) : '(none)'));
  lines.push(kvRow('Input Media', job.input_media_url ?? '(none)'));

  // ── Timeline ──
  const timeline = buildTimeline(job);
  lines.push(midBorder());
  lines.push(sectionHeader('TIMELINE'));
  for (const entry of timeline.entries) {
    if (entry.relativeMs === 0 && entry.timestamp) {
      lines.push(kvRow(entry.label, formatTimestamp(entry.timestamp)));
    } else {
      lines.push(kvRow(entry.label, formatRelativeMs(entry.relativeMs)));
    }
  }
  if (timeline.totalMs != null) {
    lines.push(kvRow('Total', `${(timeline.totalMs / 1000).toFixed(1)}s`));
  } else {
    lines.push(kvRow('Total', '...'));
  }

  // ── Cost ──
  const cost = computeCost(job);
  lines.push(midBorder());
  lines.push(sectionHeader('COST'));
  lines.push(kvRow('Credits', String(cost.credits)));
  lines.push(kvRow('Revenue', formatUsd(cost.revenueUsd)));
  lines.push(kvRow('Provider', cost.providerCostUsd != null ? formatUsd(cost.providerCostUsd) : '(unknown)'));
  if (cost.marginPct != null && cost.marginUsd != null) {
    lines.push(kvRow('Margin', `${Math.round(cost.marginPct)}% (${formatUsd(cost.marginUsd)})`));
  } else {
    lines.push(kvRow('Margin', '(unknown)'));
  }

  // ── Provider ──
  lines.push(midBorder());
  lines.push(sectionHeader('PROVIDER'));
  lines.push(kvRow('Provider', job.provider_slug ?? '(unknown)'));
  lines.push(kvRow('Provider Job', job.provider_job_id ?? '(none)'));
  lines.push(kvRow('Checkpoint', job.webhook_checkpoint));

  // ── Error (for failed jobs) ──
  if (job.status === 'failed') {
    lines.push(midBorder());
    lines.push(sectionHeader('ERROR'));
    lines.push(kvRow('Code', job.error_code ?? '(unknown)'));
    lines.push(kvRow('Message', job.error_message ?? '(no message)'));
    const refundStatus = job.credits_refunded
      ? chalk.green('refunded')
      : chalk.yellow('not refunded');
    lines.push(kvRow('Refund', refundStatus));
  }

  // ── Output ──
  if (job.output_media_url || job.output_thumbnail_url) {
    lines.push(midBorder());
    lines.push(sectionHeader('OUTPUT'));
    lines.push(kvRow('Media URL', job.output_media_url ? chalk.underline(truncate(job.output_media_url, 24)) : '(none)'));
    lines.push(kvRow('Thumbnail', job.output_thumbnail_url ? chalk.underline(truncate(job.output_thumbnail_url, 24)) : '(none)'));
  }

  lines.push(bottomBorder());

  console.log();
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log();
}

// ── String helpers ───────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
}

function wrapText(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxLen) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : ['(empty)'];
}

function formatOperation(op: string): string {
  return op.replace(/_/g, '-');
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ── Watch-mode screen clear ──────────────────────────────────────────

function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[H');
}

// ── Terminal status check ────────────────────────────────────────────

function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

// ── Command registration ─────────────────────────────────────────────

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect <job-id>')
    .description('Display a detailed inspection view of a generation job')
    .option('-w, --watch', 'Poll for live updates until the job completes')
    .action(async (jobId: string, cmdOpts: { watch?: boolean }) => {
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

        if (cmdOpts.watch && mode === 'human') {
          // ── Watch mode: poll every 3s, update in-place ─────────────
          const POLL_INTERVAL_MS = 3000;
          const startTime = Date.now();
          let running = true;

          // Handle Ctrl+C gracefully
          const onSigint = (): void => {
            running = false;
            console.log();
            console.log(chalk.dim('  Stopped watching.'));
            process.exit(0);
          };
          process.on('SIGINT', onSigint);

          try {
            while (running) {
              const job = await api.getJob(jobId);
              const elapsed = Math.floor((Date.now() - startTime) / 1000);

              clearScreen();
              printInspectCard(job);
              console.log(
                chalk.dim(`    Watching... elapsed ${elapsed}s (Ctrl+C to stop)`),
              );
              console.log();

              // Exit when terminal status reached
              if (isTerminalStatus(job.status)) {
                break;
              }

              // Wait before next poll
              await new Promise<void>((resolve) => {
                // Allow early exit on SIGINT
                const earlyExit = (): void => {
                  clearTimeout(timer);
                  process.removeListener('SIGINT', earlyExit);
                  resolve();
                };
                const timer = setTimeout(() => {
                  process.removeListener('SIGINT', earlyExit);
                  resolve();
                }, POLL_INTERVAL_MS);
                process.once('SIGINT', earlyExit);
              });
            }
          } finally {
            process.removeListener('SIGINT', onSigint);
          }
        } else {
          // ── Single fetch ───────────────────────────────────────────
          const spinner = createSpinner('Inspecting job...');
          if (mode === 'human') spinner.start();

          const job = await api.getJob(jobId);

          if (mode === 'human') spinner.stop();

          switch (mode) {
            case 'json':
              printJson(buildInspectOutput(job));
              break;

            case 'quiet':
              printQuiet(job.status);
              break;

            default:
              printInspectCard(job);
              break;
          }
        }
      } catch (error: unknown) {
        handleError(error);
      }
    });
}
