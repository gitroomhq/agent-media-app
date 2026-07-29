// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import Link from 'next/link';
import {
  Smartphone,
  Video,
  Megaphone,
  ArrowRight,
  PackageOpen,
  Laptop,
} from 'lucide-react';

type Card = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: 'PRESET' | 'TOOL';
  badgeColor: string;
  isNew?: boolean;
  meta: string[];
  accent: string;
  previewUrl: string;
  hero?: boolean;
};

const CARDS: Card[] = [
  {
    href: '/create/product-acting',
    title: 'Product Acting UGC',
    description: 'Upload a product, pick an actor, choose a wild or natural acting pose, and generate product-in-hand UGC.',
    icon: PackageOpen,
    badge: 'PRESET',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    isNew: true,
    meta: ['9:16', '5-15s', 'Product acting'],
    accent: 'bg-gradient-to-br from-pink-50 to-rose-50',
    previewUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/632b7373-11db-4434-8726-32a5024b16c1/product-acting-final.mp4',
    hero: true,
  },
  {
    href: '/create/show-your-app',
    title: 'Show Your App',
    description: 'AI actor holds a phone showing your app screenshot, with Hormozi-style subtitles burned in. One click, one output.',
    icon: Smartphone,
    badge: 'PRESET',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    isNew: true,
    meta: ['9:16', '5–15s', 'Hormozi subs'],
    accent: 'bg-gradient-to-br from-emerald-50 to-teal-50',
    previewUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/3469c2ad-b596-49ac-96ed-a62b8783544b/show-your-app-final.mp4',
    hero: true,
  },
  {
    href: '/create/laptop-ugc',
    title: 'Laptop UGC',
    description: '3-scene ad: actor holds laptop showing your app, scrolls, then talks to camera. Native lip-synced audio.',
    icon: Laptop,
    badge: 'PRESET',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    isNew: true,
    meta: ['9:16', '15–20s', 'Hormozi subs'],
    accent: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    previewUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/3469c2ad-b596-49ac-96ed-a62b8783544b/show-your-app-final.mp4',
    hero: true,
  },
  {
    href: '/create/ugc-video',
    title: 'UGC Video',
    description: 'Full UGC pipeline — talking head, B-roll, voiceover, subtitles. 5-step wizard with per-scene control.',
    icon: Video,
    badge: 'PRESET',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    meta: ['9:16 | 1:1 | 16:9', '5–15s', '17 styles'],
    accent: 'bg-gradient-to-br from-orange-50 to-amber-50',
    previewUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/7e17e7f7-acd3-4e48-8143-1a871229f442/ugc-final.mp4',
  },
  {
    href: '/create/saas-review',
    title: 'SaaS Review',
    description: 'SaaS review video with talking head + product screenshots as B-roll. Script generated from a product URL.',
    icon: Megaphone,
    badge: 'PRESET',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    meta: ['9:16 | 16:9', '10–15s', 'B-roll'],
    accent: 'bg-gradient-to-br from-violet-50 to-fuchsia-50',
    previewUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/e229b1d5-b14b-46e8-84ee-0dc5c7d7bb49/ugc-final.mp4',
  },
];

function CardView({ card }: { card: Card }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className={`group relative grid overflow-hidden rounded-2xl border border-gray-200 ${card.accent} transition-all hover:border-gray-900 hover:shadow-lg lg:grid-cols-[minmax(0,1fr)_176px]`}
    >
      {card.isNew && (
        <span className="absolute right-4 top-4 z-10 rounded bg-black px-2 py-0.5 text-[10px] font-bold text-white">
          NEW
        </span>
      )}
      <div className="flex min-w-0 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <Icon className="h-5 w-5 text-gray-900" />
          </div>
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${card.badgeColor}`}>
            {card.badge}
          </span>
        </div>
        <h3 className="mt-4 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
          {card.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-gray-600 sm:text-[15px]">
          {card.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {card.meta.map((m) => (
            <span key={m} className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
              {m}
            </span>
          ))}
        </div>
        <div className="mt-auto pt-5">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
            Start <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
      <div className="relative h-72 overflow-hidden bg-gray-950/90 lg:h-full lg:min-h-[300px]">
        <video
          src={`${card.previewUrl}#t=0.4`}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-950">
            Example output
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function CreatePickerPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">What do you want to create?</h1>
        <p className="mt-2 text-gray-600">Pick a preset or tool. Each one is tuned for a specific use case.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {CARDS.map((c) => (
          <CardView key={c.href} card={c} />
        ))}
      </div>
      <div className="mt-12 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
        <span className="font-medium text-gray-900">Prefer the API?</span>{' '}
        All presets are available at <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-800 ring-1 ring-inset ring-gray-200">POST /v1/generate/&lt;preset&gt;</code>. See the{' '}
        <Link href="/docs/api-reference" className="font-medium text-gray-900 underline underline-offset-2 hover:no-underline">API reference</Link>.
      </div>
    </div>
  );
}
