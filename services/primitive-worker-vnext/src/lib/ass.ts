// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Minimal vNext ASS subtitle generator. Port of the relevant subset of
 * media-worker-v2/src/ass-generator.js — only the three styles the
 * vNext subtitles primitive exposes today (hormozi, tiktok, minimal).
 */

export type SubtitleStyle = 'hormozi' | 'tiktok' | 'minimal';
export type SubtitleAspect = '9:16' | '16:9' | '1:1';

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

interface StyleConfig {
  fontName: string;
  fontSize: number;
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: -1 | 0;
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  alignment: number;
  marginV: number;
  maxWordsPerLine: number;
  karaokeEnabled: boolean;
  uppercase: boolean;
}

const STYLES: Record<SubtitleStyle, StyleConfig> = {
  hormozi: {
    fontName: 'Liberation Sans',
    fontSize: 80,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H0000FFFF',
    outlineColour: '&H00000000',
    backColour: '&H80000000',
    bold: -1,
    borderStyle: 1,
    outline: 4,
    shadow: 2,
    alignment: 8,
    marginV: 200,
    maxWordsPerLine: 3,
    karaokeEnabled: true,
    uppercase: true,
  },
  tiktok: {
    fontName: 'Liberation Sans',
    fontSize: 64,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H00FFFFFF',
    outlineColour: '&H00000000',
    backColour: '&H80000000',
    bold: -1,
    borderStyle: 3,
    outline: 12,
    shadow: 0,
    alignment: 2,
    marginV: 220,
    maxWordsPerLine: 5,
    karaokeEnabled: false,
    uppercase: false,
  },
  minimal: {
    fontName: 'Liberation Sans',
    fontSize: 52,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H00FFFFFF',
    outlineColour: '&H20000000',
    backColour: '&H00000000',
    bold: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginV: 140,
    maxWordsPerLine: 6,
    karaokeEnabled: false,
    uppercase: false,
  },
};

const RES: Record<SubtitleAspect, { x: number; y: number }> = {
  '9:16': { x: 1080, y: 1920 },
  '16:9': { x: 1920, y: 1080 },
  '1:1': { x: 1080, y: 1080 },
};

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function groupWords(words: SubtitleWord[], maxPerLine: number): { words: SubtitleWord[]; start: number; end: number }[] {
  const groups: { words: SubtitleWord[]; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += maxPerLine) {
    const chunk = words.slice(i, i + maxPerLine);
    if (chunk.length === 0) continue;
    groups.push({
      words: chunk,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }
  return groups;
}

export function generateAss(
  words: SubtitleWord[],
  style: SubtitleStyle = 'hormozi',
  aspectRatio: SubtitleAspect = '9:16',
): string {
  const cfg = STYLES[style] ?? STYLES.hormozi;
  const res = RES[aspectRatio] ?? RES['9:16'];
  const marginV = aspectRatio === '9:16' ? cfg.marginV : Math.round(cfg.marginV * 0.6);
  const groups = groupWords(words, cfg.maxWordsPerLine);
  const styleName = style.charAt(0).toUpperCase() + style.slice(1);

  const header = `[Script Info]
Title: ${styleName} Style Subtitles
ScriptType: v4.00+
PlayResX: ${res.x}
PlayResY: ${res.y}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleName},${cfg.fontName},${cfg.fontSize},${cfg.primaryColour},${cfg.secondaryColour},${cfg.outlineColour},${cfg.backColour},${cfg.bold},0,0,0,100,100,0,0,${cfg.borderStyle},${cfg.outline},${cfg.shadow},${cfg.alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  for (const g of groups) {
    const startT = formatAssTime(g.start);
    const endT = formatAssTime(g.end);
    if (cfg.karaokeEnabled) {
      const k = g.words
        .map((w) => {
          const duration = Math.max(Math.round((w.end - w.start) * 100), 10);
          const word = cfg.uppercase ? w.word.toUpperCase() : w.word;
          return `{\\kf${duration}}${escapeAss(word)}`;
        })
        .join(' ');
      events.push(`Dialogue: 0,${startT},${endT},${styleName},,0,0,0,,${k}`);
    } else {
      const text = g.words
        .map((w) => (cfg.uppercase ? w.word.toUpperCase() : w.word))
        .map(escapeAss)
        .join(' ');
      events.push(`Dialogue: 0,${startT},${endT},${styleName},,0,0,0,,${text}`);
    }
  }

  return header + events.join('\n') + '\n';
}

function escapeAss(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}
