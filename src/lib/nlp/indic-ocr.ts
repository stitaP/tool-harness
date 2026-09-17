/**
 * Indic OCR — multi-script optical character recognition for Indian languages.
 *
 * Backed by tesseract.js with language-specific traineddata files fetched
 * lazily from the Tessdata CDN. Supports 12 official Indian languages plus
 * English for mixed-script documents (common in India).
 *
 * Strategy:
 *  1. User selects a language (or "auto" for detection).
 *  2. For "auto", run a fast script-detection pass using Unicode range analysis
 *     on a small crop to pick the most likely script.
 *  3. Load the appropriate tesseract traineddata (cached after first fetch).
 *  4. Run OCR with the selected language pack.
 *  5. For multi-script documents, fall back to a combined language string
 *     (e.g., "hin+eng") which tesseract supports natively.
 *
 * The MGP-STR model (already in the project) already handles Devanagari and
 * other Indic scripts for scene text; this module adds fine-grained language
 * packs for higher accuracy on printed documents.
 */

// ─── Language Definitions ─────────────────────────────────────────────────────

export interface IndicLanguage {
  /** ISO 639-2 / tesseract code. */
  code: string;
  /** Human-readable name. */
  name: string;
  /** Script name (for display and auto-detection). */
  script: string;
  /** Unicode range for script detection (start hex, end hex). */
  unicodeRange: [number, number];
  /** Approx traineddata download size in MB. */
  sizeMb: number;
  /** Whether this language uses Devanagari script (shared model possible). */
  scriptFamily: "devanagari" | "bengali" | "tamil" | "telugu" | "gujarati" | "kannada" | "malayalam" | "gurmukhi" | "odia" | "eastern-nagari" | "latin";
}

/**
 * All supported Indic languages. The codes match tesseract-ocr/tessdata_fast
 * repository conventions. Download URL pattern:
 *   https://cdn.jsdelivr.net/npm/@aspect-build/aspect-workflows@0.0.0/...
 *   → actually: https://tessdata.projectnaptha.com/4.0.0/{code}.traineddata
 *   → or jsdelivr CDN for tesseract.js: https://cdn.jsdelivr.net/npm/tesseract.js-data@5/{code}.traineddata.gz
 */
export const INDIC_LANGUAGES: IndicLanguage[] = [
  // Devanagari family
  { code: "hin", name: "Hindi", script: "Devanagari", unicodeRange: [0x0900, 0x097F], sizeMb: 2.5, scriptFamily: "devanagari" },
  { code: "mar", name: "Marathi", script: "Devanagari", unicodeRange: [0x0900, 0x097F], sizeMb: 2.5, scriptFamily: "devanagari" },
  { code: "san", name: "Sanskrit", script: "Devanagari", unicodeRange: [0x0900, 0x097F], sizeMb: 2.5, scriptFamily: "devanagari" },
  { code: "nep", name: "Nepali", script: "Devanagari", unicodeRange: [0x0900, 0x097F], sizeMb: 2.5, scriptFamily: "devanagari" },

  // Bengali / Eastern Nagari
  { code: "ben", name: "Bengali", script: "Bengali", unicodeRange: [0x0980, 0x09FF], sizeMb: 2.8, scriptFamily: "bengali" },
  { code: "asm", name: "Assamese", script: "Eastern Nagari", unicodeRange: [0x0980, 0x09FF], sizeMb: 2.8, scriptFamily: "eastern-nagari" },

  // South Indian scripts
  { code: "tam", name: "Tamil", script: "Tamil", unicodeRange: [0x0B80, 0x0BFF], sizeMb: 2.6, scriptFamily: "tamil" },
  { code: "tel", name: "Telugu", script: "Telugu", unicodeRange: [0x0C00, 0x0C7F], sizeMb: 2.4, scriptFamily: "telugu" },
  { code: "kan", name: "Kannada", script: "Kannada", unicodeRange: [0x0C80, 0x0CFF], sizeMb: 2.5, scriptFamily: "kannada" },
  { code: "mal", name: "Malayalam", script: "Malayalam", unicodeRange: [0x0D00, 0x0D7F], sizeMb: 2.7, scriptFamily: "malayalam" },

  // Other scripts
  { code: "guj", name: "Gujarati", script: "Gujarati", unicodeRange: [0x0A80, 0x0AFF], sizeMb: 2.3, scriptFamily: "gujarati" },
  { code: "pan", name: "Punjabi", script: "Gurmukhi", unicodeRange: [0x0A00, 0x0A7F], sizeMb: 2.2, scriptFamily: "gurmukhi" },
  { code: "ori", name: "Odia", script: "Odia", unicodeRange: [0x0B00, 0x0B7F], sizeMb: 2.4, scriptFamily: "odia" },

  // English (for mixed-script documents)
  { code: "eng", name: "English", script: "Latin", unicodeRange: [0x0041, 0x007A], sizeMb: 2.0, scriptFamily: "latin" },
];

