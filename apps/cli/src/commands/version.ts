// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * `agent-media version` command.
 *
 * Displays the CLI version in human, JSON, or quiet mode.
 */

import type { Command } from 'commander';
import { createRequire } from 'node:module';
import { detectOutputMode, printJson, printQuiet } from '../lib/output.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export function registerVersionCommand(program: Command): void {
  program
    .command('version')
    .description('Show CLI version information')
    .action(() => {
      const opts = program.opts<{ json?: boolean; quiet?: boolean }>();
      const mode = detectOutputMode(opts);

      switch (mode) {
        case 'json':
          printJson({ version: pkg.version });
          break;
        case 'quiet':
          printQuiet(pkg.version);
          break;
        default:
          console.log(`agent-media v${pkg.version}`);
          break;
      }
    });
}
