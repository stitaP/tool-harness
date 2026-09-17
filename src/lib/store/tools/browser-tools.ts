/**
 * Browser Automation Tools — CDP-powered actions for website interaction
 *
 * Each tool generates Chrome DevTools Protocol commands that the capture
 * engine executes in an isolated browser worker.
 */

import type { ToolManifest, ToolExecutor, ToolInput, ToolOutput } from "../tool-types";
import { DEEP_BROWSER_TOOLS } from "./browser-inspect-tools";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const NAVIGATE_MANIFEST: ToolManifest = {
  id: "browser.navigate",
  name: "Navigate",
  description: "Navigate the browser to a URL",
  longDescription: "Sends a Page.navigate CDP command. Waits for the page to finish loading (load event) before returning. Supports timeout configuration.",
  category: "browser",
  subcategory: "navigation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["navigation", "url", "page-load", "cdp"],
  icon: "Globe",
  color: "#3b82f6",
  parameters: [
    { name: "url", type: "string", description: "Target URL to navigate to", required: true },
    { name: "timeout", type: "number", description: "Max wait for page load (ms)", required: false, default: 30000, min: 1000, max: 120000 },
    { name: "waitForSelector", type: "string", description: "CSS selector to wait for after navigation", required: false },
  ],
  capabilities: [
    { name: "navigate", description: "Navigate to any HTTP/HTTPS URL", requiresBrowser: true, requiresNetwork: true, offline: false },
  ],
  installs: 12500,
  rating: 4.8,
  ratingCount: 342,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const CLICK_MANIFEST: ToolManifest = {
  id: "browser.click",
  name: "Click",
  description: "Click an element on the page",
  longDescription: "Finds an element by CSS selector or XPath, scrolls it into view, and dispatches a click event. Supports offset clicking, double-click, and right-click.",
  category: "browser",
  subcategory: "interaction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["click", "interaction", "button", "link", "cdp"],
  icon: "MousePointer2",
  color: "#8b5cf6",
  parameters: [
    { name: "selector", type: "string", description: "CSS selector or XPath for the target element", required: true },
    { name: "clickType", type: "enum", description: "Type of click", required: false, default: "single", enum: ["single", "double", "right"] },
    { name: "offsetX", type: "number", description: "X offset from element center", required: false, default: 0 },
    { name: "offsetY", type: "number", description: "Y offset from element center", required: false, default: 0 },
    { name: "timeout", type: "number", description: "Max wait for element (ms)", required: false, default: 5000 },
  ],
  capabilities: [
    { name: "click", description: "Click any interactive element", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 11800,
  rating: 4.7,
  ratingCount: 298,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const TYPE_MANIFEST: ToolManifest = {
  id: "browser.type",
  name: "Type Text",
  description: "Type text into an input field",
  longDescription: "Focuses an input/textarea element and types text character by character. Supports clearing first, typing with delay, and keyboard shortcuts (Enter, Tab, Escape).",
  category: "browser",
  subcategory: "interaction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["type", "input", "form", "text", "cdp"],
  icon: "Type",
  color: "#06b6d4",
  parameters: [
    { name: "selector", type: "string", description: "CSS selector for the input element", required: true },
    { name: "text", type: "string", description: "Text to type", required: true },
    { name: "clear", type: "boolean", description: "Clear the field before typing", required: false, default: false },
    { name: "delay", type: "number", description: "Delay between keystrokes (ms)", required: false, default: 0 },
    { name: "pressEnter", type: "boolean", description: "Press Enter after typing", required: false, default: false },
  ],
  capabilities: [
    { name: "type", description: "Type text into any input field", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 11200,
  rating: 4.6,
  ratingCount: 287,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const SCROLL_MANIFEST: ToolManifest = {
  id: "browser.scroll",
  name: "Scroll",
  description: "Scroll the page or an element",
  longDescription: "Scrolls the page viewport or a specific element. Supports absolute position, relative delta, and scroll-to-element modes. Handles sticky headers and infinite scroll.",
  category: "browser",
  subcategory: "navigation",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["scroll", "viewport", "page", "infinite-scroll"],
  icon: "ArrowDown",
  color: "#f59e0b",
  parameters: [
    { name: "mode", type: "enum", description: "Scroll mode", required: false, default: "delta", enum: ["delta", "toElement", "toPosition", "toBottom"] },
    { name: "deltaY", type: "number", description: "Pixels to scroll (for delta mode)", required: false, default: 500 },
    { name: "selector", type: "string", description: "Element to scroll to (for toElement mode)", required: false },
    { name: "y", type: "number", description: "Y position to scroll to (for toPosition mode)", required: false },
    { name: "behavior", type: "enum", description: "Scroll behavior", required: false, default: "smooth", enum: ["smooth", "instant"] },
  ],
  capabilities: [
    { name: "scroll", description: "Scroll page viewport or elements", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 9800,
  rating: 4.5,
  ratingCount: 213,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const SCREENSHOT_MANIFEST: ToolManifest = {
  id: "browser.screenshot",
  name: "Screenshot",
  description: "Capture a screenshot of the page or element",
  longDescription: "Takes a screenshot using CDP Page.captureScreenshot. Supports viewport, full-page, element-specific, and region capture. Output as PNG, JPEG, or WebP.",
  category: "capture",
  subcategory: "screenshot",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["screenshot", "capture", "image", "png", "cdp"],
  icon: "Camera",
  color: "#10b981",
  parameters: [
    { name: "mode", type: "enum", description: "Capture mode", required: false, default: "viewport", enum: ["viewport", "fullPage", "element", "region"] },
    { name: "selector", type: "string", description: "CSS selector (for element mode)", required: false },
    { name: "region", type: "object", description: "{x, y, width, height} (for region mode)", required: false },
    { name: "format", type: "enum", description: "Output format", required: false, default: "png", enum: ["png", "jpeg", "webp"] },
    { name: "quality", type: "number", description: "JPEG/WebP quality (1-100)", required: false, default: 90, min: 1, max: 100 },
    { name: "clipToViewport", type: "boolean", description: "Clip to visible viewport", required: false, default: false },
  ],
  capabilities: [
    { name: "screenshot", description: "Capture screenshots in multiple formats", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 15600,
  rating: 4.9,
  ratingCount: 412,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const EXTRACT_MANIFEST: ToolManifest = {
  id: "browser.extract",
  name: "Extract Content",
  description: "Extract text, links, or structured data from the page",
  longDescription: "Reads the DOM and extracts content. Supports text extraction, link harvesting, table parsing, metadata extraction, and custom CSS selector queries with attribute selection.",
  category: "browser",
  subcategory: "extraction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["extract", "scrape", "text", "links", "data"],
  icon: "FileText",
  color: "#ec4899",
  parameters: [
    { name: "mode", type: "enum", description: "Extraction mode", required: false, default: "text", enum: ["text", "links", "tables", "metadata", "selector", "structured"] },
    { name: "selector", type: "string", description: "CSS selector for targeted extraction", required: false },
    { name: "attributes", type: "array", description: "Attributes to extract (for selector mode)", required: false },
    { name: "includeHidden", type: "boolean", description: "Include hidden elements", required: false, default: false },
    { name: "maxDepth", type: "number", description: "Max DOM traversal depth", required: false, default: 10 },
  ],
  capabilities: [
    { name: "extract", description: "Extract structured content from any page", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 10400,
  rating: 4.6,
  ratingCount: 265,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const WAIT_MANIFEST: ToolManifest = {
  id: "browser.wait",
  name: "Wait",
  description: "Wait for a condition before continuing",
  longDescription: "Pauses tool execution until a condition is met. Supports waiting for elements, network idle, specific text, timeout, and custom JavaScript conditions.",
  category: "browser",
  subcategory: "flow-control",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["wait", "pause", "condition", "timeout", "flow"],
  icon: "Timer",
  color: "#6366f1",
  parameters: [
    { name: "condition", type: "enum", description: "What to wait for", required: false, default: "timeout", enum: ["element", "text", "networkIdle", "timeout", "custom"] },
    { name: "selector", type: "string", description: "CSS selector (for element/text conditions)", required: false },
    { name: "text", type: "string", description: "Text to wait for (for text condition)", required: false },
    { name: "timeout", type: "number", description: "Max wait time (ms)", required: false, default: 10000 },
    { name: "expression", type: "string", description: "JavaScript expression that returns truthy (for custom condition)", required: false },
  ],
  capabilities: [
    { name: "wait", description: "Wait for arbitrary conditions", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 8900,
  rating: 4.4,
  ratingCount: 178,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const DRAG_MANIFEST: ToolManifest = {
  id: "browser.drag",
  name: "Drag & Drop",
  description: "Drag an element to a target position or element",
  longDescription: "Performs drag-and-drop between two elements or positions. Supports HTML5 drag events and mouse event simulation for frameworks that don't use native drag.",
  category: "browser",
  subcategory: "interaction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["drag", "drop", "move", "reorder", "interaction"],
  icon: "Move",
  color: "#14b8a6",
  parameters: [
    { name: "sourceSelector", type: "string", description: "CSS selector for the source element", required: true },
    { name: "targetSelector", type: "string", description: "CSS selector for the target element", required: false },
    { name: "targetX", type: "number", description: "Target X position (if no target selector)", required: false },
    { name: "targetY", type: "number", description: "Target Y position (if no target selector)", required: false },
    { name: "method", type: "enum", description: "Drag method", required: false, default: "mouse", enum: ["mouse", "native"] },
  ],
  capabilities: [
    { name: "drag", description: "Drag and drop elements", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 6200,
  rating: 4.3,
  ratingCount: 145,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

export const HOVER_MANIFEST: ToolManifest = {
  id: "browser.hover",
  name: "Hover",
  description: "Hover over an element",
  longDescription: "Moves the mouse to an element to trigger hover states, tooltips, and dropdown menus. Supports configurable delay before and after hover.",
  category: "browser",
  subcategory: "interaction",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["hover", "mouseover", "tooltip", "dropdown"],
  icon: "MousePointerClick",
  color: "#a855f7",
  parameters: [
    { name: "selector", type: "string", description: "CSS selector for the element to hover", required: true },
    { name: "delay", type: "number", description: "Delay before hover (ms)", required: false, default: 0 },
    { name: "holdDuration", type: "number", description: "How long to hold hover (ms)", required: false, default: 500 },
  ],
  capabilities: [
    { name: "hover", description: "Trigger hover states on elements", requiresBrowser: true, requiresNetwork: false, offline: true },
  ],
  installs: 7400,
  rating: 4.4,
  ratingCount: 167,
  updatedAt: "2026-08-20",
  slmFriendly: true,
};

// ─── All Browser Tool Manifests ───────────────────────────────────────────────

export const BROWSER_TOOLS: ToolManifest[] = [
  NAVIGATE_MANIFEST,
  CLICK_MANIFEST,
  TYPE_MANIFEST,
  SCROLL_MANIFEST,
  SCREENSHOT_MANIFEST,
  EXTRACT_MANIFEST,
  WAIT_MANIFEST,
  DRAG_MANIFEST,
  HOVER_MANIFEST,
  ...DEEP_BROWSER_TOOLS,
];

// ─── CDP Command Generators ───────────────────────────────────────────────────

/** Generate CDP commands for a navigate action */
export function generateNavigateCDP(input: ToolInput): unknown[] {
  const url = input.url as string;
  const timeout = (input.timeout as number) || 30000;
  const waitForSelector = input.waitForSelector as string | undefined;

  const commands: unknown[] = [
    { method: "Page.navigate", params: { url } },
    { method: "Page.loadEventFired", params: { timeout } },
  ];

  if (waitForSelector) {
    commands.push({
      method: "Runtime.evaluate",
      params: {
        expression: `new Promise((resolve) => {
          const check = () => {
            if (document.querySelector('${waitForSelector}')) resolve(true);
            else requestAnimationFrame(check);
          };
          check();
        })`,
        awaitPromise: true,
        timeout,
      },
    });
  }

  return commands;
}

/** Generate CDP commands for a click action */
export function generateClickCDP(input: ToolInput): unknown[] {
  const selector = input.selector as string;
  const clickType = (input.clickType as string) || "single";
  const offsetX = (input.offsetX as number) || 0;
  const offsetY = (input.offsetY as number) || 0;

  const typeMap: Record<string, number> = { single: 0, double: 2, right: 1 };

  return [
    {
      method: "Runtime.evaluate",
      params: {
        expression: `
          (() => {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const rect = el.getBoundingClientRect();
            return { x: rect.left + rect.width / 2 + ${offsetX}, y: rect.top + rect.height / 2 + ${offsetY} };
          })()
        `,
        returnByValue: true,
      },
    },
    { method: "Input.dispatchMouseEvent", params: { type: "mousePressed", button: clickType === "right" ? "right" : "left", clickCount: typeMap[clickType] || 1 } },
    { method: "Input.dispatchMouseEvent", params: { type: "mouseReleased", button: clickType === "right" ? "right" : "left", clickCount: typeMap[clickType] || 1 } },
  ];
}

/** Generate CDP commands for a type action */
export function generateTypeCDP(input: ToolInput): unknown[] {
  const text = input.text as string;
  const clear = input.clear as boolean;
  const delay = (input.delay as number) || 0;
  const pressEnter = input.pressEnter as boolean;

  const commands: unknown[] = [];

  if (clear) {
    commands.push(
      { method: "Input.dispatchKeyEvent", params: { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 } }, // Ctrl+A
      { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 } },
      { method: "Input.dispatchKeyEvent", params: { type: "keyDown", key: "Backspace", code: "Backspace" } },
      { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: "Backspace", code: "Backspace" } },
    );
  }

  for (const char of text) {
    commands.push(
      { method: "Input.dispatchKeyEvent", params: { type: "keyDown", text: char, key: char } },
      { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: char } },
    );
    if (delay > 0) {
      commands.push({ method: "Input.dispatchKeyEvent", params: { type: "pause", delay } });
    }
  }

  if (pressEnter) {
    commands.push(
      { method: "Input.dispatchKeyEvent", params: { type: "keyDown", key: "Enter", code: "Enter" } },
      { method: "Input.dispatchKeyEvent", params: { type: "keyUp", key: "Enter", code: "Enter" } },
    );
  }

  return commands;
}

/** Generate CDP commands for a screenshot action */
export function generateScreenshotCDP(input: ToolInput): unknown[] {
  const format = (input.format as string) || "png";
  const quality = (input.quality as number) || 90;

  return [
    {
      method: "Page.captureScreenshot",
      params: {
        format: format === "jpeg" ? "jpeg" : format === "webp" ? "webp" : "png",
        quality: format !== "png" ? quality : undefined,
      },
    },
  ];
}
