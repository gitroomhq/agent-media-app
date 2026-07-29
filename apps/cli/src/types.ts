// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * CLI-specific type definitions.
 */

export interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  verbose?: boolean;
  profile?: string;
}

export type OutputMode = 'human' | 'json' | 'quiet';
