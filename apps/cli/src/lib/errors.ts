// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Error handling utilities for the agent-media CLI.
 */

import chalk from 'chalk';

/**
 * A single field-level validation issue as returned by the backend
 * (Zod `error.issues`): `path` names the offending field, `message`
 * explains the bound that was violated.
 */
export interface ApiIssue {
  path?: (string | number)[];
  message?: string;
  code?: string;
}

/**
 * Structured CLI error with an error code and optional suggestion.
 *
 * `issues` carries backend field-level validation detail so the caller
 * (human or agent) can see EXACTLY which field/value was rejected instead
 * of a bare "Invalid request".
 */
export class CLIError extends Error {
  readonly code: string;
  readonly suggestion?: string;
  readonly issues?: ApiIssue[];

  constructor(message: string, options: { code: string; suggestion?: string; issues?: ApiIssue[] }) {
    super(message);
    this.name = 'CLIError';
    this.code = options.code;
    this.suggestion = options.suggestion;
    this.issues = options.issues && options.issues.length ? options.issues : undefined;
  }
}

/** Render one validation issue as "field.path: message". */
function formatIssue(issue: ApiIssue): string {
  const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : '(request)';
  return `${path}: ${issue.message ?? issue.code ?? 'invalid'}`;
}

/**
 * Display a user-friendly error message and exit.
 *
 * - CLIError: shows code, message, field-level issues, and optional suggestion.
 * - Generic Error: classifies the error (network/timeout/fs/...) so the printed
 *   code matches the cause instead of a blanket UNEXPECTED_ERROR.
 * - Unknown: shows a generic message with troubleshooting hint.
 */
export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(chalk.red(`✗ ${error.message}`));
    if (error.issues) {
      for (const issue of error.issues) {
        console.error(chalk.yellow(`  • ${formatIssue(issue)}`));
      }
    }
    if (error.suggestion) {
      console.error(chalk.yellow(`  → ${error.suggestion}`));
    }
    console.error(chalk.dim(`  Error code: ${error.code}`));
    process.exit(1);
  }

  if (error instanceof Error) {
    const { code, suggestion } = classifyError(error);
    console.error(chalk.red(`✗ ${error.message}`));
    if (suggestion) {
      console.error(chalk.yellow(`  → ${suggestion}`));
    }
    console.error(chalk.dim(`  Error code: ${code}`));
    process.exit(1);
  }

  console.error(chalk.red('✗ An unexpected error occurred.'));
  console.error(chalk.yellow(`  → Run 'agent-media doctor' to diagnose common issues.`));
  console.error(chalk.dim(`  Error code: UNKNOWN_ERROR`));
  process.exit(1);
}

/**
 * Classify a generic Error into a stable error code + a helpful suggestion.
 *
 * Node/undici surface network failures as a generic "fetch failed" whose real
 * cause (ENOTFOUND/ECONNREFUSED) sits on `error.cause`, so we inspect both — a
 * connectivity failure must not be mislabeled UNEXPECTED_ERROR.
 */
export function classifyError(error: Error): { code: string; suggestion: string } {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const msg = `${error.message} ${cause?.code ?? ''} ${cause?.message ?? ''}`.toLowerCase();

  // Network / fetch failures
  if (
    msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('econnrefused') ||
    msg.includes('econnreset') || msg.includes('eai_again') || msg.includes('network')
  ) {
    return {
      code: 'NETWORK_UNREACHABLE',
      suggestion: "Check your internet connection or run 'agent-media doctor' to verify API connectivity.",
    };
  }

  // Timeout / abort
  if (msg.includes('timeout') || msg.includes('aborted') || error.name === 'AbortError') {
    return { code: 'REQUEST_TIMEOUT', suggestion: 'The request timed out. Check your network or try again later.' };
  }

  // Permission denied
  if (msg.includes('eacces') || msg.includes('permission denied')) {
    return { code: 'PERMISSION_DENIED', suggestion: 'Check file permissions. You may need to run with elevated privileges.' };
  }

  // File system
  if (msg.includes('enoent') || msg.includes('no such file')) {
    return { code: 'FILE_NOT_FOUND', suggestion: 'A required file or directory was not found. Check the path and try again.' };
  }

  // JSON parse errors
  if (msg.includes('json') && (msg.includes('parse') || msg.includes('unexpected token'))) {
    return { code: 'BAD_RESPONSE', suggestion: 'Received an invalid response. The API may be temporarily unavailable.' };
  }

  return { code: 'UNEXPECTED_ERROR', suggestion: "Run 'agent-media doctor' to diagnose common issues." };
}

/**
 * When a generation job fails because a content/safety filter rejected the
 * wording, return actionable guidance so the user (or agent) can rephrase and
 * self-correct instead of guessing which words tripped it. Returns undefined
 * for non-safety failures.
 */
export function contentPolicySuggestion(errorMessage: string | null | undefined): string | undefined {
  if (!errorMessage) return undefined;
  if (/safety system|content[_ ]?policy|rejected by the safety|moderation|safety_violation/i.test(errorMessage)) {
    return (
      'A content/safety filter rejected the wording. Rephrase with neutral, production-safe ' +
      'language — avoid suggestive or emotionally charged adjectives (e.g. attractive, seductive, ' +
      'jealous, glamorous). Put personality into the script, not the character/portrait description.'
    );
  }
  return undefined;
}
