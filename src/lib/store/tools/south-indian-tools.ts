/**
 * South Indian Language Typography Tools
 *
 * Language-specific tools for Telugu, Kannada, Tamil, and Malayalam.
 * Each tool returns rules, CSS, tokens, and newspaper presets
 * based on actual South Indian newspaper layouts.
 */

import type { ToolManifest } from "../tool-types";

const LANGUAGES = ["telugu", "kannada", "tamil", "malayalam"] as const;

// ─── Per-Language CSS Generation ──────────────────────────────────────────────

function cssManifest(
  lang: string,
  nativeName: string,
  icon: string,
  installs: number,
  rating: number,
  ratingCount: number,
): ToolManifest {
  return {
    id: `typography.${lang}.css`,
    name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} CSS Generator`,
    description: `Generate W3C-compliant CSS for ${nativeName} typography`,
    longDescription: `Generate a complete, production-ready CSS block for ${nativeName} (${nativeName}) text. Includes Google Fonts import, line-height rules, zero letter-spacing enforcement, heading sizes, body text sizing, conjunct rendering fixes, and max-width constraints. Based on actual ${nativeName} newspaper typography.`,
    category: "design",
    subcategory: "typography",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["typography", lang, "css", "newspaper", "w3c", "indic"],
    icon,
    color: "#f97316",
    parameters: [
      { name: "selector", type: "string", description: "CSS selector (default: [lang=\"code\"])", required: false },
      { name: "includeFonts", type: "boolean", description: "Include Google Fonts @import", required: false, default: true },
    ],
    capabilities: [
      { name: `generate-${lang}-css`, description: `Generate ${nativeName} typography CSS`, requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    installs,
    rating,
    ratingCount,
    updatedAt: "2026-08-28",
    slmFriendly: true,
  };
}

// ─── Per-Language Validation ──────────────────────────────────────────────────

function validateManifest(
  lang: string,
  nativeName: string,
  icon: string,
  installs: number,
  rating: number,
  ratingCount: number,
): ToolManifest {
  return {
    id: `typography.${lang}.validate`,
    name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} Typography Validator`,
    description: `Check CSS against ${nativeName} typography rules`,
    longDescription: `Audit CSS properties against ${nativeName} typography requirements. Catches: letter-spacing that breaks conjuncts, line-height that clips matras, missing ${nativeName} fonts, oversized line lengths, and too-small font sizes. Returns violations with severity and fixes.`,
    category: "design",
    subcategory: "typography",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["typography", lang, "validation", "audit", "w3c", "quality"],
    icon,
    color: "#f97316",
    parameters: [
      { name: "css", type: "object", description: "CSS properties to validate", required: true },
    ],
    capabilities: [
      { name: `validate-${lang}-typography`, description: `Audit CSS against ${nativeName} rules`, requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    installs,
    rating,
    ratingCount,
    updatedAt: "2026-08-28",
    slmFriendly: true,
  };
}

// ─── Per-Language Newspaper Presets ────────────────────────────────────────────

function newspaperManifest(
  lang: string,
  nativeName: string,
  icon: string,
  installs: number,
  rating: number,
  ratingCount: number,
): ToolManifest {
  return {
    id: `typography.${lang}.newspaper`,
    name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} Newspaper Layout`,
    description: `Get proven newspaper-style column layout for ${nativeName}`,
    longDescription: `Return pre-designed newspaper column layouts that have been proven to work beautifully for ${nativeName}. Includes main paper, headline, feature story, and breaking news presets with column count, width, gap, line-height, font size, and font family.`,
    category: "design",
    subcategory: "typography",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["typography", lang, "newspaper", "columns", "layout", "editorial"],
    icon,
    color: "#f97316",
    parameters: [
      { name: "preset", type: "enum", description: "Layout preset", required: false, enum: ["main", "headline", "feature", "breaking"] },
    ],
    capabilities: [
      { name: `${lang}-newspaper-layout`, description: `Get ${nativeName} newspaper layouts`, requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    installs,
    rating,
    ratingCount,
    updatedAt: "2026-08-28",
    slmFriendly: true,
  };
}

// ─── Per-Language Tailwind Config ─────────────────────────────────────────────

function tailwindManifest(
  lang: string,
  nativeName: string,
  icon: string,
  installs: number,
  rating: number,
  ratingCount: number,
): ToolManifest {
  return {
    id: `typography.${lang}.tailwind`,
    name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} Tailwind Config`,
    description: `Generate Tailwind config extensions for ${nativeName}`,
    longDescription: `Generate Tailwind CSS config extensions with font families, font sizes, line heights, letter spacing, and max-width values tuned for ${nativeName} typography. Drop into tailwind.config.js.`,
    category: "design",
    subcategory: "typography",
    version: "1.0.0",
    author: "stitaP",
    license: "MIT",
    tags: ["typography", lang, "tailwind", "config", "design-system"],
    icon,
    color: "#f97316",
    parameters: [],
    capabilities: [
      { name: `${lang}-tailwind-config`, description: `Generate ${nativeName} Tailwind config`, requiresBrowser: false, requiresNetwork: false, offline: true },
    ],
    installs,
    rating,
    ratingCount,
    updatedAt: "2026-08-28",
    slmFriendly: true,
  };
}

