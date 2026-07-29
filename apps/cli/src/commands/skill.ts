// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media skill <subcommand>` — manage the local Claude skill copy.
 *
 * Subcommands:
 *   - update — pull the latest SKILL.md from gitroomhq/agent-media into
 *     ~/.claude/skills/agent-media-v2/SKILL.md
 *   - status — show local + remote version side-by-side
 */

import type { Command } from 'commander';
import {
  runSkillUpdate,
  runSkillStatus,
} from '../lib/skill-update.js';
import { handleError } from '../lib/errors.js';

export function registerSkillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage the agent-media Claude skill installation.');

  skill
    .command('update')
    .description(
      'Update the locally-installed agent-media Claude skill to the latest version from github.com/gitroomhq/agent-media.',
    )
    .action(async () => {
      try {
        await runSkillUpdate();
      } catch (err) {
        handleError(err);
      }
    });

  skill
    .command('status')
    .description(
      'Show the locally-installed skill version + the latest available version.',
    )
    .action(async () => {
      try {
        await runSkillStatus();
      } catch (err) {
        handleError(err);
      }
    });
}
