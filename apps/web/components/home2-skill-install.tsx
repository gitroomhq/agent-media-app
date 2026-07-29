// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

/**
 * Hero install one-liner. `npx skills add <owner/repo>` (vercel-labs' open
 * skills CLI) pulls every SKILL.md from gitroomhq/agent-media into the user's
 * agent — verified to discover all 7 agent-media skills. Lives under the H1.
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const INSTALL_CMD = 'npx skills add gitroomhq/agent-media';

export function SkillInstallBlock() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort; clipboard API blocked in some browsers
    }
  };

  return (
    <div
      className="mt-2 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 sm:px-5 sm:py-3"
      style={{
        background: 'linear-gradient(180deg, rgba(167,139,250,0.10) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid rgba(167,139,250,0.30)',
        boxShadow: '0 0 0 1px rgba(167,139,250,0.10), 0 24px 60px -16px rgba(167,139,250,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <code
        className="min-w-0 flex-1 select-all whitespace-nowrap overflow-x-auto font-mono leading-snug"
        style={{ color: 'var(--cryptix-text)', fontSize: 'clamp(12px, 1.7vw, 18px)' }}
      >
        <span style={{ color: 'var(--cryptix-mint, #A78BFA)' }}>$</span>{' '}
        {INSTALL_CMD}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy install command"
        className="flex-none inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors"
        style={{
          color: copied ? '#34D399' : 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(255,255,255,0.18)',
          backgroundColor: 'rgba(255,255,255,0.04)',
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}
