// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/** /skills — public Skills & CLI hub (Skill tab default). */

import { SkillsHub } from '@/components/skills-hub';

export default function PublicSkillsPage() {
  return <SkillsHub initialTab="skill" />;
}
