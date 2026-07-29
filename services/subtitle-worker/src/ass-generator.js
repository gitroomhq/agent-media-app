// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * ASS (Advanced SubStation Alpha) subtitle file generator.
 *
 * Generates animated subtitles with multiple style options.
 * Supports 9:16, 16:9, and 1:1 aspect ratios with auto-adjusted layout.
 * Liberation Sans Bold font (shipped in Docker image).
 */

// ── Style Definitions ─────────────────────────────────────────────────────────
// ASS uses BGR color format: &HAA_BB_GG_RR (AA=alpha, BB=blue, GG=green, RR=red)
// &H00 = fully opaque alpha, &HFF = fully transparent alpha

const STYLES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: OUTLINE STYLES — Traditional subtitle look with karaoke
  // ═══════════════════════════════════════════════════════════════════════════

  hormozi: {
    fontName: 'Liberation Sans',
    fontSize: 80,
    primaryColour: '&H00FFFFFF',    // White text
    secondaryColour: '&H0000FFFF',  // Yellow karaoke highlight (BGR)
    outlineColour: '&H00000000',    // Black outline
    backColour: '&H80000000',
    bold: -1,
    borderStyle: 1,
    outline: 4,
    shadow: 2,
    alignment: 8,                    // TOP center
    marginV: 200,
    maxWordsPerLine: 3,
    karaokeEnabled: true,
    uppercase: true,
  },
  karaoke: {
    fontName: 'Liberation Sans',
    fontSize: 72,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H0000FF00',  // Green karaoke highlight (BGR)
    outlineColour: '&H00000000',
    backColour: '&H80000000',
    bold: -1,
    borderStyle: 1,
    outline: 3,
    shadow: 2,
    alignment: 2,                    // BOTTOM center
    marginV: 100,
    maxWordsPerLine: 3,
    karaokeEnabled: true,
    uppercase: true,
  },
  neon: {
    fontName: 'Liberation Sans',
    fontSize: 74,
    primaryColour: '&H0039FF14',    // Neon green text (BGR)
    secondaryColour: '&H0000FFFF',  // Yellow highlight
    outlineColour: '&H00005500',    // Dark green outline
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 3,
    shadow: 4,
    alignment: 5,                    // MIDDLE center
    marginV: 0,
    maxWordsPerLine: 3,
    karaokeEnabled: true,
    uppercase: true,
  },
  gradient: {
    fontName: 'Liberation Sans',
    fontSize: 76,
    primaryColour: '&H00FF7777',    // Light blue text (BGR)
    secondaryColour: '&H007777FF',  // Coral highlight (BGR)
    outlineColour: '&H00000000',
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 4,
    shadow: 2,
    alignment: 5,                    // MIDDLE center
    marginV: 0,
    maxWordsPerLine: 3,
    karaokeEnabled: true,
    uppercase: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: BOX HIGHLIGHT — Colored pill/rounded boxes behind text
  // Uses thick borderStyle:1 outline which naturally rounds around text
  // ═══════════════════════════════════════════════════════════════════════════

  tiktok: {
    fontName: 'Liberation Sans',
    fontSize: 82,
    primaryColour: '&H00FFFFFF',    // White text (after highlight)
    secondaryColour: '&H0000FFFF',  // YELLOW highlight as word is spoken (BGR)
    outlineColour: '&H001645EE',    // TikTok red pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 22,                     // THICK = creates pill/box effect
    shadow: 0,
    alignment: 8,                    // TOP center
    marginV: 250,
    maxWordsPerLine: 2,
    karaokeEnabled: false,
    uppercase: true,
  },
  bold: {
    fontName: 'Liberation Sans',
    fontSize: 88,
    primaryColour: '&H00FFFFFF',    // White text (after highlight)
    secondaryColour: '&H0000FFFF',  // YELLOW highlight (BGR)
    outlineColour: '&H00FF8000',    // Orange pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 24,                     // THICK pill
    shadow: 0,
    alignment: 5,                    // MIDDLE center
    marginV: 0,
    maxWordsPerLine: 2,
    karaokeEnabled: false,
    uppercase: true,
  },
  fire: {
    fontName: 'Liberation Sans',
    fontSize: 80,
    primaryColour: '&H00FFFFFF',    // White text (after highlight)
    secondaryColour: '&H0000CCFF',  // ORANGE highlight (BGR)
    outlineColour: '&H000045CC',    // Deep red pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 22,                     // THICK pill
    shadow: 0,
    alignment: 8,                    // TOP center
    marginV: 220,
    maxWordsPerLine: 2,
    karaokeEnabled: false,
    uppercase: true,
  },
  pop: {
    fontName: 'Liberation Sans',
    fontSize: 86,
    primaryColour: '&H00121212',    // Dark text (after highlight)
    secondaryColour: '&H000000FF',  // RED highlight (BGR)
    outlineColour: '&H0000FFFF',    // Yellow pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 24,                     // THICK pill
    shadow: 0,
    alignment: 8,                    // TOP center
    marginV: 200,
    maxWordsPerLine: 2,
    karaokeEnabled: false,
    uppercase: true,
  },
  electric: {
    fontName: 'Liberation Sans',
    fontSize: 78,
    primaryColour: '&H00FFFFFF',    // White text (after highlight)
    secondaryColour: '&H00FFFF00',  // CYAN highlight (BGR)
    outlineColour: '&H00FF00CC',    // Magenta pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 22,                     // THICK pill
    shadow: 0,
    alignment: 8,                    // TOP center
    marginV: 230,
    maxWordsPerLine: 2,
    karaokeEnabled: false,
    uppercase: true,
  },
  spotlight: {
    fontName: 'Liberation Sans',
    fontSize: 84,
    primaryColour: '&H00121212',    // Dark text (after highlight)
    secondaryColour: '&H000000CC',  // DARK RED highlight (BGR)
    outlineColour: '&H0000D4FF',    // Gold pill (BGR)
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 24,                     // THICK pill
    shadow: 0,
    alignment: 8,                    // TOP center
    marginV: 200,
    maxWordsPerLine: 3,
    karaokeEnabled: false,
    uppercase: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: ROUNDED BOX — Drawn rounded rectangles behind text via \p1
  // ═══════════════════════════════════════════════════════════════════════════

  boxed: {
    fontName: 'Liberation Sans',
    fontSize: 64,
    primaryColour: '&H00FFFFFF',    // White text (after highlight)
    secondaryColour: '&H0000FFFF',  // YELLOW highlight (BGR)
    outlineColour: '&H00000000',
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 0,
    shadow: 0,
    alignment: 8,                    // TOP center (overridden by \pos)
    marginV: 250,
    maxWordsPerLine: 4,
    karaokeEnabled: false,
    uppercase: true,
    // Rounded rectangle drawn via \p1 drawing commands
    roundedBox: { color: '&H00202020', padding: 24, radius: 18 },
  },
  clean: {
    fontName: 'Liberation Sans',
    fontSize: 58,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H0000DDFF',  // AMBER highlight (BGR)
    outlineColour: '&H00000000',
    backColour: '&H00000000',
    bold: 0,
    borderStyle: 1,
    outline: 0,
    shadow: 0,
    alignment: 2,                    // BOTTOM center
    marginV: 100,
    maxWordsPerLine: 6,
    karaokeEnabled: false,
    uppercase: false,
    roundedBox: { color: '&H00000000', padding: 20, radius: 14, alpha: '&H40' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4: SUBTLE / MINIMAL — Light, understated
  // ═══════════════════════════════════════════════════════════════════════════

  minimal: {
    fontName: 'Liberation Sans',
    fontSize: 52,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H0000FFFF',  // YELLOW highlight (BGR)
    outlineColour: '&H40000000',
    backColour: '&H00000000',
    bold: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    alignment: 2,                    // BOTTOM center
    marginV: 120,
    maxWordsPerLine: 6,
    karaokeEnabled: false,
    uppercase: false,
  },
  aesthetic: {
    fontName: 'Liberation Sans',
    fontSize: 48,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H00FFAACC',  // LIGHT PINK highlight (BGR)
    outlineColour: '&H30000000',
    backColour: '&H00000000',
    bold: 0,
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    alignment: 2,                    // BOTTOM center
    marginV: 150,
    maxWordsPerLine: 8,
    karaokeEnabled: false,
    uppercase: false,
  },
  pastel: {
    fontName: 'Liberation Sans',
    fontSize: 58,
    primaryColour: '&H00E1E4FF',    // Misty rose text (BGR)
    secondaryColour: '&H00B9DAFF',  // Peach highlight (BGR)
    outlineColour: '&H20000000',
    backColour: '&H00000000',
    bold: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 0,
    alignment: 2,                    // BOTTOM center
    marginV: 130,
    maxWordsPerLine: 5,
    karaokeEnabled: false,
    uppercase: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: BIG IMPACT — Huge centered text, maximum punch
  // ═══════════════════════════════════════════════════════════════════════════

  impact: {
    fontName: 'Liberation Sans',
    fontSize: 100,
    primaryColour: '&H00FFFFFF',
    secondaryColour: '&H0000FFFF',  // Yellow highlight
    outlineColour: '&H00000000',
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 6,
    shadow: 0,
    alignment: 5,                    // MIDDLE center — huge and dominating
    marginV: 0,
    maxWordsPerLine: 2,
    karaokeEnabled: true,
    uppercase: true,
  },
  glow: {
    fontName: 'Liberation Sans',
    fontSize: 82,
    primaryColour: '&H00FFAAFF',    // Pink-magenta text (BGR)
    secondaryColour: '&H00FFFFFF',  // White highlight
    outlineColour: '&H00CC22CC',    // Purple glow outline
    backColour: '&H00000000',
    bold: -1,
    borderStyle: 1,
    outline: 5,
    shadow: 6,
    alignment: 5,                    // MIDDLE center
    marginV: 0,
    maxWordsPerLine: 2,
    karaokeEnabled: true,
    uppercase: true,
  },
};

// ── Resolution Map for Aspect Ratios ──────────────────────────────────────────

const RESOLUTION_MAP = {
  '9:16': { x: 1080, y: 1920 },
  '16:9': { x: 1920, y: 1080 },
  '1:1':  { x: 1080, y: 1080 },
};

/**
 * Format seconds to ASS timestamp format: H:MM:SS.CC (centiseconds).
 * @param {number} seconds
 * @returns {string}
 */
function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Generate an ASS \p1 drawing path for a rounded rectangle.
 * Uses cubic bezier approximation of quarter-circle arcs.
 *
 * @param {number} w - Width in pixels
 * @param {number} h - Height in pixels
 * @param {number} r - Corner radius in pixels
 * @returns {string} ASS drawing commands
 */
function roundedRectDraw(w, h, r) {
  r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
  const c = Math.round(r * 0.55); // bezier kappa for circular arc
  return [
    `m ${r} 0`,
    `l ${w - r} 0`,
    `b ${w - c} 0 ${w} ${c} ${w} ${r}`,
    `l ${w} ${h - r}`,
    `b ${w} ${h - c} ${w - c} ${h} ${w - r} ${h}`,
    `l ${r} ${h}`,
    `b ${c} ${h} 0 ${h - c} 0 ${h - r}`,
    `l 0 ${r}`,
    `b 0 ${c} ${c} 0 ${r} 0`,
  ].join(' ');
}

/**
 * Group words into lines of N words.
 * Each group has the combined start/end times of its words.
 *
 * @param {Array<{word: string, start: number, end: number}>} words
 * @param {number} maxPerLine
 * @returns {Array<{words: Array<{word: string, start: number, end: number}>, start: number, end: number}>}
 */
function groupWords(words, maxPerLine) {
  const groups = [];
  for (let i = 0; i < words.length; i += maxPerLine) {
    const chunk = words.slice(i, i + maxPerLine);
    groups.push({
      words: chunk,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }
  return groups;
}

/**
 * Generate ASS subtitle content from word-level timestamps.
 *
 * @param {Array<{word: string, start: number, end: number}>} words
 * @param {string} [style='hormozi'] - Subtitle style
 * @param {string} [aspectRatio='9:16'] - Video aspect ratio
 * @returns {string} ASS file content
 */
export function generateASS(words, style = 'hormozi', aspectRatio = '9:16') {
  const cfg = STYLES[style] ?? STYLES.hormozi;
  const res = RESOLUTION_MAP[aspectRatio] ?? RESOLUTION_MAP['9:16'];

  // Adjust marginV for landscape/square — less margin needed
  const marginV = aspectRatio === '9:16' ? cfg.marginV : Math.round(cfg.marginV * 0.6);

  const groups = groupWords(words, cfg.maxWordsPerLine);

  const styleName = style.charAt(0).toUpperCase() + style.slice(1);

  // ASS header
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

  // ── Generate dialogue events ──────────────────────────────────────────────

  // Calculate center position for \pos-based styles (roundedBox)
  const cx = Math.round(res.x / 2);
  let baseY;
  if (cfg.alignment >= 7) baseY = marginV + Math.round(cfg.fontSize * 0.65);
  else if (cfg.alignment >= 4) baseY = Math.round(res.y / 2);
  else baseY = res.y - marginV - Math.round(cfg.fontSize * 0.65);

  const events = [];

  // ── All styles: show word group, highlight current word via \kf ──
  for (const group of groups) {
    const startTime = formatASSTime(group.start);
    const endTime = formatASSTime(group.end);

    // Build karaoke text with word-by-word \kf timing
    const karaokeText = group.words
      .map((w) => {
        const duration = Math.round((w.end - w.start) * 100);
        const kDuration = Math.max(duration, 10);
        const word = cfg.uppercase ? w.word.toUpperCase() : w.word;
        return `{\\kf${kDuration}}${word}`;
      })
      .join(' ');

    if (cfg.roundedBox) {
      // ── Rounded box: draw background rectangle + karaoke text on top ──
      const { color, padding, radius, alpha } = cfg.roundedBox;
      const alphaTag = alpha ? `\\1a${alpha}` : '';

      const plainText = cfg.uppercase
        ? group.words.map((w) => w.word.toUpperCase()).join(' ')
        : group.words.map((w) => w.word).join(' ');

      const textW = Math.round(plainText.length * cfg.fontSize * 0.52);
      const textH = Math.round(cfg.fontSize * 1.3);
      const boxW = textW + padding * 2;
      const boxH = textH + padding * 2;
      const drawPath = roundedRectDraw(boxW, boxH, radius);

      // Layer 0: rounded rectangle background
      events.push(
        `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,` +
        `{\\an5\\pos(${cx},${baseY})\\p1\\1c${color}${alphaTag}\\bord0\\shad0}${drawPath}{\\p0}`
      );
      // Layer 1: karaoke text on top
      events.push(
        `Dialogue: 1,${startTime},${endTime},${styleName},,0,0,0,,` +
        `{\\an5\\pos(${cx},${baseY})}${karaokeText}`
      );

    } else {
      // ── All other styles: karaoke text with word-by-word highlight ──
      events.push(`Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${karaokeText}`);
    }
  }

  return header + events.join('\n') + '\n';
}
