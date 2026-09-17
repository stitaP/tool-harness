/**
 * South Indian Language Typography System
 *
 * Detailed, language-specific typography rules for the 4 major
 * South Indian languages. Each language has unique characteristics:
 *
 * TELUGU (తెలుగు):
 *   - Round, circular letterforms with tall vowel marks (matras)
 *   - Complex conjunct consonants (ల్ల, క్ష, త్ర)
 *   - Headline style: bold, round, with generous spacing
 *   - Newspaper: Prajavani, Eenadu, Sakshi, Andhra Jyothy
 *
 * KANNADA (ಕನ್ನಡ):
 *   - Very similar to Telugu (both Dravidian script family)
 *   - Slightly more angular than Telugu
 *   - Unique characters: ಳ, ಱ, ೞ (retroflex)
 *   - Newspaper: Prajavani, Vijaya Karnataka, Udayavani
 *
 * TAMIL (தமிழ்):
 *   - Fewer conjuncts than Telugu/Kannada (simpler shaping)
 *   - Unique rounded forms: ழ, ள, ன
 *   - More angular than Telugu/Kannada
 *   - Newspaper: Dinamalar, Dinamani, Daily Thanthi
 *
 * MALAYALAM (മലയാളം):
 *   - Most complex conjunct system of all 4
 *   - Chillu characters (independent nasal consonants)
 *   - Very round, flowing letterforms
 *   - Newspaper: Mathrubhumi, Manorama, Kerala Kaumudi
 */

// ─── Language-Specific Typography Rules ───────────────────────────────────────

export interface SouthIndianLanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  family: "dravidian";

  // ── Typography Metrics ──
  lineHeight: { min: number; recommended: number; max: number };
  letterSpacing: number; // Always 0 for Indic
  wordSpacing: number;
  fontSize: { body: number; bodyMin: number; h1: number; h2: number; h3: number; h4: number };
  lineLength: { chars: number; em: number };

  // ── Font Stack ──
  fonts: {
    sans: string[];
    serif: string[];
    display: string[];
    mono: string[];
  };

  // ── Layout Rules ──
  headlinePadding: { top: number; bottom: number };
  paragraphSpacing: number;
  listSpacing: number;
  blockquoteStyle: "indent" | "border-left" | "background";

  // ── Language-Specific Rules ──
  /** Does this language have complex conjuncts that break with spacing? */
  hasComplexConjuncts: boolean;
  /** Does this language need extra vertical space for matras? */
  needsMatraSpace: boolean;
  /** Does this language have retroflex characters that need special rendering? */
  hasRetroflex: boolean;
  /** Unique characters that fonts must support. */
  uniqueChars: string;
  /** Common OCR/web rendering issues. */
  renderingIssues: string[];

  // ── Newspaper Presets ──
  newspaperPresets: NewspaperPreset[];
}

export interface NewspaperPreset {
  name: string;
  nameNative: string;
  columns: number;
  columnWidth: string;
  gap: string;
  lineHeight: number;
  fontSize: string;
  fontFamily: string;
  description: string;
}

// ─── Telugu Configuration ─────────────────────────────────────────────────────

