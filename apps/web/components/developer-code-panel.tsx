// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useState } from 'react';
import { Check, Clipboard, Code2 } from 'lucide-react';

export interface DeveloperSnippet {
  id: string;
  label: string;
  language: string;
  code: string;
}

export function DeveloperCodePanel({
  title = 'Developer handoff',
  description = 'Live code for the current settings.',
  snippets,
}: {
  title?: string;
  description?: string;
  snippets: DeveloperSnippet[];
}) {
  const [active, setActive] = useState(snippets[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const selected = snippets.find((snippet) => snippet.id === active) ?? snippets[0];

  if (!selected) return null;

  async function copyCode() {
    await navigator.clipboard.writeText(selected.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-[#101010] text-white shadow-sm">
      <div className="border-b border-white/10 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-white/55">{description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-white/10 p-1">
          {snippets.map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              onClick={() => setActive(snippet.id)}
              className={`min-w-16 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                selected.id === snippet.id
                  ? 'bg-white text-[#121212]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              {snippet.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/40">
            {selected.language}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="max-h-[420px] w-full max-w-full overflow-auto rounded-lg bg-black p-3 text-[11px] leading-relaxed sm:text-xs">
          <code className="block min-w-max text-white/80">{selected.code}</code>
        </pre>
      </div>
    </section>
  );
}
