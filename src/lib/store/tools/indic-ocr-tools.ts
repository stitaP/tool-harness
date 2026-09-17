/**
 * Indic OCR Tools — multi-script Indian language text recognition
 *
 * Provides OCR for 13 Indian languages plus English, with auto script
 * detection, predefined language profiles, and multi-language combined
 * recognition for mixed-script documents.
 */

import type { ToolManifest } from "../tool-types";

// ─── Indic OCR Tool Manifests ─────────────────────────────────────────────────

export const INDIC_OCR_DETECT_MANIFEST: ToolManifest = {
  id: "ocr.indic.detect",
  name: "Indic Script Detector",
  description: "Detect the dominant Indian script in an image",
  longDescription:
    "Analyzes an image to identify which Indian script (Devanagari, Bengali, Tamil, Telugu, etc.) is present. Returns the detected script family, a recommended language code, and a confidence score. Uses Unicode range analysis on recognized text characters.",
  category: "ocr",
  subcategory: "indic",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["ocr", "indic", "script-detection", "hindi", "bengali", "tamil", "devanagari", "indian-languages"],
  icon: "Languages",
  color: "#f97316",
  parameters: [
    { name: "image", type: "string", description: "Image data URL or file path to analyze", required: true },
  ],
  capabilities: [
    {
      name: "script-detection",
      description: "Detect Indian scripts from image content",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 8500,
  rating: 4.6,
  ratingCount: 187,
  updatedAt: "2026-08-25",
  slmFriendly: true,
};

export const INDIC_OCR_RECOGNIZE_MANIFEST: ToolManifest = {
  id: "ocr.indic.recognize",
  name: "Indic Text Recognition",
  description: "Recognize text in Indian languages from images",
  longDescription:
    "Runs multi-script OCR on an image using tesseract.js with language-specific traineddata files. Supports auto language detection, explicit language selection, predefined profiles for common mixed-script documents (e.g., Hindi+English), and custom language combinations. Returns line-level text with bounding boxes and confidence scores.",
  category: "ocr",
  subcategory: "indic",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["ocr", "indic", "text-recognition", "hindi", "bengali", "tamil", "telugu", "multi-language"],
  icon: "ScanText",
  color: "#f97316",
  parameters: [
    { name: "image", type: "string", description: "Image data URL or file path to OCR", required: true },
    {
      name: "language",
      type: "enum",
      description: "Target language code or 'auto' for detection",
      required: false,
      default: "auto",
      enum: [
        "auto", "hin", "ben", "tam", "tel", "guj", "kan", "mal",
        "pan", "ori", "mar", "asm", "san", "nep", "eng",
      ],
    },
    {
      name: "profile",
      type: "enum",
      description: "Pre-defined language profile for mixed-script documents",
      required: false,
      enum: [
        "hindi-english", "bengali-english", "tamil-english", "telugu-english",
        "hindi-marathi", "all-south-indian", "devanagari-all", "indian-all",
      ],
    },
    {
      name: "additionalLanguages",
      type: "array",
      description: "Additional language codes for multi-language documents",
      required: false,
    },
  ],
  capabilities: [
    {
      name: "indic-ocr",
      description: "OCR for 13 Indian languages + English",
      requiresBrowser: true,
      requiresNetwork: true,
      offline: false,
    },
  ],
  installs: 12400,
  rating: 4.8,
  ratingCount: 312,
  updatedAt: "2026-08-25",
  slmFriendly: true,
};

export const INDIC_OCR_BATCH_MANIFEST: ToolManifest = {
  id: "ocr.indic.batch",
  name: "Indic Batch OCR",
  description: "OCR multiple images in Indian languages",
  longDescription:
    "Process a batch of images with Indic OCR. Shares the tesseract worker across images for efficiency. Returns per-image results with detected scripts and recognized text. Useful for document scanning workflows.",
  category: "ocr",
  subcategory: "indic",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["ocr", "indic", "batch", "multi-image", "document-scanning"],
  icon: "Layers",
  color: "#f97316",
  parameters: [
    { name: "images", type: "array", description: "Array of image data URLs or file paths", required: true },
    {
      name: "language",
      type: "enum",
      description: "Target language code or 'auto' for detection",
      required: false,
      default: "auto",
      enum: [
        "auto", "hin", "ben", "tam", "tel", "guj", "kan", "mal",
        "pan", "ori", "mar", "asm", "san", "nep", "eng",
      ],
    },
  ],
  capabilities: [
    {
      name: "indic-batch-ocr",
      description: "Batch OCR for Indian language documents",
      requiresBrowser: true,
      requiresNetwork: true,
      offline: false,
    },
  ],
  installs: 6800,
  rating: 4.5,
  ratingCount: 134,
  updatedAt: "2026-08-25",
  slmFriendly: true,
};

export const INDIC_OCR_POSTPROCESS_MANIFEST: ToolManifest = {
  id: "ocr.indic.postprocess",
  name: "Indic Text Normalizer",
  description: "Normalize and fix Indic OCR output text",
  longDescription:
    "Post-processes recognized Indic text: Unicode NFC normalization, fixes common OCR artifacts in Devanagari conjuncts, removes stray diacritics, detects mixed scripts, and cleans up whitespace. Essential for downstream processing of Indic OCR results.",
  category: "ocr",
  subcategory: "indic",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["ocr", "indic", "normalization", "unicode", "post-processing", "devanagari"],
  icon: "Sparkles",
  color: "#f97316",
  parameters: [
    { name: "text", type: "string", description: "OCR output text to normalize", required: true },
    {
      name: "scriptFamily",
      type: "enum",
      description: "Script family for targeted normalization",
      required: false,
      default: "auto",
      enum: [
        "auto", "devanagari", "bengali", "tamil", "telugu",
        "gujarati", "kannada", "malayalam", "gurmukhi", "odia",
      ],
    },
  ],
  capabilities: [
    {
      name: "text-normalization",
      description: "Unicode normalization for Indic scripts",
      requiresBrowser: false,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 5200,
  rating: 4.4,
  ratingCount: 98,
  updatedAt: "2026-08-25",
  slmFriendly: true,
};

/** All Indic OCR tool manifests. */
export const INDIC_OCR_TOOLS: ToolManifest[] = [
  INDIC_OCR_DETECT_MANIFEST,
  INDIC_OCR_RECOGNIZE_MANIFEST,
  INDIC_OCR_BATCH_MANIFEST,
  INDIC_OCR_POSTPROCESS_MANIFEST,
];
