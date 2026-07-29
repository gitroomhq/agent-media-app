// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * /home2 - Integrations grid.
 *
 * Top-down triangle (funnel): each row narrows by one populated tile,
 * forming a clean triangular cluster of agent/tool logos. Empty ghost
 * tiles flank each row so the underlying grid rhythm reads. The whole
 * grid has a horizontal mask gradient so the side cells fade out into
 * the page background - the eye reads the populated cluster, the ghost
 * tiles ghost away to the edges.
 *
 * Alternate rows are offset by half a tile width for a brick rhythm
 * inside the triangle.
 */

import {
  siAnthropic,
  siClaude,
  siCrewai,
  siCursor,
  siDiscord,
  siGithub,
  siGithubcopilot,
  siGooglegemini,
  siHuggingface,
  siLangchain,
  siMake,
  siMeta,
  siMistralai,
  siN8n,
  siNotion,
  siPerplexity,
  siReplicate,
  siReplit,
  siV0,
  siVercel,
  siWindsurf,
  siX,
  siZapier,
} from 'simple-icons';
import type { SimpleIcon as SimpleIconType } from 'simple-icons';

interface Tile {
  icon: SimpleIconType;
  color?: string;
}

// 25 tiles distributed 7 → 6 → 5 → 4 → 3 across five rows to form a
// downward-pointing triangle.
const TILES_FLAT: Tile[] = [
  // Row 1 (7)
  { icon: siClaude },
  { icon: siCursor,        color: '#FFFFFF' },
  { icon: siGooglegemini },
  { icon: siX,             color: '#FFFFFF' },
  { icon: siPerplexity },
  { icon: siMistralai },
  { icon: siN8n },
  // Row 2 (6)
  { icon: siWindsurf,      color: '#FFFFFF' },
  { icon: siGithubcopilot, color: '#FFFFFF' },
  { icon: siReplit },
  { icon: siVercel,        color: '#FFFFFF' },
  { icon: siMeta },
  { icon: siAnthropic,     color: '#FFFFFF' },
  // Row 3 (5)
  { icon: siLangchain },
  { icon: siCrewai,        color: '#FFFFFF' },
  { icon: siHuggingface },
  { icon: siZapier },
  { icon: siMake },
  // Row 4 (4)
  { icon: siV0,            color: '#FFFFFF' },
  { icon: siGithub,        color: '#FFFFFF' },
  { icon: siReplicate,     color: '#FFFFFF' },
  { icon: siNotion,        color: '#FFFFFF' },
  // Row 5 (3)
  { icon: siDiscord },
  // Pad with whatever
];
void [siZapier, siMake];

const POPULATED_PER_ROW = [7, 6, 5];

// Total cells per row (populated + flanking ghosts). Wider than the
// content max-width so the ghost squares run edge-to-edge of the viewport;
// the side mask fades the outermost ghosts into the background.
const ROW_WIDTH = 13;

function BrandIcon({
  icon,
  size = 56,
  colorOverride,
}: {
  icon: SimpleIconType;
  size?: number;
  colorOverride?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={icon.title}
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill={colorOverride ?? `#${icon.hex}`} />
    </svg>
  );
}

const TILE_SIZE = 'h-[120px] w-[120px]';

function PopulatedTile({ tile }: { tile: Tile }) {
  // Plain dark surface - no mint tint. Only the brand logo carries color
  // (per Postiz reference). Hairline outline reads as a tile boundary.
  return (
    <div
      className={`flex ${TILE_SIZE} flex-shrink-0 items-center justify-center rounded-2xl transition-transform hover:scale-[1.05]`}
      style={{
        backgroundColor: 'var(--cryptix-surface)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <BrandIcon icon={tile.icon} colorOverride={tile.color} />
    </div>
  );
}

function GhostTile() {
  // Same dark surface as a populated tile so the shape reads as a real
  // square, not an outline. The horizontal mask on the grid wrapper
  // fades these tiles to transparent as they approach the page edges.
  return (
    <div
      aria-hidden
      className={`${TILE_SIZE} flex-shrink-0 rounded-2xl`}
      style={{
        backgroundColor: 'var(--cryptix-surface)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    />
  );
}

export function Home2Integrations() {
  // Slice the flat tile list into rows per POPULATED_PER_ROW.
  const rows: Tile[][] = [];
  let cursor = 0;
  for (const count of POPULATED_PER_ROW) {
    rows.push(TILES_FLAT.slice(cursor, cursor + count));
    cursor += count;
  }

  return (
    <section className="relative overflow-hidden py-32">
      <div className="mx-auto">
        <div className="px-6 text-center">
          <h2
            className="font-normal"
            style={{
              color: 'var(--cryptix-text)',
              fontSize: 'clamp(28px, 3.6vw, 48px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
            }}
          >
            Works with every agent
            <br />
            and every channel.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl"
            style={{
              color: 'var(--cryptix-text-muted)',
              fontSize: '16px',
              lineHeight: 1.55,
            }}
          >
            Connect any agentic tool and publishing surface directly to
            AgentMedia&apos;s pipeline.
          </p>
        </div>

        {/* Triangle. mask-image fades the left/right edges of the grid so
         * the outer ghost tiles dissolve into the page background. */}
        <div
          className="mt-16 flex flex-col items-center gap-3"
          style={{
            // Gradual horizontal fade: tiles in the middle 60% are at
            // full opacity, the outer 40% gradually fades toward the
            // viewport edges. The squares stay visible (with real
            // backgrounds) but progressively dim out.
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 8%, rgba(0,0,0,0.6) 18%, black 30%, black 70%, rgba(0,0,0,0.6) 82%, rgba(0,0,0,0.2) 92%, transparent 100%)',
            maskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.2) 8%, rgba(0,0,0,0.6) 18%, black 30%, black 70%, rgba(0,0,0,0.6) 82%, rgba(0,0,0,0.2) 92%, transparent 100%)',
          }}
        >
          {rows.map((row, rowIdx) => {
            const flanks = (ROW_WIDTH - row.length) / 2;
            const leftGhosts = Math.floor(flanks);
            const rightGhosts = Math.ceil(flanks);
            const offset = rowIdx % 2 === 1;
            return (
              <div
                key={rowIdx}
                className="flex gap-3"
                style={{ marginLeft: offset ? '64px' : '0' }}
              >
                {Array.from({ length: leftGhosts }).map((_, j) => (
                  <GhostTile key={`gl-${j}`} />
                ))}
                {row.map((tile, j) => (
                  <PopulatedTile key={`t-${j}`} tile={tile} />
                ))}
                {Array.from({ length: rightGhosts }).map((_, j) => (
                  <GhostTile key={`gr-${j}`} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