export const TELUGU: SouthIndianLanguageConfig = {
  code: "te",
  name: "Telugu",
  nativeName: "తెలుగు",
  script: "Telugu",
  family: "dravidian",

  lineHeight: { min: 1.7, recommended: 1.9, max: 2.2 },
  letterSpacing: 0,
  wordSpacing: 1.0,
  fontSize: { body: 18, bodyMin: 16, h1: 42, h2: 36, h3: 30, h4: 26 },
  lineLength: { chars: 55, em: 38 },

  fonts: {
    sans: ["Noto Sans Telugu", "Mallanna", "Mandali", "Gidugu"],
    serif: ["Noto Serif Telugu", " VP Telugu", "Ponnala"],
    display: ["Mallanna", "Mandali", "Gidugu"],
    mono: ["Noto Sans Mono"],
  },

  headlinePadding: { top: 8, bottom: 4 },
  paragraphSpacing: 1.5,
  listSpacing: 0.75,
  blockquoteStyle: "border-left",

  hasComplexConjuncts: true,
  needsMatraSpace: true,
  hasRetroflex: false,
  uniqueChars: "అ ఆ ఇ ఈ ఉ ఊ ఋ ఎ ఏ ఐ ఒ ఓ ఔ క ఖ గ ఘ ఙ చ ఛ జ ఝ ఞ ట ఠ డ ఢ ణ త థ ద ధ న ప ఫ బ భ మ య ర ల వ శ ష స హ ళ క్ష జ్ఞ",
  renderingIssues: [
    "Conjuncts (ల్ల, క్ష) break with letter-spacing > 0",
    "Tall matras (ా, ి, ు) get clipped with line-height < 1.7",
    "ఱ (rra) renders differently across fonts",
    "్ (virama/halant) must not have extra spacing",
  ],

  newspaperPresets: [
    {
      name: "Main Paper",
      nameNative: "మూల పత్రిక",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.9,
      fontSize: "17px",
      fontFamily: "Noto Serif Telugu, ' VP Telugu', serif",
      description: "Standard Telugu newspaper — Prajavani/Eenadu style",
    },
    {
      name: "Headline",
      nameNative: "శీర్షిక",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "42px",
      fontFamily: "Noto Sans Telugu, Mallanna, sans-serif",
      description: "Bold headline — large, round, impactful",
    },
    {
      name: "Feature Story",
      nameNative: "కథనం",
      columns: 2,
      columnWidth: "30em",
      gap: "2.5em",
      lineHeight: 2.0,
      fontSize: "18px",
      fontFamily: "Noto Serif Telugu, serif",
      description: "Long-form editorial — generous spacing for reading comfort",
    },
    {
      name: "Breaking News",
      nameNative: "తాజా వార్త",
      columns: 3,
      columnWidth: "22em",
      gap: "1.5em",
      lineHeight: 1.8,
      fontSize: "16px",
      fontFamily: "Noto Sans Telugu, sans-serif",
      description: "Compact news layout — more columns, smaller text",
    },
  ],
};

// ─── Kannada Configuration ────────────────────────────────────────────────────

export const KANNADA: SouthIndianLanguageConfig = {
  code: "kn",
  name: "Kannada",
  nativeName: "ಕನ್ನಡ",
  script: "Kannada",
  family: "dravidian",

  lineHeight: { min: 1.7, recommended: 1.9, max: 2.2 },
  letterSpacing: 0,
  wordSpacing: 1.0,
  fontSize: { body: 18, bodyMin: 16, h1: 42, h2: 36, h3: 30, h4: 26 },
  lineLength: { chars: 55, em: 38 },

  fonts: {
    sans: ["Noto Sans Kannada", "BMDhalooji", "Kedage", "Mallanna"],
    serif: ["Noto Serif Kannada", "Tiro Kannada", "Tunga"],
    display: ["BMDhalooji", "Kedage", "Mallanna"],
    mono: ["Noto Sans Mono"],
  },

  headlinePadding: { top: 8, bottom: 4 },
  paragraphSpacing: 1.5,
  listSpacing: 0.75,
  blockquoteStyle: "border-left",

  hasComplexConjuncts: true,
  needsMatraSpace: true,
  hasRetroflex: true, // ಳ (retroflex L), ೞ (retroflex LL), ಱ (retroflex R)
  uniqueChars: "ಅ ಆ ಇ ಈ ಉ ಊ ಋ ಎ ಏ ಐ ಒ ಓ ಔ ಕ ಖ ಗ ಘ ಙ ಚ ಛ ಜ ಝ ಞ ಟ ಠ ಡ ಢ ಣ ತ ಥ ದ ಧ ನ ಪ ಫ ಬ ಭ ಮ ಯ ರ ಲ ವ ಶ ಷ ಸ ಹ ಳ ಱ ೞ",
  renderingIssues: [
    "Conjuncts (ಕ್ಷ, ತ್ರ, ಜ್ಞ) break with letter-spacing > 0",
    "Tall matras (ಾ, ಿ, ು) get clipped with line-height < 1.7",
    "Retroflex ಳ (U+0CB3) renders differently across fonts",
    "್ (virama/halant) must not have extra spacing",
    "Numbers should match Kannada digit height (not Latin digits)",
    "Tunga font has different metrics than Noto — avoid mixing",
  ],

  newspaperPresets: [
    {
      name: "Main Paper",
      nameNative: "ಮುಖ್ಯ ಪತ್ರಿಕೆ",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.9,
      fontSize: "17px",
      fontFamily: "Noto Serif Kannada, Tiro Kannada, serif",
      description: "Standard Kannada newspaper — Prajavani/Udayavani style",
    },
    {
      name: "Headline",
      nameNative: "ಶೀರ್ಷಿಕೆ",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "42px",
      fontFamily: "Noto Sans Kannada, BMDhalooji, sans-serif",
      description: "Bold headline — round Kannada letterforms",
    },
    {
      name: "Feature Story",
      nameNative: "ವಿಶೇಷ ಲೇಖನ",
      columns: 2,
      columnWidth: "30em",
      gap: "2.5em",
      lineHeight: 2.0,
      fontSize: "18px",
      fontFamily: "Noto Serif Kannada, serif",
      description: "Long-form editorial — generous spacing",
    },
    {
      name: "Breaking News",
      nameNative: "ತಾಜಾ ಸುದ್ದಿ",
      columns: 3,
      columnWidth: "22em",
      gap: "1.5em",
      lineHeight: 1.8,
      fontSize: "16px",
      fontFamily: "Noto Sans Kannada, sans-serif",
      description: "Compact news layout",
    },
  ],
};

