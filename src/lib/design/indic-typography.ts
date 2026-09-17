/**
 * Indic Script Typography Engine
 *
 * Why Telugu newspapers are beautiful but Telugu websites are ugly:
 *
 * NEWSPAPERS work because they follow rules that respect the script:
 *  - Generous line-height (1.6-2.0x) for tall vowel marks (matras)
 *  - ZERO letter-spacing (conjuncts break with extra spacing)
 *  - Proper fonts (Noto Serif Telugu, VP_telugu, etc.)
 *  - Column widths that match Telugu's natural rhythm
 *  - Bold headlines in script-appropriate weights
 *
 * WEBSITES fail because they apply Latin assumptions:
 *  - line-height: 1.2-1.4 clips Telugu ascenders/descenders
 *  - letter-spacing: 0.05em breaks conjunct consonants
 *  - Generic fonts (Arial, Helvetica) have no Telugu glyphs
 *  - 600px+ line lengths lose Telugu reading rhythm
 *  - Font weights designed for Latin look wrong on Telugu
 *
 * This engine encodes the W3C Indic Layout Requirements (ilreq) and
 * script-specific rules so agents generate correct Indic designs.
 *
 * References:
 *  - W3C Indic Layout Requirements: https://www.w3.org/TR/ilreq/
 *  - W3C Bengali Script Resources: https://w3c.github.io/iip/beng/
 *  - Material Design Language Support: https://m2.material.io/design/typography/language-support.html
 */

// ─── Script Definitions ───────────────────────────────────────────────────────

export type IndicScript =
  | "telugu"
  | "devanagari"
  | "bengali"
  | "tamil"
  | "kannada"
  | "malayalam"
  | "gujarati"
  | "gurmukhi"
  | "odia"
  | "eastern-nagari";

export interface ScriptTypographyRules {
  /** ISO 15924 script code. */
  isoCode: string;
  /** Human-readable name. */
  name: string;
  /** Languages that use this script. */
  languages: string[];

  // ── Metrics ──
  /** Minimum line-height multiplier (e.g., 1.8 for Telugu). */
  lineHeightMin: number;
  /** Recommended line-height multiplier. */
  lineHeightRecommended: number;
  /** Maximum line-height before losing cohesion. */
  lineHeightMax: number;

  // ── Spacing ──
  /** letter-spacing must be 0 for Indic scripts (conjuncts break). */
  letterSpacingDefault: number;
  /** Whether letter-spacing is EVER safe (usually false). */
  letterSpacingSafe: boolean;
  /** Recommended word-spacing multiplier relative to Latin. */
  wordSpacingMultiplier: number;

  // ── Font ──
  /** Recommended web fonts for this script. */
  recommendedFonts: string[];
  /** Minimum font size for body text (px). */
  bodyFontSizeMin: number;
  /** Recommended body font size (px). */
  bodyFontSizeRecommended: number;
  /** Minimum font size for headings (px). */
  headingFontSizeMin: number;

  // ── Layout ──
  /** Maximum recommended line length in characters. */
  maxLineLengthChars: number;
  /** Maximum recommended line length in em. */
  maxLineLengthEm: number;
  /** Whether this script needs extra space above for matras. */
  needsAscenderSpace: boolean;
  /** Whether this script needs extra space below for descenders. */
  needsDescenderSpace: boolean;
  /** Vertical offset for proper baseline alignment (px). */
  baselineOffset: number;

  // ── Text Direction ──
  direction: "ltr" | "rtl";
  /** Whether text composition (shaping) is required. */
  needsShaping: boolean;

  // ── Special Rules ──
  /** Do NOT apply CSS letter-spacing (breaks conjuncts). */
  disableLetterSpacing: boolean;
  /** Do NOT apply CSS word-spacing. */
  disableWordSpacing: boolean;
  /** Extra top-padding needed for headline elements. */
  headlinePaddingTop: number;
  /** Extra bottom-padding needed for headline elements. */
  headlinePaddingBottom: number;
}

