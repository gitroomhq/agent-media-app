// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * CLI integration tests using node:test.
 *
 * Tests cover command parsing, output formatting, and error handling
 * for the agent-media CLI. Commands that require API calls are tested
 * with mocked fetch responses.
 *
 * Run with: node --test --loader ts-node/esm apps/cli/tests/commands.test.ts
 * Or after build: node --test apps/cli/tests/commands.test.js
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Phase 1 pure-logic units (built output — dist emits .d.ts).
import { classifyError, contentPolicySuggestion, CLIError } from '../dist/lib/errors.js';
import { v2SubmitError } from '../dist/v2/lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(__dirname, '../dist/index.js');

/** Common exec options for running the CLI. */
const EXEC_OPTS: ExecSyncOptionsWithStringEncoding = {
  encoding: 'utf-8',
  timeout: 10_000,
  env: {
    ...process.env,
    // Prevent credential lookups during testing
    AGENT_MEDIA_CONFIG_DIR: '/tmp/agent-media-test-config',
    // Suppress colors for predictable output matching
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  },
};

/**
 * Execute the CLI with arguments and return stdout.
 * Throws on non-zero exit.
 */
function run(args: string): string {
  return execSync(`node ${CLI_ENTRY} ${args}`, EXEC_OPTS).trim();
}

/**
 * Execute the CLI expecting a failure. Returns { stdout, stderr, exitCode }.
 */