// ─── Tamil Configuration ──────────────────────────────────────────────────────

export const TAMIL: SouthIndianLanguageConfig = {
  code: "ta",
  name: "Tamil",
  nativeName: "தமிழ்",
  script: "Tamil",
  family: "dravidian",

  lineHeight: { min: 1.6, recommended: 1.8, max: 2.0 },
  letterSpacing: 0,
  wordSpacing: 1.0,
  fontSize: { body: 18, bodyMin: 16, h1: 40, h2: 34, h3: 28, h4: 24 },
  lineLength: { chars: 58, em: 40 },

  fonts: {
    sans: ["Noto Sans Tamil", "Latha", "Vijaya", "Sounds Great"],
    serif: ["Noto Serif Tamil", "Latha", "TAM-Tamil"],
    display: ["Sounds Great", "Latha", "Vijaya"],
    mono: ["Noto Sans Mono"],
  },

  headlinePadding: { top: 6, bottom: 2 },
  paragraphSpacing: 1.5,
  listSpacing: 0.75,
  blockquoteStyle: "border-left",

  hasComplexConjuncts: false, // Tamil has very few conjuncts
  needsMatraSpace: false,     // Tamil matras are simpler
  hasRetroflex: true,         // ழ (retroflex L), ள (retroflex L)
  uniqueChars: "அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ ஔ க ங ச ஜ ஞ ட ண த ந ப ம ய ர ல வ ழ ள ற ன ஸ ஷ ஹ",
  renderingIssues: [
    "Tamil has few conjuncts but க்ஷ (ksha) is common and can break",
    "ஃ (aytham) is unique to Tamil — fonts must support it",
    "Tamil numbers (௦௧௨௩௪௫௬௭௮௯) should be used instead of Arabic numerals in formal text",
    "ல/ள/ḻ distinction is critical — wrong font loses the difference",
    "Tamil vowels (உ, ஊ) have unique shapes that some fonts render poorly",
  ],

  newspaperPresets: [
    {
      name: "Main Paper",
      nameNative: "முதன்மை இதழ்",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Tamil, Latha, serif",
      description: "Standard Tamil newspaper — Dinamalar/Dinamani style",
    },
    {
      name: "Headline",
      nameNative: "தலைப்பு",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "40px",
      fontFamily: "Noto Sans Tamil, Vijaya, sans-serif",
      description: "Bold headline — Tamil letterforms are rounder than Hindi",
    },
    {
      name: "Feature Story",
      nameNative: "சிறப்பு கட்டுரை",
      columns: 2,
      columnWidth: "30em",
      gap: "2.5em",
      lineHeight: 1.9,
      fontSize: "18px",
      fontFamily: "Noto Serif Tamil, serif",
      description: "Long-form editorial — Tamil reads well at slightly tighter spacing than Telugu",
    },
    {
      name: "Breaking News",
      nameNative: "உடனடி செய்தி",
      columns: 3,
      columnWidth: "22em",
      gap: "1.5em",
      lineHeight: 1.7,
      fontSize: "16px",
      fontFamily: "Noto Sans Tamil, sans-serif",
      description: "Compact news layout",
    },
  ],
};

