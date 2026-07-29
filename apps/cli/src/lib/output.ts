// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Output formatting utilities for human, JSON, and quiet modes.
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { OutputMode } from '../types.js';

/**
 * Detect the output mode based on CLI flags.
 */
export function detectOutputMode(options: { json?: boolean; quiet?: boolean }): OutputMode {
  if (options.json) return 'json';
  if (options.quiet) return 'quiet';
  return 'human';
}

/**
 * Print a formatted table to stdout.
 *
 * In human mode, renders an aligned ASCII table with header.
 * In JSON mode, outputs the rows as an array of objects keyed by headers.
 * In quiet mode, outputs each row's first column value, one per line.
 */
export function printTable(
  headers: string[],
  rows: string[][],
  options?: { json?: boolean; quiet?: boolean },
): void {
  const mode = detectOutputMode(options ?? {});

  if (mode === 'json') {
    const data = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        obj[header.toLowerCase().replace(/\s+/g, '_')] = row[i] ?? '';
      });
      return obj;
    });
    printJson(data);
    return;
  }

  if (mode === 'quiet') {
    printQuiet(rows.map((row) => row[0] ?? ''));
    return;
  }

  // Human mode: calculate column widths and render aligned table
  const colWidths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? '').length)),
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i]!)).join('  ');
  const separator = colWidths.map((w) => '─'.repeat(w)).join('──');

  console.log(chalk.bold(headerLine));
  console.log(chalk.dim(separator));

  for (const row of rows) {
    const line = row.map((cell, i) => cell.padEnd(colWidths[i]!)).join('  ');
    console.log(line);
  }
}

/**
 * Print data as formatted JSON to stdout.
 */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print minimal output for piping / scripting.
 */
export function printQuiet(value: string | string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) {
      console.log(v);
    }
  } else {
    console.log(value);
  }
}

/**
 * Create an ora spinner instance.
 */
export function createSpinner(text: string): Ora {
  return ora({ text, spinner: 'dots' });
}
