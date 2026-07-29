'use client';

import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface SocialCard {
  handle: string;
  title: string;
  video: string;
  likes: string;
  likesGrowth: string;
  followers: string;
  followersGrowth: string;
}

export function SocialProofCards({ cards }: { cards: SocialCard[] }) {
  const [unmutedIdx, setUnmutedIdx] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  function toggleMute(idx: number) {
    if (unmutedIdx === idx) {
      // Mute this one
      if (videoRefs.current[idx]) videoRefs.current[idx]!.muted = true;
      setUnmutedIdx(null);
    } else {
      // Mute previous
      if (unmutedIdx !== null && videoRefs.current[unmutedIdx]) {
        videoRefs.current[unmutedIdx]!.muted = true;
      }
      // Unmute this one
      if (videoRefs.current[idx]) videoRefs.current[idx]!.muted = false;
      setUnmutedIdx(idx);
    }
  }

  return (
    <div className="flex items-end justify-center gap-6">
      {cards.map((card, idx) => (
        <div
          key={card.handle}
          className={`w-[280px] flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] sm:w-[320px] ${idx === 1 ? '-translate-y-6' : ''}`}
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-4 pt-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/70">
                {card.handle[1].toUpperCase()}
              </div>
              <div>
                <p className="text-xs text-white/50">{card.handle}</p>
                <p className="text-sm font-semibold text-white">{card.title}</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              ACTIVE
            </span>
          </div>

          {/* Video with mute toggle */}
          <div className="relative mx-4 mt-3 overflow-hidden rounded-xl">
            <video
              ref={(el) => { videoRefs.current[idx] = el; }}
              autoPlay loop muted playsInline preload="none"
              className="aspect-[3/4] w-full object-cover"
              src={card.video}
            />
            <button
              type="button"
              onClick={() => toggleMute(idx)}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              {unmutedIdx === idx ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-6 px-4 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Likes</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-white">{card.likes}</span>
                <span className="text-xs font-medium text-green-400">{card.likesGrowth}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Followers</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-white">{card.followers}</span>
                <span className="text-xs font-medium text-green-400">{card.followersGrowth}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