// ─── Malayalam Configuration ──────────────────────────────────────────────────

export const MALAYALAM: SouthIndianLanguageConfig = {
  code: "ml",
  name: "Malayalam",
  nativeName: "മലയാളം",
  script: "Malayalam",
  family: "dravidian",

  lineHeight: { min: 1.6, recommended: 1.8, max: 2.1 },
  letterSpacing: 0,
  wordSpacing: 1.0,
  fontSize: { body: 18, bodyMin: 16, h1: 40, h2: 34, h3: 28, h4: 24 },
  lineLength: { chars: 58, em: 40 },

  fonts: {
    sans: ["Noto Sans Malayalam", "Manjari", "Chilanka"],
    serif: ["Noto Serif Malayalam", "Rachana", "Meera"],
    display: ["Chilanka", "Manjari"],
    mono: ["Noto Sans Mono"],
  },

  headlinePadding: { top: 6, bottom: 4 },
  paragraphSpacing: 1.5,
  listSpacing: 0.75,
  blockquoteStyle: "background",

  hasComplexConjuncts: true, // Malayalam has the most complex conjuncts
  needsMatraSpace: true,
  hasRetroflex: true, // ള (retroflex L), ഴ (retroflex L)
  uniqueChars: "അ ആ ഇ ഈ ഉ ഊ ഋ എ ഏ ഐ ഒ ഓ ഔ ക ഖ ഗ ഘ ങ ച ഛ ജ ഝ ഞ ട ഠ ഡ ഢ ണ ത ഥ ദ ധ ന പ ഫ ബ ഭ മ യ ര ല വ ശ ഷ സ ഹ ള ഴ റ ഩ റ്റ ല്ല ണ്ണ ന്ന മ്മ",
  renderingIssues: [
    "Malayalam has the MOST complex conjunct system of all 4 languages",
    "Chillu characters (ൺ, ഻, ഼, ൾ, ൿ) are unique — not all fonts support them",
    "Ligatures like ക്ഷ, ത്ത, ന്ന are critical — letter-spacing breaks them",
    "Tall matras (ാ, ി, ു) need generous line-height (1.8+)",
    "ര/റ distinction is critical — wrong font loses the difference",
    "Old-style vs new-style Malayalam — some fonts use legacy forms",
  ],

  newspaperPresets: [
    {
      name: "Main Paper",
      nameNative: "പ്രധാന പത്രിക",
      columns: 4,
      columnWidth: "18em",
      gap: "2em",
      lineHeight: 1.8,
      fontSize: "17px",
      fontFamily: "Noto Serif Malayalam, Rachana, serif",
      description: "Standard Malayalam newspaper — Mathrubhumi/Manorama style",
    },
    {
      name: "Headline",
      nameNative: "തലക്കെട്ട്",
      columns: 1,
      columnWidth: "100%",
      gap: "0",
      lineHeight: 1.4,
      fontSize: "40px",
      fontFamily: "Noto Sans Malayalam, Manjari, sans-serif",
      description: "Bold headline — Malayalam has very round, flowing forms",
    },
    {
      name: "Feature Story",
      nameNative: "പ്രത്യേക ലേഖനം",
      columns: 2,
      columnWidth: "30em",
      gap: "2.5em",
      lineHeight: 1.9,
      fontSize: "18px",
      fontFamily: "Noto Serif Malayalam, serif",
      description: "Long-form editorial — generous spacing for complex conjuncts",
    },
    {
      name: "Breaking News",
      nameNative: "പുതിയ വാർത്ത",
      columns: 3,
      columnWidth: "22em",
      gap: "1.5em",
      lineHeight: 1.7,
      fontSize: "16px",
      fontFamily: "Noto Sans Malayalam, sans-serif",
      description: "Compact news layout",
    },
  ],
};

// ─── All Languages Registry ───────────────────────────────────────────────────