function runExpectFail(args: string): { stdout: string; stderr: string } {
  try {
    const stdout = execSync(`node ${CLI_ENTRY} ${args}`, {
      ...EXEC_OPTS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { stdout, stderr: '' };
  } catch (error: unknown) {
    const e = error as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    };
  }
}

// =============================================================================
// version command
// =============================================================================

describe('agent-media version', () => {
  it('prints version string in human mode', () => {
    const output = run('version');
    assert.match(output, /agent-media v\d+\.\d+\.\d+/);
  });

  it('prints version in JSON mode', () => {
    const output = run('--json version');
    const json = JSON.parse(output);
    assert.ok(typeof json.version === 'string');
    assert.match(json.version, /^\d+\.\d+\.\d+$/);
  });

  it('prints version in quiet mode', () => {
    const output = run('--quiet version');
    assert.match(output, /^\d+\.\d+\.\d+$/);
  });
});

// =============================================================================
// help command
// =============================================================================

describe('agent-media --help', () => {
  it('shows help with usage and commands', () => {
    const output = run('--help');
    assert.ok(output.includes('Usage:'));
    assert.ok(output.includes('agent-media'));
    assert.ok(output.includes('Commands:'));
  });

  it('lists registered commands in help', () => {
    const output = run('--help');
    // Check for several key commands
    assert.ok(output.includes('credits'), 'help includes credits');
    assert.ok(output.includes('login'), 'help includes login');
    assert.ok(output.includes('update'), 'help includes update');
    assert.ok(output.includes('completions'), 'help includes completions');
    assert.ok(output.includes('selfie'), 'help includes selfie');
    assert.ok(output.includes('character'), 'help includes character');
    assert.ok(output.includes('subs'), 'help includes subs');
    assert.ok(output.includes('skill'), 'help includes skill');
  });
});

// =============================================================================
// saas-review command
// =============================================================================

describe('agent-media saas-review', () => {
  it('remains callable as a hidden deprecated command', () => {
    const topLevelHelp = run('--help');
    assert.ok(!topLevelHelp.includes('saas-review'), 'top-level help hides legacy saas-review command');

    const output = run('saas-review --help');
    assert.ok(output.includes('Generate a SaaS review video'));
    assert.ok(output.includes('--saas'));
  });

  it('keeps review as a hidden deprecated alias', () => {
    const topLevelHelp = run('--help');
    assert.ok(!topLevelHelp.includes('saas-review'), 'top-level help hides legacy saas-review command');
    assert.ok(!topLevelHelp.includes('review      Generate a SaaS review'), 'top-level help hides legacy review command');

    const aliasHelp = run('review --help');
    assert.ok(aliasHelp.includes('Generate a SaaS review video'));
    assert.ok(aliasHelp.includes('--saas'));
  });
});

// =============================================================================
// credits command (auth required)
// =============================================================================

describe('agent-media credits', () => {
  it('credits command shows help with subcommands', () => {
    const output = run('credits --help');
    assert.ok(output.includes('Show credit balance'));
    assert.ok(output.includes('history'));
    assert.ok(output.includes('topup'));
  });

  it('credits command fails without auth', () => {
    const { stderr } = runExpectFail('credits');
    assert.ok(
      stderr.includes('Not logged in') || stderr.includes('NOT_AUTHENTICATED'),
      'should indicate authentication is required',
    );
  });

  it('credits history accepts --limit and --type flags', () => {
    const output = run('credits history --help');
    assert.ok(output.includes('--limit'));
    assert.ok(output.includes('--type'));
  });
});

// =============================================================================
// config command
// =============================================================================

describe('agent-media config', () => {
  const tmpDir = `/tmp/agent-media-test-config-${Date.now()}`;

  const configExecOpts: ExecSyncOptionsWithStringEncoding = {
    ...EXEC_OPTS,
    env: {
      ...EXEC_OPTS.env,
      AGENT_MEDIA_CONFIG_DIR: tmpDir,
    },
  };

  function runConfig(args: string): string {
    return execSync(`node ${CLI_ENTRY} ${args}`, configExecOpts).toString().trim();
  }

  it('config list shows valid keys', () => {
    const output = runConfig('config list');
    assert.ok(output.includes('api_url') || output.includes('output_format'));
  });

  it('config set and get round-trips a value', () => {
    runConfig('config set output_format json');
    const output = runConfig('config get output_format');
    assert.ok(output.includes('json'));
  });

  it('config set rejects unknown keys', () => {
    const { stderr } = runExpectFail('config set unknown_key foo');
    assert.ok(
      stderr.includes('Unknown config key') || stderr.includes('INVALID_CONFIG_KEY'),
      'should reject unknown config keys',
    );
  });

  afterEach(() => {
    try {
      execSync(`rm -rf ${tmpDir}`, { encoding: 'utf-8' });
    } catch {
      // cleanup is best-effort
    }
  });
});

// =============================================================================
// completions command
// =============================================================================

describe('agent-media completions', () => {
  it('generates bash completions', () => {
    const output = run('completions bash');
    assert.ok(output.includes('_agent_media_completions'));
    assert.ok(output.includes('complete -F'));
  });

  it('generates zsh completions', () => {
    const output = run('completions zsh');
    assert.ok(output.includes('#compdef agent-media'));
    assert.ok(output.includes('_agent-media'));
  });

  it('generates fish completions', () => {
    const output = run('completions fish');
    assert.ok(output.includes('complete -c agent-media'));
    assert.ok(output.includes('__fish_use_subcommand'));
  });

  it('rejects unsupported shell', () => {
    const { stderr } = runExpectFail('completions powershell');
    assert.ok(
      stderr.includes('Unsupported shell') || stderr.includes('UNSUPPORTED_SHELL'),
      'should reject unsupported shell',
    );
  });
});

// =============================================================================
// update command
// =============================================================================

describe('agent-media update', () => {
  it('update command is registered and shows in help', () => {
    const output = run('update --help');
    assert.ok(output.includes('Update the CLI and Claude Code skill docs'));
    assert.ok(output.includes('--check'));
  });
});

// =============================================================================
// doctor command
// =============================================================================

describe('agent-media doctor', () => {
  it('doctor command is registered and shows in help', () => {
    const output = run('doctor --help');
    assert.ok(output.includes('Run diagnostic checks'));
    assert.ok(output.includes('--fix'));
  });
});

// =============================================================================
// Output mode flags
// =============================================================================

describe('output mode flags', () => {
  it('--version flag prints version', () => {
    const output = run('--version');
    assert.match(output, /\d+\.\d+\.\d+/);
  });
});

// =============================================================================
// Error handling: unknown command
// =============================================================================

describe('unknown commands', () => {
  it('shows error for unknown command', () => {
    const { stderr } = runExpectFail('nonexistent-command-xyz');
    assert.ok(
      stderr.includes('unknown command') || stderr.includes('error'),
      'should report unknown command',
    );
  });
});

// =============================================================================
// Command registration integrity
// =============================================================================

describe('command registration', () => {
  it('all expected commands are registered', () => {
    const output = run('--help');
    const expectedCommands = [
      'version', 'login', 'logout', 'whoami', 'credits',
      'plan', 'config', 'status', 'download',
      'list', 'profile', 'doctor', 'inspect',
      'delete', 'cancel', 'apikey', 'usage', 'subscribe', 'debug',
      'alias', 'update', 'completions',
      'persona', 'actor', 'selfie', 'character', 'subs', 'skill',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(output.includes(cmd), `help output should include '${cmd}' command`);
    }
  });
});

// =============================================================================
// character-video command (Content Machine pipeline)
// =============================================================================

describe('agent-media character-video', () => {
  it('shows usage in --help', () => {
    const output = run('character-video --help');
    assert.ok(output.includes('character sheet'), 'help should mention character sheet step');
    assert.ok(output.includes('--description'));
    assert.ok(output.includes('--actor'));
    assert.ok(output.includes('--reference-image'));
    assert.ok(output.includes('--beats'));
    assert.ok(output.includes('--script'));
    assert.ok(output.includes('--duration'));
    assert.ok(output.includes('--aspect'));
  });

  it('rejects when no character source is provided', () => {
    const { stderr } = runExpectFail('character-video');
    assert.ok(
      /one of --description.*--actor.*--reference-image/i.test(stderr),
      `stderr should explain missing character source, got: ${stderr}`,
    );
  });

  it('rejects --actor + --reference-image (mutex)', () => {
    const { stderr } = runExpectFail(
      'character-video --actor mei --reference-image https://example.com/p.png --beats "a,b,c"',
    );
    assert.ok(
      /mutually exclusive/i.test(stderr),
      `stderr should reject actor + reference-image, got: ${stderr}`,
    );
  });

  it('rejects when neither --beats nor --script provided', () => {
    const { stderr } = runExpectFail('character-video --description "Marco the chef"');
    assert.ok(
      /exactly one of --beats or --script/i.test(stderr),
      `stderr should require beats or script, got: ${stderr}`,
    );
  });

  it('rejects --beats + --script (mutex)', () => {
    const { stderr } = runExpectFail(
      'character-video --description "Marco" --beats "a,b,c" --script "ten char min script"',
    );
    assert.ok(
      /exactly one of --beats or --script/i.test(stderr),
      `stderr should reject both beats and script, got: ${stderr}`,
    );
  });

  it('rejects --duration outside {5, 10}', () => {
    const { stderr } = runExpectFail(
      'character-video --description "Marco" --beats "a,b,c" --duration 7',
    );
    assert.ok(
      /Invalid --duration|Use 5 or 10/i.test(stderr),
      `stderr should reject bad duration, got: ${stderr}`,
    );
  });

  it('rejects --aspect outside the supported set', () => {
    const { stderr } = runExpectFail(
      'character-video --description "Marco" --beats "a,b,c" --aspect 4:3',
    );
    assert.ok(
      /Invalid --aspect|Use 9:16, 16:9, or 1:1/i.test(stderr),
      `stderr should reject bad aspect ratio, got: ${stderr}`,
    );
  });

  it('rejects --beats with fewer than 3 entries', () => {
    const { stderr } = runExpectFail(
      'character-video --description "Marco" --beats "only,two"',
    );
    assert.ok(
      /3-10 entries/.test(stderr),
      `stderr should reject too-few beats, got: ${stderr}`,
    );
  });
});

// =============================================================================
// Phase 1 — CLI opaque-failure fixes
// =============================================================================

// A1 — backend Zod `error.issues` is surfaced, not dropped.
describe('validation issues are surfaced (A1)', () => {
  it('v2SubmitError preserves the backend field-level issues', () => {
    const err = v2SubmitError(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        issues: [{ path: ['scene_action'], message: 'String must contain at most 400 character(s)' }],
      },
    });
    assert.ok(err instanceof CLIError);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.issues?.length, 1);
    assert.equal(err.issues?.[0]?.path?.[0], 'scene_action');
    assert.match(err.issues?.[0]?.message ?? '', /at most 400/);
  });

  it('v2SubmitError falls back cleanly when no issues are present', () => {
    const err = v2SubmitError(500, { error: { message: 'boom' } });
    assert.equal(err.code, 'SUBMIT_FAILED');
    assert.equal(err.issues, undefined);
    assert.equal(err.message, 'boom');
  });
});