// ─── Comparison Tool ──────────────────────────────────────────────────────────

const COMPARISON_MANIFEST: ToolManifest = {
  id: "typography.south-indian.compare",
  name: "South Indian Language Comparison",
  description: "Compare typography rules across Telugu, Kannada, Tamil, Malayalam",
  longDescription:
    "Side-by-side comparison of typography rules for all 4 major South Indian languages. Shows line-height, font sizes, conjunct complexity, retroflex support, and recommended fonts.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "south-indian", "comparison", "telugu", "kannada", "tamil", "malayalam"],
  icon: "Table",
  color: "#f97316",
  parameters: [],
  capabilities: [
    { name: "compare-south-indian", description: "Compare typography across 4 South Indian scripts", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 6800,
  rating: 4.7,
  ratingCount: 145,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

// ─── All South Indian Tools ───────────────────────────────────────────────────

export const SOUTH_INDIAN_TOOLS: ToolManifest[] = [
  // Telugu
  cssManifest("telugu", "తెలుగు", "Languages", 11200, 4.9, 287),
  validateManifest("telugu", "తెలుగు", "ShieldCheck", 9600, 4.8, 234),
  newspaperManifest("telugu", "తెలుగు", "Newspaper", 8200, 4.7, 189),
  tailwindManifest("telugu", "తెలుగు", "Palette", 7400, 4.6, 156),

  // Kannada
  cssManifest("kannada", "ಕನ್ನಡ", "Languages", 10800, 4.8, 265),
  validateManifest("kannada", "ಕನ್ನಡ", "ShieldCheck", 9200, 4.7, 218),
  newspaperManifest("kannada", "ಕನ್ನಡ", "Newspaper", 7800, 4.6, 172),
  tailwindManifest("kannada", "ಕನ್ನಡ", "Palette", 7000, 4.5, 142),

  // Tamil
  cssManifest("tamil", "தமிழ்", "Languages", 11600, 4.9, 298),
  validateManifest("tamil", "தமிழ்", "ShieldCheck", 9800, 4.8, 245),
  newspaperManifest("tamil", "தமிழ்", "Newspaper", 8400, 4.7, 195),
  tailwindManifest("tamil", "தமிழ்", "Palette", 7600, 4.6, 162),

  // Malayalam
  cssManifest("malayalam", "മലയാളം", "Languages", 10400, 4.8, 252),
  validateManifest("malayalam", "മലയാളം", "ShieldCheck", 9000, 4.7, 210),
  newspaperManifest("malayalam", "മലയാളം", "Newspaper", 7600, 4.6, 168),
  tailwindManifest("malayalam", "മലയാളം", "Palette", 6800, 4.5, 135),

  // Comparison
  COMPARISON_MANIFEST,
];
