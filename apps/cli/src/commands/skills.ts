// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media skills ...` — vNext skill registry surface.
 *
 * NOTE: `agent-media skill` (singular) manages the local Claude skill
 * install. This file owns the PLURAL `agent-media skills` namespace
 * which targets the api-v2 vNext skill registry. Different surfaces;
 * deliberate naming split.
 *
 *   agent-media skills list                       — list registered skills
 *   agent-media skills run <slug> --input <json>  — start a skill
 *   agent-media skills status <run_id>            — fetch run status
 *
 * Generic by design: every entry in the api-v2 SKILLS registry is
 * usable from here with zero per-skill CLI code.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import chalk from 'chalk';
import { getApiKey } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';
import { detectOutputMode, printJson, printQuiet, createSpinner } from '../lib/output.js';

interface ListOpts {
  profile?: string;
  json?: boolean;
  quiet?: boolean;
}

interface RunOpts {
  profile?: string;
  input?: string;
  inputFile?: string;
  idempotencyKey?: string;
  wait?: boolean;
  pollInterval?: number;
  timeout?: number;
  json?: boolean;
  quiet?: boolean;
}

interface StatusOpts {
  profile?: string;
  composed?: boolean;
  json?: boolean;
  quiet?: boolean;
}

const TERMINAL = new Set(['succeeded', 'completed', 'success', 'failed', 'canceled', 'cancelled']);

export function registerSkillsCommand(program: Command): void {
  const cmd = program
    .command('skills')
    .description('Run agent-media vNext skills by slug (e.g. make_ugc, the Agent-Media UGC Video tool)');

  cmd
    .command('list')
    .description('List registered vNext skills')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (opts: ListOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const apiKey = await getApiKey(opts.profile);
        if (!apiKey) {
          throw new CLIError('Not logged in. Run `agent-media login`.', { code: 'NOT_AUTHENTICATED' });
        }
        const api = new AgentMediaAPI(apiKey);
        const { skills } = await api.listSkills();
        if (mode === 'json') {
          printJson({ skills });
          return;
        }
        if (mode === 'quiet') {
          for (const s of skills) printQuiet(String((s as { slug?: string }).slug ?? ''));
          return;
        }
        console.log(chalk.bold('\nvNext skills:\n'));
        for (const s of skills as Array<Record<string, unknown>>) {
          console.log(
            `  ${chalk.cyan(String(s.slug ?? '-'))}` +
              chalk.dim(`  v${String(s.version ?? '-')}`) +
              `\n    ${String(s.description ?? '').slice(0, 200)}\n`,
          );
        }
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('run <slug>')
    .description('Start a vNext skill run')
    .option('--profile <name>', 'Credential profile')
    .option('--input <json>', 'Skill input as a JSON string')
    .option('--input-file <path>', 'Read skill input from a JSON file')
    .option('--idempotency-key <key>', 'Idempotency-Key header')
    .option('--wait', 'Block until the run terminates (poll every --poll-interval s)')
    .option('--poll-interval <seconds>', 'Polling interval when --wait is set', (v) => parseInt(v, 10), 5)
    .option('--timeout <seconds>', 'Max time to wait', (v) => parseInt(v, 10), 1800)
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (slug: string, opts: RunOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const apiKey = await getApiKey(opts.profile);
        if (!apiKey) {
          throw new CLIError('Not logged in. Run `agent-media login`.', { code: 'NOT_AUTHENTICATED' });
        }
        const api = new AgentMediaAPI(apiKey);

        let inputBody: Record<string, unknown> = {};
        if (opts.inputFile) {
          inputBody = JSON.parse(readFileSync(opts.inputFile, 'utf-8'));
        } else if (opts.input) {
          inputBody = JSON.parse(opts.input);
        }

        const idemKey = opts.idempotencyKey ?? `cli-${randomUUID()}`;
        const submit = await api.runSkill(slug, inputBody, { idempotencyKey: idemKey });
        const runId = submit.skill_run_id ?? submit.run_id;
        const composed = Boolean(submit.skill_run_id);
        if (!runId) {
          throw new CLIError('API returned no run id', { code: 'NO_RUN_ID' });
        }

        if (!opts.wait) {
          if (mode === 'json') {
            printJson({ ...submit, composed });
          } else if (mode === 'quiet') {
            printQuiet(runId);
          } else {
            console.log(chalk.green(`\n${submit.skill} submitted`));
            console.log(`  run_id: ${chalk.cyan(runId)}`);
            if (submit.workflow_id) console.log(`  workflow_id: ${submit.workflow_id}`);
            console.log(`  status: ${submit.status}`);
            console.log(chalk.dim(`\nPoll with: agent-media skills status ${runId}${composed ? ' --composed' : ''}\n`));
          }
          return;
        }

        const spinner = mode === 'human' ? createSpinner(`Running ${slug}…`).start() : null;
        const deadline = Date.now() + (opts.timeout ?? 1800) * 1000;
        let last: Record<string, unknown> | null = null;
        while (Date.now() < deadline) {
          last = composed ? await api.getSkillRun(runId) : await api.getPrimitiveRun(runId);
          const status = String(last.status ?? 'unknown');
          if (spinner) spinner.text = `${slug} · ${status}${last.current_step ? ` · ${last.current_step}` : ''}`;
          if (TERMINAL.has(status)) break;
          await new Promise((r) => setTimeout(r, (opts.pollInterval ?? 5) * 1000));
        }
        if (spinner) spinner.stop();
        if (mode === 'json') {
          printJson(last ?? {});
        } else if (mode === 'quiet') {
          const url = extractMediaUrl(last ?? {});
          if (url) printQuiet(url);
        } else {
          renderRun(last ?? {}, runId, composed);
        }
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('status <run_id>')
    .description('Get status of a vNext skill or primitive run')
    .option('--profile <name>', 'Credential profile')
    .option('--composed', 'Treat the id as a composed skill_run_id (default tries primitive first, then composed)')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (runId: string, opts: StatusOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const apiKey = await getApiKey(opts.profile);
        if (!apiKey) {
          throw new CLIError('Not logged in. Run `agent-media login`.', { code: 'NOT_AUTHENTICATED' });
        }
        const api = new AgentMediaAPI(apiKey);
        let body: Record<string, unknown> | null = null;
        if (opts.composed) {
          body = await api.getSkillRun(runId);
        } else {
          try {
            body = await api.getPrimitiveRun(runId);
          } catch {
            body = await api.getSkillRun(runId);
          }
        }
        if (mode === 'json') {
          printJson(body);
        } else if (mode === 'quiet') {
          const url = extractMediaUrl(body ?? {});
          if (url) printQuiet(url);
        } else {
          renderRun(body ?? {}, runId, Boolean(opts.composed) || (body !== null && 'skill_run_id' in body));
        }
      } catch (err) {
        handleError(err);
      }
    });
}