// ─── Script Rules Database ────────────────────────────────────────────────────

export const SCRIPT_RULES: Record<IndicScript, ScriptTypographyRules> = {
  telugu: {
    isoCode: "Telu",
    name: "Telugu",
    languages: ["Telugu (తెలుగు)"],
    lineHeightMin: 1.7,
    lineHeightRecommended: 1.9,
    lineHeightMax: 2.2,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Telugu",
      "Noto Serif Telugu",
      "Mallanna",
      "Mandali",
      "Ramabhadra",
      "Ponnala",
      " VP Telugu",
      "Gidugu",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 28,
    maxLineLengthChars: 55,
    maxLineLengthEm: 38,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 2,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 8,
    headlinePaddingBottom: 4,
  },

  devanagari: {
    isoCode: "Deva",
    name: "Devanagari",
    languages: ["Hindi (हिन्दी)", "Marathi (मराठी)", "Sanskrit (संस्कृतम्)", "Nepali (नेपाली)", "Konkani", "Maithili", "Dogri", "Bodo", "Sindhi"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.1,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Devanagari",
      "Noto Serif Devanagari",
      "Poppins",
      "Tiro Devanagari Hindi",
      "Mukta",
      "Hind",
      "Laila",
      "Kalam",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 58,
    maxLineLengthEm: 40,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 4,
  },

  bengali: {
    isoCode: "Beng",
    name: "Bengali",
    languages: ["Bengali (বাংলা)", "Assamese (অসমীয়া)", "Manipuri (মৈতৈলোন্)"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.1,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Bengali",
      "Noto Serif Bengali",
      "Hind Siliguri",
      "Tiro Bengali",
      "Lohit Bengali",
      "SolaimanLipi",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 60,
    maxLineLengthEm: 42,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 4,
  },

  tamil: {
    isoCode: "Taml",
    name: "Tamil",
    languages: ["Tamil (தமிழ்)"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.0,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Tamil",
      "Noto Serif Tamil",
      "Latha",
      "Vijaya",
      "TAM-Tamil",
      "Sounds Great",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 58,
    maxLineLengthEm: 40,
    needsAscenderSpace: true,
    needsDescenderSpace: false,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 2,
  },

  kannada: {
    isoCode: "Knda",
    name: "Kannada",
    languages: ["Kannada (ಕನ್ನಡ)"],
    lineHeightMin: 1.7,
    lineHeightRecommended: 1.9,
    lineHeightMax: 2.2,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Kannada",
      "Noto Serif Kannada",
      "BMDhalooji",
      "Kedage",
      "Mallanna",
      "Tunga",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 28,
    maxLineLengthChars: 55,
    maxLineLengthEm: 38,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 2,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 8,
    headlinePaddingBottom: 4,
  },

  malayalam: {
    isoCode: "Mlym",
    name: "Malayalam",
    languages: ["Malayalam (മലയാളം)"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.1,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Malayalam",
      "Noto Serif Malayalam",
      "Rachana",
      "Meera",
      "Manjari",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 58,
    maxLineLengthEm: 40,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 4,
  },

  gujarati: {
    isoCode: "Gujr",
    name: "Gujarati",
    languages: ["Gujarati (ગુજરાતી)"],
    lineHeightMin: 1.5,
    lineHeightRecommended: 1.7,
    lineHeightMax: 2.0,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Gujarati",
      "Noto Serif Gujarati",
      "Shruti",
      "Lohit Gujarati",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 24,
    maxLineLengthChars: 60,
    maxLineLengthEm: 42,
    needsAscenderSpace: true,
    needsDescenderSpace: false,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 4,
    headlinePaddingBottom: 2,
  },

  gurmukhi: {
    isoCode: "Guru",
    name: "Gurmukhi",
    languages: ["Punjabi (ਪੰਜਾਬੀ)"],
    lineHeightMin: 1.5,
    lineHeightRecommended: 1.7,
    lineHeightMax: 2.0,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Gurmukhi",
      "Noto Serif Gurmukhi",
      "Mukta Mahee",
      "Ravi Prakash",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 24,
    maxLineLengthChars: 60,
    maxLineLengthEm: 42,
    needsAscenderSpace: true,
    needsDescenderSpace: false,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 4,
    headlinePaddingBottom: 2,
  },

  odia: {
    isoCode: "Orya",
    name: "Odia",
    languages: ["Odia (ଓଡ଼ିଆ)"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.1,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Odia",
      "Noto Serif Odia",
      "Lohit Odia",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 58,
    maxLineLengthEm: 40,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 4,
  },

  "eastern-nagari": {
    isoCode: "Beng",
    name: "Eastern Nagari",
    languages: ["Assamese (অসমীয়া)"],
    lineHeightMin: 1.6,
    lineHeightRecommended: 1.8,
    lineHeightMax: 2.1,
    letterSpacingDefault: 0,
    letterSpacingSafe: false,
    wordSpacingMultiplier: 1.0,
    recommendedFonts: [
      "Noto Sans Bengali",
      "Noto Serif Bengali",
      "Hind Siliguri",
    ],
    bodyFontSizeMin: 16,
    bodyFontSizeRecommended: 18,
    headingFontSizeMin: 26,
    maxLineLengthChars: 60,
    maxLineLengthEm: 42,
    needsAscenderSpace: true,
    needsDescenderSpace: true,
    baselineOffset: 1,
    direction: "ltr",
    needsShaping: true,
    disableLetterSpacing: true,
    disableWordSpacing: false,
    headlinePaddingTop: 6,
    headlinePaddingBottom: 4,
  },
};

// ─── Script Detection ─────────────────────────────────────────────────────────

/** Unicode ranges for each Indic script. */
const SCRIPT_RANGES: Array<{ script: IndicScript; lo: number; hi: number }> = [
  { script: "devanagari",    lo: 0x0900, hi: 0x097F },
  { script: "devanagari",    lo: 0xA8E0, hi: 0xA8FF },
  { script: "bengali",       lo: 0x0980, hi: 0x09FF },
  { script: "gurmukhi",      lo: 0x0A00, hi: 0x0A7F },
  { script: "gujarati",      lo: 0x0A80, hi: 0x0AFF },
  { script: "odia",          lo: 0x0B00, hi: 0x0B7F },
  { script: "tamil",         lo: 0x0B80, hi: 0x0BFF },
  { script: "telugu",        lo: 0x0C00, hi: 0x0C7F },
  { script: "kannada",       lo: 0x0C80, hi: 0x0CFF },
  { script: "malayalam",     lo: 0x0D00, hi: 0x0D7F },
];

/** Detect the dominant Indic script from text. */
export function detectScript(text: string): IndicScript | null {
  const counts = new Map<IndicScript, number>();

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    for (const range of SCRIPT_RANGES) {
      if (cp >= range.lo && cp <= range.hi) {
        counts.set(range.script, (counts.get(range.script) ?? 0) + 1);
        break;
      }
    }
  }

  if (counts.size === 0) return null;

  let best: IndicScript | null = null;
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = script;
    }
  }
  return best;
}

/** Detect all scripts present in text. */
export function detectAllScripts(text: string): IndicScript[] {
  const found = new Set<IndicScript>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    for (const range of SCRIPT_RANGES) {
      if (cp >= range.lo && cp <= range.hi) {
        found.add(range.script);
        break;
      }
    }
  }
  return [...found];
}

// ─── Typography CSS Generation ────────────────────────────────────────────────

/** Generate CSS for an Indic script's typography rules. */
export function scriptTypographyCSS(
  script: IndicScript,
  opts?: { selector?: string; includeFonts?: boolean },
): string {
  const rules = SCRIPT_RULES[script];
  const sel = opts?.selector ?? `[lang="${script}"], .lang-${script}`;

  const lines: string[] = [];

  if (opts?.includeFonts !== false) {
    lines.push(`/* ${rules.name} typography — W3C ilreq compliant */`);
    lines.push(`@import url('https://fonts.googleapis.com/css2?family=${rules.recommendedFonts[0].replace(/ /g, "+")}:wght@400;500;600;700;800&display=swap');`);
  }

  lines.push(`${sel} {`);
  lines.push(`  font-family: '${rules.recommendedFonts[0]}', ${rules.recommendedFonts.slice(1).map(f => `'${f}'`).join(', ')}, sans-serif;`);
  lines.push(`  line-height: ${rules.lineHeightRecommended};`);
  lines.push(`  letter-spacing: 0;  /* CRITICAL: never add letter-spacing to Indic scripts */`);
  lines.push(`  font-feature-settings: 'liga' 1, 'clig' 1, 'kern' 0;`);
  lines.push(`  font-optical-sizing: auto;`);
  if (rules.needsAscenderSpace) {
    lines.push(`  /* Extra space for vowel marks above baseline */`);
  }
  lines.push(`}`);

  // Body text
  lines.push(`${sel} p, ${sel} .body-text {`);
  lines.push(`  font-size: ${rules.bodyFontSizeRecommended}px;`);
  lines.push(`  line-height: ${rules.lineHeightRecommended};`);
  lines.push(`  max-width: ${rules.maxLineLengthEm}em;`);
  lines.push(`}`);

  // Headings — larger line-height for Telugu/Kannada
  for (let i = 1; i <= 6; i++) {
    const size = Math.max(rules.headingFontSizeMin, 48 - (i - 1) * 6);
    lines.push(`${sel} h${i} {`);
    lines.push(`  font-size: ${size}px;`);
    lines.push(`  line-height: ${rules.lineHeightMin + 0.1};`);
    lines.push(`  font-weight: 700;`);
    lines.push(`  padding-top: ${rules.headlinePaddingTop}px;`);
    lines.push(`  padding-bottom: ${rules.headlinePaddingBottom}px;`);
    lines.push(`}`);
  }

  // Disable letter-spacing on ALL elements
  lines.push(`${sel} *, ${sel} *::before, ${sel} *::after {`);
  lines.push(`  letter-spacing: 0 !important;  /* Indic conjuncts break with spacing */`);
  lines.push(`}`);

  return lines.join("\n");
}

// ─── Design Token Generation ──────────────────────────────────────────────────

/** Generate Tailwind-compatible design tokens for an Indic script. */
export function scriptDesignTokens(script: IndicScript): {
  fontFamily: Record<string, string>;
  fontSize: Record<string, string>;
  lineHeight: Record<string, string>;
  letterSpacing: Record<string, string>;
  spacing: Record<string, string>;
} {
  const rules = SCRIPT_RULES[script];

  return {
    fontFamily: {
      [script]: rules.recommendedFonts.join(", "),
    },
    fontSize: {
      "body": `${rules.bodyFontSizeRecommended}px`,
      "body-sm": `${rules.bodyFontSizeMin}px`,
      "h1": `${Math.max(rules.headingFontSizeMin, 42)}px`,
      "h2": `${Math.max(rules.headingFontSizeMin, 36)}px`,
      "h3": `${Math.max(rules.headingFontSizeMin, 30)}px`,
      "h4": `${Math.max(rules.headingFontSizeMin, 26)}px`,
    },
    lineHeight: {
      "tight": String(rules.lineHeightMin),
      "normal": String(rules.lineHeightRecommended),
      "loose": String(rules.lineHeightMax),
    },
    letterSpacing: {
      "normal": "0",
      "indic": "0",  // ALWAYS zero for Indic
    },
    spacing: {
      "headline-pt": `${rules.headlinePaddingTop}px`,
      "headline-pb": `${rules.headlinePaddingBottom}px`,
      "baseline-offset": `${rules.baselineOffset}px`,
    },
  };
}

// ─── Layout Rules for Agent Canvas ────────────────────────────────────────────

/** Apply Indic-aware layout rules to a canvas element's style. */
export function applyIndicStyle(
  script: IndicScript,
  elementKind: string,
  baseStyle: Record<string, unknown>,
): Record<string, unknown> {
  const rules = SCRIPT_RULES[script];
  const style = { ...baseStyle };

  // NEVER allow letter-spacing on Indic
  style.letterSpacing = "0";

  // Set appropriate font family
  if (!style.fontFamily) {
    style.fontFamily = rules.recommendedFonts[0];
  }

  // Adjust line-height based on element kind
  if (elementKind === "text" || elementKind === "card") {
    style.lineHeight = String(rules.lineHeightRecommended);
  }
  if (elementKind.startsWith("h") || elementKind === "text") {
    const fontSize = parseFloat(String(style.fontSize ?? "16"));
    if (fontSize >= rules.headingFontSizeMin) {
      style.lineHeight = String(rules.lineHeightMin + 0.1);
      style.paddingTop = `${rules.headlinePaddingTop}px`;
      style.paddingBottom = `${rules.headlinePaddingBottom}px`;
    }
  }

  // Ensure minimum font sizes
  if (style.fontSize) {
    const size = parseFloat(String(style.fontSize));
    if (size < rules.bodyFontSizeMin) {
      style.fontSize = `${rules.bodyFontSizeMin}px`;
    }
  }

  // Set max-width for line length
  if (elementKind === "text" && !style.maxWidth) {
    style.maxWidth = `${rules.maxLineLengthEm}em`;
  }

  return style;
}

// ─── Newspaper Layout Presets ─────────────────────────────────────────────────

export interface NewspaperColumnPreset {
  name: string;
  description: string;
  columns: number;
  columnWidth: string;
  gap: string;
  lineHeight: number;
  fontSize: string;
  fontFamily: string;
}

/** Telugu newspaper-style column layouts (proven to work). */
export const NEWSPAPER_PRESETS: Record<IndicScript, NewspaperColumnPreset[]> = {
  telugu: [
    {
      name: "మూల పత్రిక (Main Paper)",
      description: "Standard Telugu newspaper layout — 4 columns, generous spacing",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.9,
      fontSize: "17px",
      fontFamily: "Noto Serif Telugu, VP Telugu, serif",
    },
    {
      name: "శీర్షిక (Headline)",
      description: "Bold headline layout — single column, large text",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "42px",
      fontFamily: "Noto Sans Telugu, Mallanna, sans-serif",
    },
    {
      name: "కథనం (Feature Story)",
      description: "Long-form feature — 2 columns, moderate width",
      columns: 2,
      columnWidth: "30em",
      gap: "2.5em",
      lineHeight: 2.0,
      fontSize: "18px",
      fontFamily: "Noto Serif Telugu, serif",
    },
  ],
  devanagari: [
    {
      name: "मुख्य पृष्ठ (Front Page)",
      description: "Standard Hindi newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Devanagari, Tiro Devanagari Hindi, serif",
    },
    {
      name: "शीर्षक (Headline)",
      description: "Bold headline — single column",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "40px",
      fontFamily: "Noto Sans Devanagari, Poppins, sans-serif",
    },
  ],
  bengali: [
    {
      name: "মূল পত্রিকা (Main Paper)",
      description: "Standard Bengali newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Bengali, serif",
    },
  ],
  tamil: [
    {
      name: "முதன்மை இதழ் (Main Paper)",
      description: "Standard Tamil newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Tamil, serif",
    },
  ],
  kannada: [
    {
      name: "ಮುಖ್ಯ ಪತ್ರಿಕೆ (Main Paper)",
      description: "Standard Kannada newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.9,
      fontSize: "17px",
      fontFamily: "Noto Serif Kannada, serif",
    },
  ],
  malayalam: [
    {
      name: "പ്രധാന പത്രിക (Main Paper)",
      description: "Standard Malayalam newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Malayalam, serif",
    },
  ],
  gujarati: [
    {
      name: "મુખ્ય પત્રિકા (Main Paper)",
      description: "Standard Gujarati newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.7,
      fontSize: "17px",
      fontFamily: "Noto Serif Gujarati, serif",
    },
  ],
  gurmukhi: [
    {
      name: "ਮੁੱਖ ਅਖ਼ਬਾਰ (Main Paper)",
      description: "Standard Punjabi newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.7,
      fontSize: "17px",
      fontFamily: "Noto Serif Gurmukhi, serif",
    },
  ],
  odia: [
    {
      name: "ମୁଖ୍ୟ ସମ୍ବାଦ (Main Paper)",
      description: "Standard Odia newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Odia, serif",
    },
  ],
  "eastern-nagari": [
    {
      name: "মূল পত্রিকা (Main Paper)",
      description: "Standard Assamese newspaper — 4 columns",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Bengali, serif",
    },
  ],
};

// ─── Validation ───────────────────────────────────────────────────────────────

export interface TypographyViolation {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  fix: string;
}

/** Validate CSS against Indic typography rules. */
export function validateIndicTypography(
  script: IndicScript,
  css: Record<string, unknown>,
): TypographyViolation[] {
  const rules = SCRIPT_RULES[script];
  const violations: TypographyViolation[] = [];

  // Check letter-spacing
  const ls = String(css.letterSpacing ?? "");
  if (ls && ls !== "0" && ls !== "normal" && ls !== "0px" && ls !== "0em") {
    violations.push({
      severity: "error",
      rule: "no-letter-spacing",
      message: `letter-spacing: ${ls} will break ${rules.name} conjunct consonants`,
      fix: "Set letter-spacing: 0",
    });
  }

  // Check line-height
  const lh = parseFloat(String(css.lineHeight ?? "1.5"));
  if (!isNaN(lh) && lh < rules.lineHeightMin) {
    violations.push({
      severity: "error",
      rule: "line-height-too-low",
      message: `line-height: ${lh} is too low for ${rules.name} — vowel marks (matras) will be clipped`,
      fix: `Use line-height: ${rules.lineHeightRecommended} or higher`,
    });
  }

  // Check font size
  const fs = parseFloat(String(css.fontSize ?? "16"));
  if (!isNaN(fs) && fs < rules.bodyFontSizeMin) {
    violations.push({
      severity: "warning",
      rule: "font-size-too-small",
      message: `font-size: ${fs}px is too small for ${rules.name} — complex glyphs need minimum ${rules.bodyFontSizeMin}px`,
      fix: `Use font-size: ${rules.bodyFontSizeRecommended}px or larger`,
    });
  }

  // Check font family
  const ff = String(css.fontFamily ?? "");
  const hasIndicFont = rules.recommendedFonts.some((f) => ff.includes(f));
  if (ff && !hasIndicFont) {
    violations.push({
      severity: "warning",
      rule: "missing-indic-font",
      message: `font-family does not include a ${rules.name} font — glyphs may render as boxes or fallback`,
      fix: `Add one of: ${rules.recommendedFonts.slice(0, 3).join(", ")}`,
    });
  }

  // Check max-width (line length)
  const mw = String(css.maxWidth ?? "");
  if (mw) {
    const emMatch = mw.match(/([\d.]+)em/);
    if (emMatch) {
      const em = parseFloat(emMatch[1]);
      if (em > rules.maxLineLengthEm) {
        violations.push({
          severity: "warning",
          rule: "line-too-long",
          message: `max-width: ${mw} exceeds ${rules.name} optimal line length of ${rules.maxLineLengthEm}em`,
          fix: `Reduce to ${rules.maxLineLengthEm}em or ${rules.maxLineLengthChars} characters`,
        });
      }
    }
  }

  return violations;
}
