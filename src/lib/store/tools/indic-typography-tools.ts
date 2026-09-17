/**
 * Indic Typography Tools — fix why Telugu/Hindi/Bengali websites look bad.
 *
 * These tools enforce W3C Indic Layout Requirements (ilreq) so agents
 * generate beautiful Indic designs instead of broken Latin-clone layouts.
 */

import type { ToolManifest } from "../tool-types";

export const INDIC_TYPOGRAPHY_DETECT_MANIFEST: ToolManifest = {
  id: "typography.indic.detect",
  name: "Detect Indic Script",
  description: "Detect which Indic script a text sample uses",
  longDescription:
    "Analyze text to identify the dominant Indic script (Telugu, Devanagari, Bengali, Tamil, etc.) using Unicode range analysis. Returns script name, code, and recommended typography rules.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "indic", "script-detection", "telugu", "hindi", "bengali", "unicode"],
  icon: "Languages",
  color: "#f97316",
  parameters: [
    { name: "text", type: "string", description: "Text sample to analyze", required: true },
  ],
  capabilities: [
    { name: "detect-script", description: "Identify Indic script from Unicode codepoints", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 7200,
  rating: 4.6,
  ratingCount: 156,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_TYPOGRAPHY_RULES_MANIFEST: ToolManifest = {
  id: "typography.indic.rules",
  name: "Get Indic Typography Rules",
  description: "Get W3C-compliant typography rules for an Indic script",
  longDescription:
    "Return the complete typography rule set for a given Indic script: line-height ranges, font recommendations, max line length, letter-spacing rules, headline padding, and more. Based on W3C Indic Layout Requirements.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "rules", "w3c", "line-height", "fonts", "layout"],
  icon: "BookOpen",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Indic script to get rules for", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
  ],
  capabilities: [
    { name: "typography-rules", description: "Retrieve W3C-compliant typography rules", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 8400,
  rating: 4.8,
  ratingCount: 198,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_TYPOGRAPHY_CSS_MANIFEST: ToolManifest = {
  id: "typography.indic.css",
  name: "Generate Indic CSS",
  description: "Generate CSS that follows W3C Indic Layout Requirements",
  longDescription:
    "Generate a complete CSS block for an Indic script: font-family with Google Fonts import, line-height rules, zero letter-spacing enforcement, heading sizes, body text sizing, and max-width constraints. Ready to paste into any project.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "css", "generation", "google-fonts", "responsive"],
  icon: "Code",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Indic script to generate CSS for", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
    { name: "selector", type: "string", description: "CSS selector (default: [lang=\"script\"])", required: false },
    { name: "includeFonts", type: "boolean", description: "Include Google Fonts @import", required: false, default: true },
  ],
  capabilities: [
    { name: "generate-css", description: "Produce W3C-compliant Indic CSS", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 11200,
  rating: 4.9,
  ratingCount: 287,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_TYPOGRAPHY_TOKENS_MANIFEST: ToolManifest = {
  id: "typography.indic.tokens",
  name: "Generate Indic Design Tokens",
  description: "Generate Tailwind-compatible design tokens for an Indic script",
  longDescription:
    "Generate design tokens (fontFamily, fontSize, lineHeight, letterSpacing, spacing) tuned for a specific Indic script. Ready to add to tailwind.config or a design system.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "tokens", "tailwind", "design-system", "config"],
  icon: "Palette",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Indic script", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
  ],
  capabilities: [
    { name: "generate-tokens", description: "Produce Indic-tuned design tokens", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 7800,
  rating: 4.7,
  ratingCount: 172,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_TYPOGRAPHY_VALIDATE_MANIFEST: ToolManifest = {
  id: "typography.indic.validate",
  name: "Validate Indic Typography",
  description: "Check CSS against W3C Indic Layout Requirements",
  longDescription:
    "Audit CSS properties against Indic typography rules. Catches: letter-spacing that breaks conjuncts, line-height that clips matras, missing Indic fonts, oversized line lengths, and too-small font sizes. Returns violations with severity and fixes.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "validation", "audit", "w3c", "accessibility", "quality"],
  icon: "ShieldCheck",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Indic script to validate against", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
    { name: "css", type: "object", description: "CSS properties to validate (e.g., { fontSize: '14px', letterSpacing: '0.05em', lineHeight: '1.3' })", required: true },
  ],
  capabilities: [
    { name: "validate-typography", description: "Audit CSS against Indic typography rules", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 9600,
  rating: 4.8,
  ratingCount: 234,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_TYPOGRAPHY_NEWSPAPER_MANIFEST: ToolManifest = {
  id: "typography.indic.newspaper",
  name: "Newspaper Layout Preset",
  description: "Get a proven newspaper-style column layout for an Indic script",
  longDescription:
    "Return a pre-designed newspaper column layout that has been proven to work beautifully for a specific Indic script. Includes column count, width, gap, line-height, font size, and font family. Based on actual Telugu/Hindi/Bengali newspaper layouts.",
  category: "design",
  subcategory: "typography",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["typography", "newspaper", "columns", "layout", "editorial", "print-inspired"],
  icon: "Newspaper",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Indic script", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
    { name: "preset", type: "enum", description: "Layout preset", required: false, enum: ["main", "headline", "feature"] },
  ],
  capabilities: [
    { name: "newspaper-layout", description: "Get proven newspaper column layouts", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 8200,
  rating: 4.7,
  ratingCount: 189,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const INDIC_DESIGN_CREATE_MANIFEST: ToolManifest = {
  id: "design.indic.create",
  name: "Create Indic Design",
  description: "Create a complete design canvas pre-configured for an Indic script",
  longDescription:
    "One-shot: creates a canvas with correct typography rules, fonts, line-heights, spacing, and design tokens for the specified Indic script. All subsequent elements automatically follow W3C Indic Layout Requirements.",
  category: "design",
  subcategory: "templates",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "indic", "template", "one-shot", "newspaper", "website"],
  icon: "Sparkles",
  color: "#f97316",
  parameters: [
    { name: "script", type: "enum", description: "Primary Indic script for the design", required: true, enum: ["telugu", "devanagari", "bengali", "tamil", "kannada", "malayalam", "gujarati", "gurmukhi", "odia"] },
    { name: "name", type: "string", description: "Design name", required: false },
    { name: "layout", type: "enum", description: "Pre-built layout template", required: false, enum: ["newspaper", "website", "blog", "landing-page"] },
  ],
  capabilities: [
    { name: "create-indic-design", description: "Generate complete Indic-aware designs", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 14800,
  rating: 4.9,
  ratingCount: 342,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

/** All Indic typography tool manifests. */
export const INDIC_TYPOGRAPHY_TOOLS: ToolManifest[] = [
  INDIC_TYPOGRAPHY_DETECT_MANIFEST,
  INDIC_TYPOGRAPHY_RULES_MANIFEST,
  INDIC_TYPOGRAPHY_CSS_MANIFEST,
  INDIC_TYPOGRAPHY_TOKENS_MANIFEST,
  INDIC_TYPOGRAPHY_VALIDATE_MANIFEST,
  INDIC_TYPOGRAPHY_NEWSPAPER_MANIFEST,
  INDIC_DESIGN_CREATE_MANIFEST,
];
