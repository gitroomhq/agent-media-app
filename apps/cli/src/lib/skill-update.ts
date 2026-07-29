// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Skill auto-update helper.
 *
 * What this does:
 *   - On every CLI invocation, fires a background check (throttled to
 *     once / 24h) against the public SKILL.md on github.com/gitroomhq/
 *     agent-media.
 *   - If the remote `version:` is newer than the local copy in
 *     `~/.claude/skills/agent-media-v2/SKILL.md`, prints a one-line
 *     stderr nudge: "→ skill update available, run agent-media skill update".
 *   - If env var `AGENT_MEDIA_AUTO_UPDATE_SKILL=1` is set, writes the new
 *     SKILL.md in place (no prompt). Off by default — we never silently
 *     mutate files in another tool's config directory.
 *
 * What this does NOT do:
 *   - Force-update without user opt-in.
 *   - Touch Claude.ai / MCP integrations (those auto-update because
 *     the MCP server lives on our backend at api.agent-media.ai/mcp —
 *     no client cache).
 *   - Run inline / block the user's command. The check runs in the
 *     background and the CLI exits when the user's command exits,
 *     even if the check is still in flight.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

const SKILL_NAME = 'agent-media-v2';
const SKILL_DIR = join(homedir(), '.claude', 'skills', SKILL_NAME);
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md');
const CHECK_STAMP = join(homedir(), '.agent-media', '.skill-update-check');

const REMOTE_BASE =
  'https://raw.githubusercontent.com/gitroomhq/agent-media/main';

// Canonical version anchor. The public repo is multi-skill now; the
// agent-media-ugc playbook is the "main" skill and carries the bundle's
// `x-skill-version`. We compare against it (the old root /SKILL.md is gone).
const REMOTE_URL = `${REMOTE_BASE}/skills/agent-media-ugc/SKILL.md`;

// Skill tree manifest — { remote path in the public repo → local path under
// the install dir }. The playbook is mirrored as the top-level SKILL.md so a
// single-folder install stays coherent; every per-skill SKILL.md + the shared
// reference docs come along. Hard-coded (not fetched) so a partial network
// failure never writes a broken half.
const SKILL_TREE: ReadonlyArray<{ remote: string; local: string }> = [
  { remote: 'skills/agent-media-ugc/SKILL.md', local: 'SKILL.md' },
  { remote: 'skills/make-portrait/SKILL.md', local: 'skills/make-portrait/SKILL.md' },
  { remote: 'skills/make-character-sheet/SKILL.md', local: 'skills/make-character-sheet/SKILL.md' },
  { remote: 'skills/make-simple-selfie/SKILL.md', local: 'skills/make-simple-selfie/SKILL.md' },
  { remote: 'skills/make-subtitles/SKILL.md', local: 'skills/make-subtitles/SKILL.md' },
  { remote: 'skills/make-wireframe/SKILL.md', local: 'skills/make-wireframe/SKILL.md' },
  { remote: 'skills/make-lip-sync/SKILL.md', local: 'skills/make-lip-sync/SKILL.md' },
  { remote: 'skills/make-ugc-video/SKILL.md', local: 'skills/make-ugc-video/SKILL.md' },
  { remote: 'skills/make-broll-talking-head/SKILL.md', local: 'skills/make-broll-talking-head/SKILL.md' },
  { remote: 'skills/publish-to-social/SKILL.md', local: 'skills/publish-to-social/SKILL.md' },
  { remote: 'reference/auth.md', local: 'reference/auth.md' },
  { remote: 'reference/pacing.md', local: 'reference/pacing.md' },
  { remote: 'reference/realism-rubric.md', local: 'reference/realism-rubric.md' },
  { remote: 'README.md', local: 'README.md' },
] as const;

/** Minimum interval between remote checks. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(v: string | null): VersionParts | null {
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1]!, minor: +m[2]!, patch: +m[3]! };
}

function compareVersions(a: VersionParts, b: VersionParts): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch
  );
}

function extractVersionField(md: string): string | null {
  // Match the YAML frontmatter version line. Multi-skill SKILL.md files use
  // `x-skill-version: '1.2.0'` (quoted); the old single skill used
  // `version: 1.2.0`. Accept either, stripping surrounding quotes.
  const m = md.match(/^(?:x-skill-version|version):\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)/m);
  return m?.[1] ?? null;
}

async function readLocalSkill(): Promise<{ md: string; version: string | null } | null> {
  try {
    const md = await readFile(SKILL_PATH, 'utf8');
    return { md, version: extractVersionField(md) };
  } catch {
    return null;
  }
}

async function fetchRemoteSkill(timeoutMs = 4_000): Promise<{ md: string; version: string | null } | null> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const resp = await fetch(REMOTE_URL, { signal: ac.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const md = await resp.text();
    return { md, version: extractVersionField(md) };
  } catch {
    return null;
  }
}

async function shouldCheckNow(): Promise<boolean> {
  if (process.env.AGENT_MEDIA_SKIP_SKILL_CHECK === '1') return false;
  try {
    const s = await stat(CHECK_STAMP);
    if (Date.now() - s.mtimeMs < CHECK_INTERVAL_MS) return false;
  } catch {
    // no stamp yet
  }
  return true;
}

async function writeCheckStamp(): Promise<void> {
  try {
    await mkdir(join(homedir(), '.agent-media'), { recursive: true });
    await writeFile(CHECK_STAMP, String(Date.now()), 'utf8');
  } catch {
    // best-effort
  }
}

/**
 * Replace the local SKILL.md with the given content. Creates the
 * `~/.claude/skills/agent-media-v2/` directory if needed.
 */
