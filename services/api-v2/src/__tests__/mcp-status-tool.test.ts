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

  it('reads a COMPOSED run: final_output.video_url and steps[].artifacts', () => {
    // Live production run 8f9a40f1 (make_ugc_video) finished with
    //   { status: 'succeeded', final_output: { video_url: 'https://…mp4' },
    //     steps: [{ artifacts: [{ url, kind, mime }] }] }
    // Nothing in the extractor looked one level down, so the tool reported
    // "succeeded" and no link — the agent still could not give the user the
    // video, which is the whole reason this tool exists.
    expect(source).toContain('b.final_output?.video_url');
    expect(source).toContain('Array.isArray(b.steps)');
    expect(source).toContain('stepArtifacts');
  });

  it('reads artifacts[] — primitive/skill runs return an array, not a scalar url', () => {
    // A finished product_in_hands run reports {status:'succeeded', artifacts:[{url,kind,mime}]}.
    // Scalar-only extraction reported success with NO link, which leaves the
    // agent exactly as stuck as having no status tool at all.
    expect(source).toContain('Array.isArray(b.artifacts)');
    expect(source).toContain("a.mime.startsWith('video/')");
    expect(source).toContain('videoArtifact?.url');
  });

  it('lists the non-video artifacts too, so a sheet/portrait needs no second call', () => {
    expect(source).toContain('otherArtifacts');
  });

  it('surfaces the output URL under every name a pipeline uses', () => {
    for (const field of ['video_url', 'output_url', 'result_url', 'output_media_url']) {
      expect(source).toContain(field);
    }
  });
});

/**
 * Anthropic's Connectors Directory review rejects any server whose tools
 * lack a title and the applicable read-only / destructive hint. This gate
 * fails the build rather than the review queue.
 */
describe('hosted MCP: directory submission requirements', () => {
  it('annotates every tool — read-only tools and generation tools alike', () => {
    expect(source).toContain('function readOnlyAnnotations');
    expect(source).toContain('function generationAnnotations');
    expect(source).toContain("readOnlyAnnotations('List Characters')");
    expect(source).toContain("readOnlyAnnotations('Get Run Status')");
    // both generated families carry annotations
    expect(source).toContain('annotations: generationAnnotations(titleFromSlug(def.mcp!.toolName))');
    expect(source).toContain('annotations: generationAnnotations(s.name)');
  });

  it('declares both hints on every annotation shape', () => {
    for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
      expect(source).toContain(hint);
    }
  });

  it('never marks a generation tool read-only — they spend credits', () => {
    const gen = source.slice(source.indexOf('function generationAnnotations'));
    expect(gen.slice(0, 200)).toContain('readOnlyHint: false');
  });
});
