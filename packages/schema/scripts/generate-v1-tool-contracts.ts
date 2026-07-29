#!/usr/bin/env tsx
// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V1_MANDATORY_TOOL_CONTRACTS,
  generateV1ToolContractSchemas,
} from '../src/tooling/contracts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const DOC_OUT = resolve(repoRoot, 'docs/v2/tool-contracts.md');
const JSON_OUT = resolve(repoRoot, 'generated/v1-tool-contracts.schema.json');

function renderDocs(): string {
  const schemas = generateV1ToolContractSchemas();
  const sections = Object.entries(V1_MANDATORY_TOOL_CONTRACTS).map(([id, def]) => {
    const schema = schemas[id];
    return [
      `## ${id}`,
      '',
      def.summary,
      '',
      '### Input schema',
      '',
      '```json',
      JSON.stringify(schema.input, null, 2),
      '```',
      '',
      '### Output schema',
      '',
      '```json',
      JSON.stringify(schema.output, null, 2),
      '```',
      '',
    ].join('\n');
  });

  return [
    '<!-- AUTO-GENERATED — do not hand-edit. -->',
    '# V1 tool contracts',
    '',
    'Tooling-First V1 mandatory tool contracts, generated from `@agentmedia/schema`.',
    '',
    ...sections,
  ].join('\n');
}

function main(): void {
  mkdirSync(dirname(DOC_OUT), { recursive: true });
  mkdirSync(dirname(JSON_OUT), { recursive: true });

  const docs = renderDocs();
  const json = JSON.stringify(generateV1ToolContractSchemas(), null, 2);

  writeFileSync(DOC_OUT, docs, 'utf8');
  writeFileSync(JSON_OUT, json, 'utf8');

  console.log(`✓ wrote ${DOC_OUT}`);
  console.log(`✓ wrote ${JSON_OUT}`);
}

main();
