// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media social ...` — publish-to-social surface.
 *
 * Connect the user's TikTok / Instagram / X and publish a generated video to
 * them via the api-v2 /v1/social/* endpoints (Postiz Enterprise under the hood).
 *
 *   agent-media social providers                          — connectable networks
 *   agent-media social channels                           — connected channels
 *   agent-media social connect <provider>                 — get the OAuth URL to authorize
 *   agent-media social disconnect <channel_id>            — remove a channel
 *   agent-media social publish --video <url> --channels <id,id> [--caption ..] [--at <iso>]
 *
 * Connecting requires the human to open an OAuth URL — an agent cannot OAuth
 * on their behalf. Publishing is fully programmatic once a channel is connected.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { getApiKey } from '../lib/credentials.js';
import { AgentMediaAPI } from '../lib/api.js';
import { CLIError, handleError } from '../lib/errors.js';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';

interface BaseOpts {
  profile?: string;
  json?: boolean;
  quiet?: boolean;
}

interface PublishOpts extends BaseOpts {
  video?: string;
  channels?: string;
  caption?: string;
  at?: string;
}

async function requireApi(opts: BaseOpts): Promise<AgentMediaAPI> {
  const apiKey = await getApiKey(opts.profile);
  if (!apiKey) {
    throw new CLIError('Not logged in. Run `agent-media login`.', { code: 'NOT_AUTHENTICATED' });
  }
  return new AgentMediaAPI(apiKey);
}

export function registerSocialCommand(program: Command): void {
  const cmd = program
    .command('social')
    .description('Publish generated videos to TikTok / Instagram / X (connect channels + post)');

  cmd
    .command('providers')
    .description('List the connectable social networks')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (opts: BaseOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const api = await requireApi(opts);
        const { providers } = await api.listSocialProviders();
        if (mode === 'json') return printJson({ providers });
        if (mode === 'quiet') return providers.forEach((p) => printQuiet(String(p.identifier ?? '')));
        console.log(chalk.bold('\nConnectable networks:\n'));
        for (const p of providers) {
          console.log(`  ${chalk.cyan(String(p.identifier ?? '-'))}  ${chalk.dim(String(p.name ?? ''))}`);
        }
        console.log('');
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('channels')
    .description('List the user\'s connected channels')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (opts: BaseOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const api = await requireApi(opts);
        const { channels } = await api.listSocialChannels();
        if (mode === 'json') return printJson({ channels });
        if (mode === 'quiet') return channels.forEach((c) => printQuiet(String(c.id ?? '')));
        if (channels.length === 0) {
          console.log(chalk.dim('\nNo connected channels. Run `agent-media social connect <provider>`.\n'));
          return;
        }
        console.log(chalk.bold('\nConnected channels:\n'));
        for (const c of channels) {
          const profile = c.profile ? ` ${chalk.dim('@' + String(c.profile))}` : '';
          console.log(
            `  ${chalk.cyan(String(c.id ?? '-'))}  ${String(c.name ?? '')} ${chalk.dim('·')} ${String(c.provider ?? '')}${profile}`,
          );
        }
        console.log('');
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('connect <provider>')
    .description('Get the OAuth URL to authorize a network (tiktok | instagram | instagram-standalone | x)')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (provider: string, opts: BaseOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const api = await requireApi(opts);
        const { url } = await api.connectSocial(provider);
        if (mode === 'json') return printJson({ url });
        if (mode === 'quiet') return printQuiet(url);
        console.log(`\nOpen this URL to authorize ${chalk.cyan(provider)} (an agent can't OAuth for you):\n`);
        console.log(`  ${chalk.underline(url)}\n`);
        console.log(chalk.dim('After authorizing, run `agent-media social channels` to see it.\n'));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('disconnect <channel_id>')
    .description('Disconnect a channel')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (channelId: string, opts: BaseOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const api = await requireApi(opts);
        await api.disconnectSocial(channelId);
        if (mode === 'json') return printJson({ success: true });
        console.log(chalk.green(`\nDisconnected ${channelId}.\n`));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('publish')
    .description('Publish an R2-hosted video to one or more connected channels')
    .requiredOption('--video <url>', 'R2-hosted video URL (from a video skill output)')
    .requiredOption('--channels <ids>', 'Comma-separated channel ids (from `social channels`)')
    .option('--caption <text>', 'Post caption', '')
    .option('--at <iso>', 'Schedule for an ISO-8601 time instead of posting now')
    .option('--profile <name>', 'Credential profile')
    .option('--json', 'Output JSON')
    .option('--quiet', 'Minimal output')
    .action(async (opts: PublishOpts) => {
      try {
        const mode = detectOutputMode(opts);
        const api = await requireApi(opts);
        const channel_ids = String(opts.channels ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (channel_ids.length === 0) {
          throw new CLIError('Provide at least one channel id via --channels.', { code: 'INVALID_INPUT' });
        }
        const result = await api.publishSocial({
          video_url: String(opts.video),
          channel_ids,
          caption: opts.caption ?? '',
          type: opts.at ? 'schedule' : 'now',
          ...(opts.at ? { date: opts.at } : {}),
        });
        const n = result.post_ids?.length ?? 0;
        if (mode === 'json') return printJson(result);
        if (n === 0) {
          throw new CLIError('Request accepted but no post was created — nothing was published.', { code: 'PUBLISH_FAILED' });
        }
        console.log(chalk.green(`\nPublished to ${n} channel${n === 1 ? '' : 's'}.`) + chalk.dim(` (post ids: ${result.post_ids?.join(', ')})\n`));
      } catch (err) {
        handleError(err);
      }
    });
}
