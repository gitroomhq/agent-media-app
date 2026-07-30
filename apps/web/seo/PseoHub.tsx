// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// Hub (index) page for a pSEO family — lists all published pages grouped by
// target kind. Linked from the footer; gives crawlers a 2-click path to every
// pSEO page and consolidates internal link equity.

import Link from 'next/link';
import { hubGroups, type Family } from './pseo-engine';

const GROUP_TITLES: Record<string, string> = {
  vertical: 'By industry',
  platform: 'By platform',
  audience: 'By team',
};

export function PseoHub({
  family,
  title,
  intro,
}: {
  family: Family;
  title: string;
  intro: string;
}) {
  const groups = hubGroups(family);
  const kinds = (['platform', 'vertical', 'audience'] as const).filter(
    (k) => groups[k].length > 0,
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-neutral-100">
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutral-300">{intro}</p>
      {kinds.length === 0 && (
        <p className="mt-10 text-neutral-400">New guides publish daily — check back tomorrow.</p>
      )}
      {kinds.map((kind) => (
        <section key={kind} className="mt-12">
          <h2 className="text-2xl font-semibold">{GROUP_TITLES[kind]}</h2>
          <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {groups[kind].map((item, i) => (
              <li key={i}>
                <Link
                  href={item.path}
                  className="text-neutral-300 underline-offset-4 hover:text-white hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