function extractMediaUrl(body: Record<string, unknown>): string | null {
  const out = body.final_output as Record<string, unknown> | undefined;
  if (out && typeof out.video_url === 'string') return out.video_url;
  const arts = body.artifacts as Array<{ url?: string }> | undefined;
  if (arts && arts[0]?.url) return arts[0].url;
  return null;
}

function renderRun(body: Record<string, unknown>, runId: string, composed: boolean): void {
  console.log();
  console.log(chalk.bold(`Run ${runId}`));
  console.log(`  status:   ${chalk.cyan(String(body.status ?? '-'))}`);
  if (body.current_step) console.log(`  step:     ${body.current_step}`);
  if (body.skill) console.log(`  skill:    ${body.skill}`);
  if (body.primitive) console.log(`  primitive: ${body.primitive}`);
  if (body.error) {
    const e = body.error as { code?: string; message?: string };
    console.log(chalk.red(`  error:    ${e.code ?? ''} ${e.message ?? ''}`));
  }
  if (composed && Array.isArray(body.steps)) {
    console.log(chalk.dim('\n  steps:'));
    for (const s of body.steps as Array<Record<string, unknown>>) {
      const arts = (s.artifacts as Array<{ url?: string }>) ?? [];
      const url = arts[0]?.url ? chalk.dim(`  ${arts[0].url}`) : '';
      console.log(`    · ${chalk.cyan(String(s.primitive ?? '-'))}  ${String(s.status ?? '-')}${url}`);
    }
  }
  const final = extractMediaUrl(body);
  if (final) {
    console.log();
    console.log(chalk.green('  output:'));
    console.log(`    ${final}`);
  }
  console.log();
}
