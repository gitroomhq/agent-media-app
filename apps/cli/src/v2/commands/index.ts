// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * v2 CLI surface — register all v2 commands on the program.
 *
 * Single entry-point so apps/cli/src/index.ts only adds one import +
 * one call. Adding the next v2 command (Product-in-hands) means
 * dropping a file here and adding it to the array below.
 */

import type { Command } from 'commander';
import { registerSelfieCommand } from './selfie.js';
import { registerCharacterCommand } from './character.js';
import { registerSubtitleCommand } from './subtitle.js';

export function registerV2Commands(program: Command): void {
  registerSelfieCommand(program);
  registerCharacterCommand(program);
  registerSubtitleCommand(program);
}