export const SOUTH_INDIAN_LANGUAGES: Record<string, SouthIndianLanguageConfig> = {
  telugu: TELUGU,
  kannada: KANNADA,
  tamil: TAMIL,
  malayalam: MALAYALAM,
};

export type SouthIndianLanguage = keyof typeof SOUTH_INDIAN_LANGUAGES;

// ─── CSS Generation ───────────────────────────────────────────────────────────

/** Generate complete CSS for a South Indian language. */
export function generateLanguageCSS(lang: SouthIndianLanguage): string {
  const config = SOUTH_INDIAN_LANGUAGES[lang];
  const fontUrl = config.fonts.sans[0].replace(/ /g, "+");

  const lines: string[] = [
    `/* ============================================ */`,
    `/* ${config.name} (${config.nativeName}) Typography     */`,
    `/* W3C Indic Layout Requirements Compliant      */`,
    `/* ============================================ */`,
    ``,
    `@import url('https://fonts.googleapis.com/css2?family=${fontUrl}:wght@400;500;600;700;800&display=swap');`,
    ``,
    `/* ── Base Typography ── */`,
    `[lang="${config.code}"], .lang-${config.code} {`,
    `  font-family: '${config.fonts.sans[0]}', ${config.fonts.sans.slice(1).map(f => `'${f}'`).join(', ')}, sans-serif;`,
    `  line-height: ${config.lineHeight.recommended};`,
    `  letter-spacing: 0;  /* CRITICAL: never add letter-spacing */`,
    `  font-feature-settings: 'liga' 1, 'clig' 1;`,
    `  font-optical-sizing: auto;`,
    `  -webkit-font-smoothing: antialiased;`,
    `  -moz-osx-font-smoothing: grayscale;`,
    `}`,
    ``,
    `/* ── Body Text ── */`,
    `[lang="${config.code}"] p,`,
    `[lang="${config.code}"] .body-text,`,
    `[lang="${config.code}"] td,`,
    `[lang="${config.code}"] li {`,
    `  font-size: ${config.fontSize.body}px;`,
    `  line-height: ${config.lineHeight.recommended};`,
    `  max-width: ${config.lineLength.em}em;`,
    `}`,
    ``,
    `/* ── Headings ── */`,
    `  [lang="${config.code}"] h1 {`,
    `  font-size: ${config.fontSize.h1}px;`,
    `  line-height: ${config.lineHeight.min + 0.1};`,
    `  font-weight: 700;`,
    `  padding-top: ${config.headlinePadding.top}px;`,
    `  padding-bottom: ${config.headlinePadding.bottom}px;`,
    `}`,
    `[lang="${config.code}"] h2 {`,
    `  font-size: ${config.fontSize.h2}px;`,
    `  line-height: ${config.lineHeight.min + 0.1};`,
    `  font-weight: 700;`,
    `  padding-top: ${config.headlinePadding.top}px;`,
    `  padding-bottom: ${config.headlinePadding.bottom}px;`,
    `}`,
    `[lang="${config.code}"] h3 {`,
    `  font-size: ${config.fontSize.h3}px;`,
    `  line-height: ${config.lineHeight.min + 0.1};`,
    `  font-weight: 600;`,
    `}`,
    `[lang="${config.code}"] h4 {`,
    `  font-size: ${config.fontSize.h4}px;`,
    `  line-height: ${config.lineHeight.min + 0.1};`,
    `  font-weight: 600;`,
    `}`,
    ``,
    `/* ── Enforce zero letter-spacing on ALL elements ── */`,
    `[lang="${config.code}"] *,`,
    `[lang="${config.code}"] *::before,`,
    `[lang="${config.code}"] *::after {`,
    `  letter-spacing: 0 !important;  /* Indic conjuncts break with spacing */`,
    `}`,
    ``,
    `/* ── Links ── */`,
    `[lang="${config.code}"] a {`,
    `  text-decoration: underline;`,
    `  text-underline-offset: 3px;`,
    `}`,
    ``,
    `/* ── Blockquote (${config.blockquoteStyle}) ── */`,
  ];

  if (config.blockquoteStyle === "border-left") {
    lines.push(
      `[lang="${config.code}"] blockquote {`,
      `  border-left: 4px solid currentColor;`,
      `  padding-left: 1em;`,
      `  margin-left: 0;`,
      `  font-style: italic;`,
      `}`,
    );
  } else {
    lines.push(
      `[lang="${config.code}"] blockquote {`,
      `  background: rgba(0,0,0,0.05);`,
      `  padding: 1em 1.5em;`,
      `  border-radius: 0.5em;`,
      `  margin: 1.5em 0;`,
      `}`,
    );
  }

  // Add language-specific rendering fixes
  if (config.hasComplexConjuncts) {
    lines.push(
      ``,
      `/* ── Conjunct Rendering Fixes ── */`,
      `[lang="${config.code}"] {`,
      `  font-variant-ligatures: common-ligatures;`,
      `  text-rendering: optimizeLegibility;`,
      `}`,
    );
  }

  if (config.hasRetroflex) {
    lines.push(
      ``,
      `/* ── Retroflex Character Support ── */`,
      `[lang="${config.code}"] {`,
      `  /* Ensure retroflex characters (ಳ, ള, ள) render correctly */`,
      `  font-feature-settings: 'salt' 1;`,
      `}`,
    );
  }

  lines.push(``);

  return lines.join("\n");
}

