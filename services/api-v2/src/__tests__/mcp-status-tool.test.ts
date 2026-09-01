// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * The hosted connector must let an agent CHECK a generation it submitted.
 *
 * Without get_run_status the connector was write-only: every submit handler
 * told the agent to "poll for status", and no tool existed that could. A real
 * external agent session submitted four videos and could not report a single
 * outcome or URL. These tests are the drift gate on that contract.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../routes/mcp.ts'),
  'utf8',
);

describe('hosted MCP: run-status tool', () => {
  it('declares get_run_status and lists it in tools/list', () => {
    expect(source).toContain("name: 'get_run_status'");
    expect(source).toContain('getRunStatusTool,');
  });

  it('resolves all three id shapes — composed skill, primitive, v2 job', () => {
    expect(source).toContain('/v1/skills/runs/');
    expect(source).toContain('/v1/primitives/runs/');
    expect(source).toContain('/v1/videos/');
  });

  it('never advertises a tool this server does not implement', () => {
    // get_video_status exists only in the npm stdio server. Naming it here
    // sent agents hunting for a tool that was not in their tool list.
    expect(source).not.toContain('get_video_status');
  });

  it('points every submit path at the status tool by name', () => {
    const submitHints = source.match(/NEXT STEP: call get_run_status/g) ?? [];
    // one for the vNext skill path, one for the v2 generator path
    expect(submitHints.length).toBeGreaterThanOrEqual(2);
  });

  it('treats every terminal status as terminal, so wait cannot hang', () => {
    for (const s of ['completed', 'succeeded', 'failed', 'canceled', 'cancelled', 'error']) {
      expect(source).toContain(`'${s}'`);
    }
  });

  it('surfaces the output URL under every name a pipeline uses', () => {
    for (const field of ['video_url', 'output_url', 'result_url', 'output_media_url']) {
      expect(source).toContain(field);
    }
  });
});