/** Quick lookup by tesseract code. */
const LANG_MAP = new Map(INDIC_LANGUAGES.map((l) => [l.code, l]));

export function indicLanguageByCode(code: string): IndicLanguage | undefined {
  return LANG_MAP.get(code);
}

// ─── Script Detection ─────────────────────────────────────────────────────────

/**
 * Detect the dominant Indic script from a text sample by counting Unicode
 * codepoints in each script's range. Returns the tesseract language code.
 *
 * Falls back to "eng" if no Indic script dominates.
 */
export function detectScript(text: string): string {
  const counts = new Map<string, number>();
  // Count per-script-family (not per-language, since Devanagari family shares codepoints)
  const scriptCounts = new Map<string, number>();

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    for (const lang of INDIC_LANGUAGES) {
      const [lo, hi] = lang.unicodeRange;
      if (cp >= lo && cp <= hi) {
        // Merge Devanagari family, Bengali/Assamese
        const family = lang.scriptFamily === "eastern-nagari" ? "bengali" : lang.scriptFamily;
        scriptCounts.set(family, (scriptCounts.get(family) ?? 0) + 1);
        counts.set(lang.code, (counts.get(lang.code) ?? 0) + 1);
        break;
      }
    }
  }

  if (scriptCounts.size === 0) return "eng"; // no Indic script detected

  // Find the dominant script family
  let bestFamily = "";
  let bestCount = 0;
  for (const [family, count] of scriptCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestFamily = family;
    }
  }

  // Pick the most common language within that family
  let bestLang = "eng";
  let langCount = 0;
  for (const [code, count] of counts) {
    const lang = LANG_MAP.get(code);
    if (lang && lang.scriptFamily === bestFamily && count > langCount) {
      langCount = count;
      bestLang = code;
    }
  }

  return bestLang;
}

// ─── Tessdata CDN ─────────────────────────────────────────────────────────────

/**
 * tesseract.js v5 ships language data via npm packages. The URL pattern for
 * a traineddata.gz file is:
 *   https://cdn.jsdelivr.net/npm/tesseract.js-data@5/{lang}.traineddata.gz
 *
 * For older tesseract.js or direct fetch:
 *   https://tessdata.projectnaptha.com/4.0.0/{lang}.traineddata
 *
 * We use the jsdelivr CDN (gzipped, ~1-3MB per language).
 */
export function tessdataUrl(langCode: string): string {
  return `https://cdn.jsdelivr.net/npm/tesseract.js-data@5/${langCode}.traineddata.gz`;
}

/**
 * Build a combined language string for tesseract.js multi-language OCR.
 * Example: ["hin", "eng"] → "hin+eng"
 *
 * Tesseract supports up to ~3-4 languages simultaneously before accuracy
 * degrades; we cap at 3.
 */
export function buildLanguageString(codes: string[], maxLangs = 3): string {
  const unique = [...new Set(codes)].filter((c) => LANG_MAP.has(c) || c === "eng");
  return unique.slice(0, maxLangs).join("+");
}

// ─── Common Mixed-Script Profiles ─────────────────────────────────────────────

