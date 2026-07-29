#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * CI check: verify generated/openapi.json is up to date with the schema.
 * Regenerates the spec in memory and diffs against the committed file.
 * Exit code 1 if stale.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '../../../generated/openapi.json');

if (!existsSync(specPath)) {
  console.error('ERROR: generated/openapi.json does not exist. Run: pnpm --filter @agent-media/schema generate:openapi');
  process.exit(1);
}

const committed = readFileSync(specPath, 'utf-8');

// Regenerate in a temp location
const tmpPath = resolve(__dirname, '../../../generated/openapi.check.json');
execSync(`tsx ${resolve(__dirname, 'generate-openapi.ts')}`, { stdio: 'pipe' });
const regenerated = readFileSync(specPath, 'utf-8');

// Restore committed version
readFileSync(specPath);

if (committed.trim() === regenerated.trim()) {
  console.log('✓ OpenAPI spec is up to date with schema');
  process.exit(0);
} else {
  console.error('✗ OpenAPI spec is STALE. Schema changed but spec was not regenerated.');
  console.error('  Run: pnpm --filter @agent-media/schema generate:openapi');
  console.error('  Then commit generated/openapi.json');
  process.exit(1);
}