async function writeLocalSkill(md: string): Promise<void> {
  await mkdir(SKILL_DIR, { recursive: true });
  await writeFile(SKILL_PATH, md, 'utf8');
}

/**
 * Pull every file in the skill tree (SKILL.md + reference/*) and write
 * to ~/.claude/skills/agent-media-v2/. Returns counts.
 *
 * Failure-mode: if ANY file in the tree can't be fetched we abort and
 * don't write anything — partial trees are worse than a stale full
 * tree.
 */
async function pullFullSkillTree(timeoutMs = 15_000): Promise<{
  written: number;
  totalBytes: number;
  version: string | null;
} | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const fetched = await Promise.all(
      SKILL_TREE.map(async ({ remote, local }) => {
        const resp = await fetch(`${REMOTE_BASE}/${remote}`, { signal: ac.signal });
        if (!resp.ok) throw new Error(`${remote}: HTTP ${resp.status}`);
        return { local, content: await resp.text() };
      }),
    );
    let totalBytes = 0;
    let version: string | null = null;
    await mkdir(SKILL_DIR, { recursive: true });
    for (const { local, content } of fetched) {
      const abs = join(SKILL_DIR, local);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content, 'utf8');
      totalBytes += content.length;
      if (local === 'SKILL.md') version = extractVersionField(content);
    }
    return { written: fetched.length, totalBytes, version };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Background check — fires on every CLI invocation, but throttled and
 * silent unless an update is actually available. Never blocks the
 * caller; returns a promise the caller can ignore.
 */
export async function maybeCheckSkillUpdate(): Promise<void> {
  if (!(await shouldCheckNow())) return;
  await writeCheckStamp(); // record attempt regardless of outcome

  const local = await readLocalSkill();
  if (!local) return; // skill not installed via Claude Code — nothing to update

  const remote = await fetchRemoteSkill();
  if (!remote || !remote.version) return;

  const localV = parseVersion(local.version);
  const remoteV = parseVersion(remote.version);
  if (!localV || !remoteV) return;
  if (compareVersions(remoteV, localV) <= 0) return;

  // Remote is newer.
  if (process.env.AGENT_MEDIA_AUTO_UPDATE_SKILL === '1') {
    try {
      await writeLocalSkill(remote.md);
      process.stderr.write(
        chalk.dim(
          `\n→ agent-media skill auto-updated to ${remote.version} ` +
            `(was ${local.version})\n`,
        ),
      );
    } catch {
      // fall through to the manual nudge
    }
    return;
  }

  process.stderr.write(
    chalk.yellow(
      `\n→ agent-media skill update available: ${local.version} → ${remote.version}` +
        `\n  Run: ${chalk.bold('agent-media skill update')}` +
        `\n  Or:  ${chalk.dim('AGENT_MEDIA_AUTO_UPDATE_SKILL=1')} to update silently next time.\n`,
    ),
  );
}

/**
 * Subcommand handler: `agent-media skill update`.
 * Pulls the FULL skill tree (SKILL.md + reference/*) into
 * ~/.claude/skills/agent-media-v2/. Aborts atomically if any file
 * fails — a partial tree is worse than a stale full tree.
 */
export async function runSkillUpdate(): Promise<void> {
  const local = await readLocalSkill();
  const fromVer = local?.version ?? '(not installed)';
  const result = await pullFullSkillTree(20_000);
  if (!result) {
    process.stderr.write(
      chalk.red(
        `✖ couldn't pull the skill tree from ${REMOTE_BASE} — check your network.\n`,
      ),
    );
    process.exit(1);
  }
  await writeCheckStamp();
  process.stderr.write(
    chalk.green(
      `✓ agent-media skill updated to ${result.version ?? '(no version)'} ` +
        `(was ${fromVer})\n` +
        chalk.dim(
          `  ${result.written} files · ${result.totalBytes} bytes\n  ${SKILL_DIR}\n`,
        ),
    ),
  );
}

/**
 * Subcommand handler: `agent-media skill status`.
 * Prints what's installed locally vs. what's on GitHub.
 */
export async function runSkillStatus(): Promise<void> {
  const local = await readLocalSkill();
  const remote = await fetchRemoteSkill(10_000);
  process.stdout.write(
    [
      chalk.bold('agent-media skill'),
      `  local:  ${local?.version ?? chalk.dim('(not installed)')}`,
      `  remote: ${remote?.version ?? chalk.dim('(unreachable)')}`,
      `  path:   ${SKILL_PATH}`,
      '',
    ].join('\n'),
  );
  if (local && remote && local.version && remote.version) {
    const localV = parseVersion(local.version);
    const remoteV = parseVersion(remote.version);
    if (localV && remoteV && compareVersions(remoteV, localV) > 0) {
      process.stdout.write(
        chalk.yellow(
          `→ update available. Run: ${chalk.bold('agent-media skill update')}\n`,
        ),
      );
    } else {
      process.stdout.write(chalk.green('✓ up to date.\n'));
    }
  }
}