// ─── Tailwind Config ──────────────────────────────────────────────────────────

/** Generate Tailwind config extensions for a South Indian language. */
export function generateTailwindConfig(lang: SouthIndianLanguage): Record<string, unknown> {
  const config = SOUTH_INDIAN_LANGUAGES[lang];

  return {
    theme: {
      extend: {
        fontFamily: {
          [config.code]: config.fonts.sans,
          [`${config.code}-serif`]: config.fonts.serif,
          [`${config.code}-display`]: config.fonts.display,
        },
        fontSize: {
          "body": [`${config.fontSize.body}px`, { lineHeight: String(config.lineHeight.recommended) }],
          "body-sm": [`${config.fontSize.bodyMin}px`, { lineHeight: String(config.lineHeight.recommended) }],
          "h1": [`${config.fontSize.h1}px`, { lineHeight: String(config.lineHeight.min + 0.1) }],
          "h2": [`${config.fontSize.h2}px`, { lineHeight: String(config.lineHeight.min + 0.1) }],
          "h3": [`${config.fontSize.h3}px`, { lineHeight: String(config.lineHeight.min + 0.1) }],
          "h4": [`${config.fontSize.h4}px`, { lineHeight: String(config.lineHeight.min + 0.1) }],
        },
        lineHeight: {
          "indic-tight": String(config.lineHeight.min),
          "indic-normal": String(config.lineHeight.recommended),
          "indic-loose": String(config.lineHeight.max),
        },
        letterSpacing: {
          "indic": "0",  // ALWAYS zero for Indic scripts
        },
        maxWidth: {
          "indic-line": `${config.lineLength.em}em`,
        },
      },
    },
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface LanguageViolation {
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  fix: string;
}

/** Validate CSS against a specific South Indian language's rules. */
export function validateLanguageTypography(
  lang: SouthIndianLanguage,
  css: Record<string, unknown>,
): LanguageViolation[] {
  const config = SOUTH_INDIAN_LANGUAGES[lang];
  const violations: LanguageViolation[] = [];

  // Check letter-spacing
  const ls = String(css.letterSpacing ?? "");
  if (ls && ls !== "0" && ls !== "normal" && ls !== "0px" && ls !== "0em") {
    violations.push({
      severity: "error",
      rule: "no-letter-spacing",
      message: `letter-spacing: ${ls} will break ${config.name} conjunct consonants`,
      fix: `Set letter-spacing: 0`,
    });
  }

  // Check line-height
  const lh = parseFloat(String(css.lineHeight ?? "1.5"));
  if (!isNaN(lh) && lh < config.lineHeight.min) {
    violations.push({
      severity: "error",
      rule: "line-height-too-low",
      message: `line-height: ${lh} is too low for ${config.name} — vowel marks will be clipped (minimum: ${config.lineHeight.min})`,
      fix: `Use line-height: ${config.lineHeight.recommended} or higher`,
    });
  }

  // Check font size
  const fs = parseFloat(String(css.fontSize ?? "16"));
  if (!isNaN(fs) && fs < config.fontSize.bodyMin) {
    violations.push({
      severity: "warning",
      rule: "font-size-too-small",
      message: `font-size: ${fs}px is too small for ${config.name} — complex glyphs need minimum ${config.fontSize.bodyMin}px`,
      fix: `Use font-size: ${config.fontSize.body}px or larger`,
    });
  }

  // Check font family
  const ff = String(css.fontFamily ?? "");
  const allFonts = [...config.fonts.sans, ...config.fonts.serif];
  const hasLangFont = allFonts.some((f) => ff.includes(f));
  if (ff && !hasLangFont) {
    violations.push({
      severity: "warning",
      rule: "missing-language-font",
      message: `font-family does not include a ${config.name} font — glyphs may render as boxes`,
      fix: `Add one of: ${config.fonts.sans.slice(0, 3).join(", ")}`,
    });
  }

  // Check max-width
  const mw = String(css.maxWidth ?? "");
  if (mw) {
    const emMatch = mw.match(/([\d.]+)em/);
    if (emMatch) {
      const em = parseFloat(emMatch[1]);
      if (em > config.lineLength.em) {
        violations.push({
          severity: "warning",
          rule: "line-too-long",
          message: `max-width: ${mw} exceeds ${config.name} optimal line length of ${config.lineLength.em}em`,
          fix: `Reduce to ${config.lineLength.em}em or ${config.lineLength.chars} characters`,
        });
      }
    }
  }

  // Check for text-rendering (important for conjuncts)
  const tr = String(css.textRendering ?? "");
  if (tr && tr.includes("optimizeSpeed")) {
    violations.push({
      severity: "warning",
      rule: "text-rendering-speed",
      message: `text-rendering: optimizeSpeed may break ${config.name} conjunct rendering`,
      fix: `Use text-rendering: optimizeLegibility`,
    });
  }

  return violations;
}

// ─── Comparison Table ─────────────────────────────────────────────────────────

/** Side-by-side comparison of all 4 South Indian languages. */
export function comparisonTable(): string {
  const langs = [TELUGU, KANNADA, TAMIL, MALAYALAM];

  const header = `| Rule | Telugu | Kannada | Tamil | Malayalam |`;
  const sep =    `|------|--------|---------|-------|-----------|`;

  const rows = [
    `| **Line Height (min)** | ${TELUGU.lineHeight.min} | ${KANNADA.lineHeight.min} | ${TAMIL.lineHeight.min} | ${MALAYALAM.lineHeight.min} |`,
    `| **Line Height (rec)** | ${TELUGU.lineHeight.recommended} | ${KANNADA.lineHeight.recommended} | ${TAMIL.lineHeight.recommended} | ${MALAYALAM.lineHeight.recommended} |`,
    `| **Letter Spacing** | 0 | 0 | 0 | 0 |`,
    `| **Body Font Size** | ${TELUGU.fontSize.body}px | ${KANNADA.fontSize.body}px | ${TAMIL.fontSize.body}px | ${MALAYALAM.fontSize.body}px |`,
    `| **H1 Size** | ${TELUGU.fontSize.h1}px | ${KANNADA.fontSize.h1}px | ${TAMIL.fontSize.h1}px | ${MALAYALAM.fontSize.h1}px |`,
    `| **Line Length** | ${TELUGU.lineLength.em}em | ${KANNADA.lineLength.em}em | ${TAMIL.lineLength.em}em | ${MALAYALAM.lineLength.em}em |`,
    `| **Complex Conjuncts** | ✅ Yes | ✅ Yes | ❌ Few | ✅ Most complex |`,
    `| **Retroflex Chars** | ❌ No | ✅ ಳ, ౞, ಱ | ✅ ழ, ள | ✅ ള, ഴ, റ |`,
    `| **Chillu Chars** | ❌ No | ❌ No | ❌ No | ✅ ണ്ണ, ല്ല, etc |`,
    `| **Primary Font** | Noto Sans Telugu | Noto Sans Kannada | Noto Sans Tamil | Noto Sans Malayalam |`,
    `| **Serif Font** | Noto Serif Telugu | Noto Serif Kannada | Noto Serif Tamil | Noto Serif Malayalam |`,
  ];

  return [header, sep, ...rows].join("\n");
}
