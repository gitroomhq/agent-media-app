// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * /dashboard/docs — internal Skills & MCP guide.
 *
 * Reuses the exact public Skills & CLI hub content (ConnectGuide + live skills
 * grid + REST snippet) so there's a single source of truth for "how to connect
 * agent-media". `internal` keeps it self-contained: the MCP/CLI/Skill tabs
 * switch via state only and never push the public /mcp /cli /skills URLs that
 * would bounce the signed-in user out to the marketing site.
 */

import { SkillsHub } from '@/components/skills-hub';

export default function DocsPage() {
  return <SkillsHub initialTab="mcp" internal />;
}
