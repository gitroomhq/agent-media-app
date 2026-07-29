// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media actor` command group.
 *
 * Browse and preview actors from the actor library.
 *
 * Subcommands:
 *   list    — List actors with optional filters
 *   preview — Show details for a specific actor
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import {
  detectOutputMode,
  printJson,
  printQuiet,
  createSpinner,
} from '../lib/output.js';
import { AgentMediaAPI } from '../lib/api.js';

interface ActorRecord {
  id: string;
  name: string;
  slug: string;
  gender: string;
  age: number;
  age_range: string;
  nationality: string;
  style: string;
  actor_type: string;
  portrait_url: string;
  voice_id: string;
  voice_gender: string;
  lip_sync_engine: string;
}

export function registerActorCommand(program: Command): void {
  const actor = program
    .command('actor')
    .description('Browse the actor library (200 AI actors for UGC videos)');

  // ── actor list ──────────────────────────────────────────────────────────

  actor
    .command('list')
    .description('List actors with optional filters')
    .option('--gender <gender>', 'Filter by gender: female, male')
    .option('--type <type>', 'Filter by type: Young Adult, Professional, Mom, Elder, Casual')
    .option('--age <range>', 'Filter by age range: 18-25, 26-35, 36-50, 51+')
    .option('--search <name>', 'Search by name')
    .action(async (cmdOpts) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const api = new AgentMediaAPI(); // no auth needed for public endpoint
        const spinner = createSpinner('Fetching actors...');
        if (mode === 'human') spinner.start();

        const params = new URLSearchParams();
        if (cmdOpts.gender) params.set('gender', cmdOpts.gender);
        if (cmdOpts.type) params.set('actor_type', cmdOpts.type);
        if (cmdOpts.age) params.set('age_range', cmdOpts.age);
        if (cmdOpts.search) params.set('search', cmdOpts.search);

        const result = await api.listActors(params);

        if (mode === 'human') spinner.succeed(`Found ${result.total} actor(s)`);

        if (mode === 'json') {
          printJson(result);
          return;
        }

        if (mode === 'quiet') {
          (result.actors as ActorRecord[]).forEach((a) => printQuiet(a.slug));
          return;
        }

        if (result.actors.length === 0) {
          console.log(chalk.yellow('  No actors match your filters.'));
          return;
        }

        // Table output
        console.log('');
        console.log(
          chalk.gray('  Slug'.padEnd(20)) +
          chalk.gray('Name'.padEnd(15)) +
          chalk.gray('Gender'.padEnd(10)) +
          chalk.gray('Age'.padEnd(8)) +
          chalk.gray('Type'.padEnd(18)) +
          chalk.gray('Voice'),
        );
        console.log(chalk.gray('  ' + '─'.repeat(85)));

        for (const a of result.actors as ActorRecord[]) {
          console.log(
            `  ${chalk.cyan(a.slug.padEnd(18))}` +
            `${a.name.padEnd(15)}` +
            `${a.gender.padEnd(10)}` +
            `${String(a.age).padEnd(8)}` +
            `${a.actor_type.padEnd(18)}` +
            `${chalk.dim(a.voice_id)}`,
          );
        }

        console.log('');
        console.log(chalk.dim(`  Use: agent-media ugc "script..." --actor <slug> --sync`));
      } catch (err) {
        if (mode === 'human') {
          console.error(chalk.red(`Error: ${(err as Error).message}`));
        }
        process.exitCode = 1;
      }
    });

  // ── actor preview ───────────────────────────────────────────────────────

  actor
    .command('preview <slug>')
    .description('Show details for a specific actor')
    .action(async (slug: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const api = new AgentMediaAPI();
        const spinner = createSpinner(`Fetching actor ${slug}...`);
        if (mode === 'human') spinner.start();

        const result = await api.getActor(slug);

        if (mode === 'human') spinner.succeed(`Actor: ${result.actor.name}`);

        if (mode === 'json') {
          printJson(result.actor);
          return;
        }

        if (mode === 'quiet') {
          printQuiet(result.actor.slug as string);
          return;
        }

        const a = result.actor as unknown as ActorRecord;
        console.log('');
        console.log(`  ${chalk.bold(a.name)} ${chalk.dim(`(${a.slug})`)}`);
        console.log(`  ${chalk.gray('Gender:')} ${a.gender}`);
        console.log(`  ${chalk.gray('Age:')} ${a.age} (${a.age_range})`);
        console.log(`  ${chalk.gray('Nationality:')} ${a.nationality}`);
        console.log(`  ${chalk.gray('Style:')} ${a.style}`);
        console.log(`  ${chalk.gray('Type:')} ${a.actor_type}`);
        console.log(`  ${chalk.gray('Voice:')} ${a.voice_id}`);
        console.log(`  ${chalk.gray('Lip Sync:')} ${a.lip_sync_engine}`);
        console.log(`  ${chalk.gray('Portrait:')} ${a.portrait_url}`);
        console.log('');
        console.log(chalk.dim(`  Usage: agent-media ugc "your script..." --actor ${a.slug} --sync`));
        console.log(chalk.dim(`  Variants: agent-media actor variants ${a.slug}`));
      } catch (err) {
        if (mode === 'human') {
          console.error(chalk.red(`Error: ${(err as Error).message}`));
        }
        process.exitCode = 1;
      }
    });

  // ── actor variants <slug> ─────────────────────────────────────────────

  actor
    .command('variants <slug>')
    .description('List outfit variants for an actor (shows available looks)')
    .action(async (slug: string) => {
      const globalOpts = program.opts<{
        json?: boolean;
        quiet?: boolean;
      }>();
      const mode = detectOutputMode(globalOpts);

      try {
        const api = new AgentMediaAPI();
        const spinner = createSpinner(`Fetching variants for ${slug}...`);
        if (mode === 'human') spinner.start();

        // First get actor ID from slug
        const actorResult = await api.getActor(slug);
        const actorId = (actorResult.actor as Record<string, unknown>).id as string;
        const actorName = (actorResult.actor as Record<string, unknown>).name as string;

        // Fetch variants from Supabase REST (uses anon key via API client)
        const variants = await api.listActorVariants(actorId);

        if (mode === 'human') spinner.succeed(`${actorName} — ${variants.length} variant(s)`);

        if (mode === 'json') {
          printJson(variants);
          return;
        }

        if (variants.length === 0) {
          console.log(chalk.yellow('  No variants found for this actor.'));
          return;
        }

        // Group by outfit
        const outfits = new Map<string, { count: number; bg: string; url: string }>();
        for (const v of variants) {
          const key = v.outfit as string;
          if (!outfits.has(key)) {
            outfits.set(key, { count: 0, bg: v.background as string, url: v.image_url as string });
          }
          outfits.get(key)!.count++;
        }

        console.log('');
        console.log(chalk.gray('  #   Outfit'.padEnd(52)) + chalk.gray('Background'));
        console.log(chalk.gray('  ' + '─'.repeat(80)));

        let i = 1;
        for (const [outfit, info] of outfits) {
          console.log(
            `  ${chalk.dim(String(i).padEnd(4))}${chalk.cyan(outfit.padEnd(45))} ${chalk.dim(info.bg)}`,
          );
          i++;
        }

        console.log('');
        console.log(chalk.dim(`  To use a specific variant, pass --face-url with the variant image URL.`));
        console.log(chalk.dim(`  Example: agent-media ugc "script..." --face-url <variant-url> --sync`));
      } catch (err) {
        if (mode === 'human') {
          console.error(chalk.red(`Error: ${(err as Error).message}`));
        }
        process.exitCode = 1;
      }
    });
}
