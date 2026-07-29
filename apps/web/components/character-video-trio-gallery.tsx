// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Homepage "Behind the Scenes" gallery.
 *
 * For each example actor, render the storyboard panel grid as the
 * production-dossier backdrop with the final video inset at the bottom,
 * mimicking the X.com layout style (production sheet above, live shot
 * overlapping). Below the row: a giant "Boost your content" CTA that
 * routes to login → /create/character-video.
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';
import { LoginButton } from '@/components/login-button';

interface Trio {
  actor: string;
  theme: string;
  characterSheetUrl: string;
  storyboardUrl: string;
  videoUrl: string;
}

const TRIOS: Trio[] = [
  {
    actor: 'Marco',
    theme: 'Chef',
    characterSheetUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/d9358286-c52b-40d0-90ac-64705dcafa47/character-sheet.png',
    storyboardUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/6053f946-a893-4010-825b-26a6ffaed91e/storyboard.png',
    videoUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/20017840-644f-44ae-aad6-d85b86f54bee/character-video-final.mp4',
  },
  {
    actor: 'Aiko',
    theme: 'Barista',
    characterSheetUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/23a9369e-c050-47cb-ab5e-d2075e3f31f4/character-sheet.png',
    storyboardUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/16e6f719-7faf-4847-9bd1-25fa0a50c3ad/storyboard.png',
    videoUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/aeb9ef31-4a21-4471-8f3e-d0420e5cd3cb/character-video-final.mp4',
  },
  {
    actor: 'Marcus',
    theme: 'Fitness Trainer',
    characterSheetUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/e6358de1-e20f-4082-84f5-d668b5623e3e/character-sheet.png',
    storyboardUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/9c3a6ef0-c24d-4f20-9ace-1eab51c2ad09/storyboard.png',
    videoUrl:
      'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/228851c3-5e89-49d4-903b-09d72704b881/character-video-final.mp4',
  },
];

function TrioCard({ trio }: { trio: Trio }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-white ring-1 ring-zinc-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18)]">
      {/* Header — actor portrait + name (overlaid on the storyboard image, kept
          white-on-shadow because storyboards have varied bgs) */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3">
        <div className="relative size-12 shrink-0 rounded-full ring-2 ring-white/80 overflow-hidden bg-white">
          <Image
            src={trio.characterSheetUrl}
            alt={trio.actor}
            fill
            sizes="48px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white drop-shadow">{trio.actor}</p>
          <p className="text-xs text-zinc-300 drop-shadow">{trio.theme}</p>
        </div>
        <div className="ml-auto rounded-full bg-black/50 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-white/80 backdrop-blur ring-1 ring-white/10">
          Storyboard + Video
        </div>
      </div>

      {/* Storyboard backdrop — the production dossier (80% opacity so the
          video below pops harder) */}
      <div className="relative aspect-square">
        <Image
          src={trio.storyboardUrl}
          alt={`${trio.actor} storyboard`}
          fill
          sizes="(max-width: 1024px) 100vw, 33vw"
          className="object-cover opacity-80"
          quality={70}
        />
        {/* Subtle gradient at the bottom so the inset video pops */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-white/70 via-white/30 to-transparent" />
      </div>

      {/* Final video inset — overlaps the bottom of the storyboard */}
      <div className="relative -mt-32 mx-4 mb-4 sm:-mt-40 sm:mx-6 sm:mb-6">
        <div className="relative overflow-hidden rounded-2xl ring-2 ring-white/30 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] aspect-video bg-black">
          <video
            src={trio.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white backdrop-blur">
            0:10 · 16:9
          </div>
        </div>
      </div>
    </div>
  );
}

export function CharacterVideoTrioGallery() {
  return (
    <section className="relative bg-white py-20 sm:py-28">
      {/* Subtle radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(800px 400px at 50% 0%, rgba(236,72,153,0.10), transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* Headline */}
        <div className="mb-12 text-center sm:mb-16">
          <span className="inline-block rounded-full bg-[#ec4899]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#ec4899] ring-1 ring-[#ec4899]/30">
            Character Video · NEW
          </span>
          <h2 className="mt-5 text-4xl font-light leading-tight tracking-tight text-[#121212] sm:text-5xl lg:text-6xl">
            Boost your <span className="font-extrabold">social media</span>
            <br className="hidden sm:block" />
            <span> with our </span>
            <span className="font-extrabold text-[#ec4899]">Content Machine</span>
          </h2>
          <p className="mx-auto mt-5 text-base text-[#6b6b76] sm:text-lg">
            with automated <span className="font-semibold text-[#121212]">Seedance 2</span>
            {' + '}
            <span className="font-semibold text-[#121212]">GPT Image 2</span>
          </p>
        </div>

        {/* Trios */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {TRIOS.map((trio) => (
            <TrioCard key={trio.actor} trio={trio} />
          ))}
        </div>

        {/* Mega CTA */}
        <div className="mt-20 text-center sm:mt-28">
          <h3 className="text-3xl font-extrabold text-[#121212] sm:text-5xl">
            Boost Your Content
          </h3>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[#6b6b76]">
            Sign in, pick an actor, get a sheet + storyboard + 16:9 video you
            can post to X, TikTok, or LinkedIn — today.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <LoginButton className="group inline-flex items-center justify-center rounded-2xl bg-[#ec4899] px-10 py-5 text-lg font-bold text-white shadow-[0_8px_28px_rgba(236,72,153,0.45)] transition-all duration-200 hover:scale-[1.02] hover:bg-[#db2777] hover:shadow-[0_12px_36px_rgba(236,72,153,0.6)] sm:text-xl">
              <Sparkles className="mr-3 size-5" />
              Boost Your Content
              <ArrowRight className="ml-3 size-5 transition-transform group-hover:translate-x-1" />
            </LoginButton>
            <Link
              href="/create/character-video"
              className="text-sm font-semibold text-[#6b6b76] underline-offset-4 hover:text-[#121212] hover:underline"
            >
              Already a member? Open the wizard →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