// A4 — generic errors classified so the printed code matches the cause.
describe('error classification (A4)', () => {
  it('classifies "fetch failed" as NETWORK_UNREACHABLE (not UNEXPECTED_ERROR)', () => {
    assert.equal(classifyError(new Error('fetch failed')).code, 'NETWORK_UNREACHABLE');
  });

  it('reads the undici error.cause for the real ECONNREFUSED', () => {
    const e = new Error('fetch failed');
    (e as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
    assert.equal(classifyError(e).code, 'NETWORK_UNREACHABLE');
  });

  it('still falls back to UNEXPECTED_ERROR for a genuinely unknown error', () => {
    assert.equal(classifyError(new Error('something odd happened')).code, 'UNEXPECTED_ERROR');
  });
});

// A3 — content/safety rejections get actionable rephrase guidance.
describe('content-policy guidance (A3)', () => {
  it('returns rephrase guidance on a safety-system rejection', () => {
    const s = contentPolicySuggestion('OpenAI images.generations failed: Your request was rejected by the safety system');
    assert.ok(s && /rephrase/i.test(s), 'suggestion should tell the user to rephrase');
  });

  it('returns undefined for a non-safety failure', () => {
    assert.equal(contentPolicySuggestion('Job timed out after 15 minutes'), undefined);
  });
});

// C2 — `character show` is implemented (no longer a "Not implemented yet" stub).
describe('character show (C2)', () => {
  it('is no longer a stub — resolves the id via a real path, not "Not implemented"', () => {
    // Robust to both authed (→ CHARACTER_NOT_FOUND) and unauthed (→ UNAUTHENTICATED)
    // environments; the regression under test is that it is no longer a stub.
    const { stderr } = runExpectFail('character show char_TEST1234');
    assert.ok(!stderr.includes('Not implemented'), `show should be implemented, got: ${stderr}`);
    assert.ok(/Error code:/.test(stderr), `show should emit a structured CLI error, got: ${stderr}`);
  });
});
