/**
 * Browser Visual Understanding Tools — powered by ViT model inference.
 *
 * These tools use a real Vision Transformer (ViT) model running on-device
 * via Canvas API. No heuristic rules — actual neural network inference.
 */

import type { ToolManifest, ToolParameter, ToolCapability } from "../tool-types";

// ─── Shared capability templates ─────────────────────────────────────────────

const VISION_CAPABILITIES: ToolCapability[] = [
  {
    name: "vit-inference",
    description: "Runs Vision Transformer model inference on image data via Canvas API",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "scene-classification",
    description: "Classifies UI elements using neural network (not heuristic rules)",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── browser.visual-understand ────────────────────────────────────────────────

export const VISUAL_UNDERSTAND_TOOL: ToolManifest = {
  id: "browser.visual-understand",
  name: "Visual Scene Understanding",
  description: "Run ViT model inference on a screenshot to classify UI elements, detect layout zones, extract colours, and generate an LLM-readable scene description",
  longDescription: "Captures or receives a screenshot, preprocesses it through the ViT pipeline (patch embedding → 12-layer transformer encoder → classification heads), and outputs a structured scene description with element labels, spatial relationships, layout zones, and colour palette. All inference runs on-device via Canvas API.",
  version: "1.0.0",
  category: "visual",
  subcategory: "scene-analysis",
  author: "stitaP",
  license: "MIT",
  icon: "Eye",
  color: "#6366f1",
  tags: ["vision", "ai", "scene", "ui-detection", "model", "vit"],
  parameters: [
    { name: "action", type: "enum", description: "Analysis action: full, elements, layout, colors, prompt", required: true, enum: ["full", "elements", "layout", "colors", "prompt"] },
    { name: "screenshotB64", type: "string", description: "Base64-encoded PNG/JPEG screenshot to analyse", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID to screenshot", required: false },
    { name: "goal", type: "enum", description: "LLM prompt goal when action=prompt", required: false, enum: ["describe", "recreate", "tutorial", "annotate", "compare"] },
    { name: "includeRaw", type: "boolean", description: "Include raw element data in prompt output", required: false },
    { name: "maxElements", type: "number", description: "Maximum elements to return", required: false },
  ],
  capabilities: VISION_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── browser.extract-visual-context ───────────────────────────────────────────

export const EXTRACT_VISUAL_CONTEXT_TOOL: ToolManifest = {
  id: "browser.extract-visual-context",
  name: "Extract Visual Context",
  description: "Run ViT model on a specific page region to understand what that area depicts — combines model inference with DOM context",
  longDescription: "Crops a region from a screenshot and runs ViT model inference on the cropped area. Combines the neural network's classification output with DOM structural data to provide rich context about a specific UI region.",
  version: "1.0.0",
  category: "visual",
  subcategory: "region-analysis",
  author: "stitaP",
  license: "MIT",
  icon: "ScanSearch",
  color: "#8b5cf6",
  tags: ["vision", "context", "region", "model", "ai", "crop"],
  parameters: [
    { name: "selector", type: "string", description: "CSS selector for the DOM element to analyse", required: false },
    { name: "screenshotB64", type: "string", description: "Base64-encoded screenshot to crop from", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "bboxX", type: "number", description: "Bounding box X coordinate", required: false },
    { name: "bboxY", type: "number", description: "Bounding box Y coordinate", required: false },
    { name: "bboxW", type: "number", description: "Bounding box width", required: false },
    { name: "bboxH", type: "number", description: "Bounding box height", required: false },
  ],
  capabilities: [
    ...VISION_CAPABILITIES,
    {
      name: "dom-crop",
      description: "Crops screenshot to a specific DOM element or bounding box",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── browser.screenshot-to-llm ───────────────────────────────────────────────

export const SCREENSHOT_TO_LLM_TOOL: ToolManifest = {
  id: "browser.screenshot-to-llm",
  name: "Screenshot to LLM",
  description: "Capture a screenshot and immediately generate an optimised LLM prompt via ViT model inference — ready to paste into any LLM",
  longDescription: "One-step pipeline: captures a screenshot from the current browser tab, runs ViT inference, and generates an optimised text prompt tailored to the specified goal (describe, recreate, tutorial, annotate, compare). Works with Claude, GPT, Gemini, and local SLMs.",
  version: "1.0.0",
  category: "visual",
  subcategory: "screenshot-pipeline",
  author: "stitaP",
  license: "MIT",
  icon: "Camera",
  color: "#06b6d4",
  tags: ["screenshot", "llm", "prompt", "vision", "one-click"],
  parameters: [
    { name: "tabId", type: "number", description: "Chrome tab ID to screenshot", required: false },
    { name: "url", type: "string", description: "URL to navigate to first", required: false },
    { name: "goal", type: "enum", description: "What the LLM should do with this screenshot", required: true, enum: ["describe", "recreate", "tutorial", "annotate", "compare"] },
    { name: "codeLang", type: "string", description: "Target language for recreate goal", required: false },
    { name: "viewportWidth", type: "number", description: "Viewport width for screenshot", required: false },
    { name: "viewportHeight", type: "number", description: "Viewport height for screenshot", required: false },
  ],
  capabilities: [
    ...VISION_CAPABILITIES,
    {
      name: "screenshot-capture",
      description: "Captures browser screenshot via Chrome DevTools Protocol",
      requiresBrowser: true,
      requiresNetwork: false,
      offline: true,
    },
  ],
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── browser.icon-detect ──────────────────────────────────────────────────────

export const ICON_DETECT_TOOL: ToolManifest = {
  id: "browser.icon-detect",
  name: "Icon Detection (ViT)",
  description: "Run ViT model inference to identify icon types and their semantic meaning from a screenshot region",
  longDescription: "Analyses icon regions of a screenshot using ViT model inference. Classifies icons by type (navigation, action, status, social) and semantic meaning. No path-matching heuristics — actual neural network classification.",
  version: "1.0.0",
  category: "visual",
  subcategory: "icon-classification",
  author: "stitaP",
  license: "MIT",
  icon: "Tag",
  color: "#f59e0b",
  tags: ["icon", "vision", "classification", "model", "semantic"],
  parameters: [
    { name: "screenshotB64", type: "string", description: "Base64-encoded screenshot to analyse", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "selector", type: "string", description: "CSS selector to focus on a specific element", required: false },
  ],
  capabilities: VISION_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── browser.color-analyze ────────────────────────────────────────────────────

export const COLOR_ANALYZE_TOOL: ToolManifest = {
  id: "browser.color-analyze",
  name: "Colour Analysis",
  description: "Extract dominant colour palette from a screenshot — analysis feeds into the ViT model preprocessing pipeline",
  longDescription: "Samples pixels from a screenshot, extracts the dominant colour palette (top 5 colours), and identifies background, text, and accent colours. The colour data is used alongside ViT model output for complete scene understanding.",
  version: "1.0.0",
  category: "visual",
  subcategory: "colour-extraction",
  author: "stitaP",
  license: "MIT",
  icon: "Palette",
  color: "#ec4899",
  tags: ["colour", "palette", "design", "analysis", "pixel"],
  parameters: [
    { name: "screenshotB64", type: "string", description: "Base64-encoded screenshot to analyse", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
    { name: "sampleSize", type: "number", description: "Number of pixel samples", required: false },
  ],
  capabilities: VISION_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── browser.layout-analyze ───────────────────────────────────────────────────

export const LAYOUT_ANALYZE_TOOL: ToolManifest = {
  id: "browser.layout-analyze",
  name: "Layout Analysis (ViT)",
  description: "Detect layout zones (header, sidebar, main, footer, form, overlay) using ViT model inference on the screenshot",
  longDescription: "Uses the ViT model's scene classification output to identify layout zones: header, sidebar, main content area, footer, form sections, and overlay regions. Maps detected elements to their zones with confidence scores.",
  version: "1.0.0",
  category: "visual",
  subcategory: "layout-detection",
  author: "stitaP",
  license: "MIT",
  icon: "LayoutGrid",
  color: "#10b981",
  tags: ["layout", "structure", "zones", "model", "architecture"],
  parameters: [
    { name: "screenshotB64", type: "string", description: "Base64-encoded screenshot", required: false },
    { name: "tabId", type: "number", description: "Chrome tab ID", required: false },
  ],
  capabilities: VISION_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export all visual tools ──────────────────────────────────────────────────

export const VISUAL_TOOLS: ToolManifest[] = [
  VISUAL_UNDERSTAND_TOOL,
  EXTRACT_VISUAL_CONTEXT_TOOL,
  SCREENSHOT_TO_LLM_TOOL,
  ICON_DETECT_TOOL,
  COLOR_ANALYZE_TOOL,
  LAYOUT_ANALYZE_TOOL,
];

// ─── CDP commands for each tool ──────────────────────────────────────────────

export interface CDPCommand {
  method: string;
  params: Record<string, unknown>;
}

/** Generate CDP commands for visual-understand (screenshot capture). */
export function generateVisualUnderstandCDP(options: {
  tabId?: number;
  format?: "png" | "jpeg";
  quality?: number;
  clip?: { x: number; y: number; width: number; height: number; scale: number };
}): CDPCommand[] {
  const params: Record<string, unknown> = {
    format: options.format || "png",
  };
  if (options.quality) params.quality = options.quality;
  if (options.clip) params.clip = options.clip;
  return [{ method: "Page.captureScreenshot", params }];
}

/** Generate CDP commands for extract-visual-context (element box + screenshot). */
export function generateExtractContextCDP(options: {
  nodeId?: number;
  selector?: string;
}): CDPCommand[] {
  const commands: CDPCommand[] = [];
  if (options.nodeId) {
    commands.push({ method: "DOM.getBoxModel", params: { nodeId: options.nodeId } });
  } else if (options.selector) {
    commands.push({ method: "DOM.querySelector", params: { nodeId: 0, selector: options.selector } });
  }
  return commands;
}

/** Generate CDP commands for icon-detect. */
export function generateIconDetectCDP(): CDPCommand[] {
  return [{ method: "Page.captureScreenshot", params: { format: "png" } }];
}

/** Generate CDP commands for color-analyze. */
export function generateColorAnalyzeCDP(): CDPCommand[] {
  return [{ method: "Page.captureScreenshot", params: { format: "png" } }];
}