/** Pre-defined language combinations for common Indian document types. */
export const INDIC_PROFILES: Record<string, { name: string; languages: string[]; description: string }> = {
  "hindi-english": {
    name: "Hindi + English",
    languages: ["hin", "eng"],
    description: "Common bilingual documents, government forms, newspapers",
  },
  "bengali-english": {
    name: "Bengali + English",
    languages: ["ben", "eng"],
    description: "Bengali newspapers, academic documents",
  },
  "tamil-english": {
    name: "Tamil + English",
    languages: ["tam", "eng"],
    description: "Tamil Nadu government documents, signage",
  },
  "telugu-english": {
    name: "Telugu + English",
    languages: ["tel", "eng"],
    description: "Andhra Pradesh / Telangana documents",
  },
  "hindi-marathi": {
    name: "Hindi + Marathi",
    languages: ["hin", "mar"],
    description: "Maharashtra government documents",
  },
  "all-south-indian": {
    name: "South Indian (Tamil+Telugu+Kannada+Malayalam)",
    languages: ["tam", "tel", "kan", "mal"],
    description: "Multi-script South Indian documents",
  },
  "devanagari-all": {
    name: "Devanagari (Hindi+Marathi+Nepali+Sanskrit)",
    languages: ["hin", "mar", "nep", "san"],
    description: "Documents in any Devanagari-script language",
  },
  "indian-all": {
    name: "All Indian Languages + English",
    languages: ["hin", "ben", "tam", "tel", "guj", "kan", "mal", "pan", "ori", "mar", "asm", "eng"],
    description: "Maximum coverage — slower but handles any Indian script",
  },
};

// ─── OCR Result Enhancement ───────────────────────────────────────────────────

export interface IndicOcrResult {
  /** Recognized text. */
  text: string;
  /** Language detected or used. */
  language: string;
  /** Script family detected. */
  script: string;
  /** Average confidence (0-1). */
  confidence: number;
  /** Per-line blocks with bounding boxes. */
  blocks: Array<{
    text: string;
    confidence: number;
    bounds: { x: number; y: number; width: number; height: number };
    script?: string;
  }>;
  /** Whether this was auto-detected or explicitly selected. */
  detectionMode: "auto" | "explicit" | "profile";
  /** Any warnings (e.g., low confidence, mixed scripts). */
  warnings: string[];
}

/**
 * Post-process recognized Indic text:
 *  - Normalize Unicode (NFC) for consistent rendering
 *  - Fix common OCR artifacts in Indic scripts (e.g., broken conjuncts)
 *  - Remove stray diacritics that tesseract sometimes produces
 */
export function normalizeIndicText(text: string, scriptFamily: string): string {
  // Unicode NFC normalization (critical for Indic scripts)
  let normalized = text.normalize("NFC");

  // Remove zero-width joiners that appear in wrong positions
  // (common tesseract artifact with Devanagari conjuncts)
  if (scriptFamily === "devanagari") {
    // Virama = U+094D, Nukta = U+093C, Devanagari block = U+0900-U+097F
    const chars = Array.from(normalized);
    const result: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      const cp = chars[i].codePointAt(0) ?? 0;
      // Virama (0x094D) — keep only if followed by a Devanagari character
      if (cp === 0x094D) {
        const nextCp = i + 1 < chars.length ? (chars[i + 1].codePointAt(0) ?? 0) : 0;
        if (nextCp >= 0x0900 && nextCp <= 0x097F) {
          result.push(chars[i]);
        }
        // else: skip orphaned virama
      }
      // Nukta (0x093C) — keep only if followed by a Devanagari character
      else if (cp === 0x093C) {
        const nextCp = i + 1 < chars.length ? (chars[i + 1].codePointAt(0) ?? 0) : 0;
        if (nextCp >= 0x0900 && nextCp <= 0x097F) {
          result.push(chars[i]);
        }
        // else: skip orphaned nukta
      }
      else {
        result.push(chars[i]);
      }
    }
    normalized = result.join("");
  }

  // Collapse multiple spaces
  normalized = normalized.replace(/[ \t]+/g, " ").trim();

  return normalized;
}

/**
 * Detect whether text contains mixed scripts (common in Indian documents).
 */
export function detectMixedScript(text: string): { isMixed: boolean; scripts: string[] } {
  const scripts = new Set<string>();

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    for (const lang of INDIC_LANGUAGES) {
      const [lo, hi] = lang.unicodeRange;
      if (cp >= lo && cp <= hi) {
        scripts.add(lang.scriptFamily);
        break;
      }
    }
  }

  return {
    isMixed: scripts.size > 1,
    scripts: [...scripts],
  };
}
