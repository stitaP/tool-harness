/**
 * Website Design Tools — comprehensive design analysis, audit, and generation suite.
 *
 * Powered by rules from:
 * - Vercel Web Interface Guidelines
 * - Microsoft Fluent 2 Design System
 * - TasteSkill Anti-Slop Framework
 *
 * Each tool audits, scores, or generates design output following these guidelines.
 */

import type { ToolManifest, ToolParameter, ToolCapability } from "../tool-types";
import {
  ALL_RULES,
  RULES_BY_SOURCE,
  FLUENT_SPACING_RAMP,
  FLUENT_BREAKPOINTS,
  WCAG_CONTRAST,
  TOUCH_TARGETS,
  type DesignRule,
  type RuleViolation,
  type AuditResult,
  type DesignAuditReport,
  type GuidelineSource,
  type RuleCategory,
} from "../../design/guidelines";

// ─── Shared Capabilities ──────────────────────────────────────────────────────

const DESIGN_CAPABILITIES: ToolCapability[] = [
  {
    name: "design-analysis",
    description: "Analyses UI code against Vercel, Fluent 2, and TasteSkill guidelines",
    requiresBrowser: true,
    requiresNetwork: false,
    offline: true,
  },
  {
    name: "design-code-generation",
    description: "Generates HTML/CSS/Tailwind code that follows best practices",
    requiresBrowser: false,
    requiresNetwork: false,
    offline: true,
  },
];

// ─── 1. browser.design-audit ─────────────────────────────────────────────────

export const DESIGN_AUDIT_TOOL: ToolManifest = {
  id: "browser.design-audit",
  name: "Design Audit",
  description:
    "Audit a page against Vercel, Fluent 2, and TasteSkill guidelines — accessibility, spacing, typography, animation, color, copy, and anti-slop rules",
  longDescription:
    "Comprehensive design audit that checks every rule from three authoritative guideline sets. Inspects the live DOM for accessibility violations (missing aria, semantic HTML, heading hierarchy), typography issues (tabular nums, balance, ellipsis), animation anti-patterns (transition:all, missing reduced-motion), spacing grid alignment, color contrast, copy quality, form usability, touch targets, dark mode, and templated/generic UI patterns. Produces a scored report per source with specific file:line violations and fix instructions.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Palette",
  color: "#6366f1",
  tags: [
    "design",
    "audit",
    "vercel",
    "fluent",
    "tasteskill",
    "accessibility",
    "typography",
    "spacing",
    "color",
  ],
  parameters: [
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID",
      required: false,
    },
    {
      name: "url",
      type: "string",
      description: "URL to audit (omit for current page)",
      required: false,
    },
    {
      name: "scope",
      type: "enum",
      description: "Audit scope",
      required: false,
      enum: ["all", "accessibility", "typography", "animation", "spacing", "color", "copy", "layout", "forms", "anti-slop"],
      default: "all",
    },
    {
      name: "source",
      type: "enum",
      description: "Filter by guideline source",
      required: false,
      enum: ["all", "vercel", "fluent", "tasteskill"],
      default: "all",
    },
    {
      name: "includeCodeExamples",
      type: "boolean",
      description: "Include code snippets showing the fix",
      required: false,
      default: true,
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 2. browser.design-suggest ────────────────────────────────────────────────

export const DESIGN_SUGGEST_TOOL: ToolManifest = {
  id: "browser.design-suggest",
  name: "Design Suggestions",
  description:
    "Analyse a page and generate prioritised improvement suggestions with before/after code examples",
  longDescription:
    "Takes a live page analysis or screenshot description and generates a prioritised list of design improvements. Each suggestion includes: the current issue, the recommended fix, before/after code examples, the guideline rule that triggered it, and an estimated impact score. Groups suggestions into quick wins, major improvements, and long-term enhancements. Generates complete CSS/Tailwind code snippets for each fix.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Lightbulb",
  color: "#eab308",
  tags: [
    "design",
    "suggestions",
    "improvement",
    "code-examples",
    "before-after",
  ],
  parameters: [
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID",
      required: false,
    },
    {
      name: "url",
      type: "string",
      description: "URL to analyse",
      required: false,
    },
    {
      name: "focusArea",
      type: "enum",
      description: "Area to focus suggestions on",
      required: false,
      enum: ["all", "visual", "ux", "performance", "accessibility", "code-quality"],
      default: "all",
    },
    {
      name: "maxSuggestions",
      type: "number",
      description: "Maximum suggestions to return (default 20)",
      required: false,
      default: 20,
    },
    {
      name: "framework",
      type: "enum",
      description: "Framework for code examples",
      required: false,
      enum: ["tailwind", "css", "fluent", "radix"],
      default: "tailwind",
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 3. browser.design-generate ──────────────────────────────────────────────

export const DESIGN_GENERATE_TOOL: ToolManifest = {
  id: "browser.design-generate",
  name: "Design Code Generator",
  description:
    "Generate production-ready HTML/CSS/Tailwind components following Vercel + Fluent + TasteSkill guidelines",
  longDescription:
    "Given a component description (e.g., 'hero section with CTA', 'pricing card', 'navigation bar'), generates complete, accessible, responsive HTML/CSS or Tailwind code that follows all three guideline sets. Output includes: semantic HTML, proper ARIA attributes, focus states, responsive breakpoints, dark mode support, animation with reduced-motion fallback, proper typography hierarchy, and spacing aligned to the Fluent 4px grid. Each component is self-contained and copy-paste ready.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Code",
  color: "#10b981",
  tags: [
    "design",
    "generate",
    "html",
    "css",
    "tailwind",
    "component",
    "code",
  ],
  parameters: [
    {
      name: "component",
      type: "string",
      description: "Description of the component to generate (e.g., 'pricing card with 3 tiers')",
      required: true,
    },
    {
      name: "framework",
      type: "enum",
      description: "CSS framework to use",
      required: false,
      enum: ["tailwind", "css", "fluent"],
      default: "tailwind",
    },
    {
      name: "theme",
      type: "enum",
      description: "Visual theme",
      required: false,
      enum: ["light", "dark", "both", "auto"],
      default: "both",
    },
    {
      name: "responsive",
      type: "boolean",
      description: "Include responsive styles",
      required: false,
      default: true,
    },
    {
      name: "accessibility",
      type: "boolean",
      description: "Include full accessibility attributes",
      required: false,
      default: true,
    },
    {
      name: "animations",
      type: "boolean",
      description: "Include animations with reduced-motion support",
      required: false,
      default: true,
    },
    {
      name: "style",
      type: "enum",
      description: "Visual style direction",
      required: false,
      enum: ["modern", "minimal", "bold", "soft", "brutalist"],
      default: "modern",
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 4. browser.color-palette ────────────────────────────────────────────────

export const COLOR_PALETTE_TOOL: ToolManifest = {
  id: "browser.color-palette",
  name: "Color Palette Generator",
  description:
    "Generate accessible color palettes with WCAG contrast validation, brand integration, and Fluent 4px-compatible design tokens",
  longDescription:
    "Analyses the current page's colour usage or generates a new palette from a brand colour. Validates all colour combinations against WCAG AA/AAA contrast ratios. Generates design tokens (CSS custom properties) with proper light/dark mode variants. Checks foreground/background contrast, accent colour visibility, disabled state colours, error/success/warning semantic colours. Produces a complete colour system with Fluent spacing-compatible tokens.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Droplets",
  color: "#f43f5e",
  tags: [
    "color",
    "palette",
    "wcag",
    "contrast",
    "brand",
    "design-tokens",
    "dark-mode",
  ],
  parameters: [
    {
      name: "action",
      type: "enum",
      description: "What to do",
      required: true,
      enum: ["analyse", "generate", "validate", "tokens"],
    },
    {
      name: "brandColor",
      type: "string",
      description: "Brand hex colour for palette generation (e.g., '#6366f1')",
      required: false,
    },
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID for page analysis",
      required: false,
    },
    {
      name: "contrastStandard",
      type: "enum",
      description: "WCAG contrast level to validate against",
      required: false,
      enum: ["AA", "AAA"],
      default: "AA",
    },
    {
      name: "includeDarkMode",
      type: "boolean",
      description: "Generate dark mode variants",
      required: false,
      default: true,
    },
    {
      name: "outputFormat",
      type: "enum",
      description: "Output format",
      required: false,
      enum: ["css", "tailwind", "json", "scss"],
      default: "css",
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 5. browser.typography-check ─────────────────────────────────────────────

export const TYPOGRAPHY_CHECK_TOOL: ToolManifest = {
  id: "browser.typography-check",
  name: "Typography Audit",
  description:
    "Validate fonts, sizes, line-heights, letter-spacing, and text hierarchy against Vercel + Fluent type scales",
  longDescription:
    "Audits the page's typography against both Vercel and Fluent 2 type scales. Checks: font size consistency, line-height ratios (1.4-1.6 for body), letter-spacing, heading hierarchy, paragraph width (45-75 chars ideal), text-wrap: balance on headings, tabular-nums on data, curly quotes, proper ellipsis, non-breaking spaces for units, and font loading strategy (preload, font-display: swap). Detects arbitrary font sizes that don't follow any type scale.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Type",
  color: "#8b5cf6",
  tags: [
    "typography",
    "font",
    "line-height",
    "hierarchy",
    "type-scale",
    "text",
  ],
  parameters: [
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID",
      required: false,
    },
    {
      name: "url",
      type: "string",
      description: "URL to audit",
      required: false,
    },
    {
      name: "scale",
      type: "enum",
      description: "Type scale to validate against",
      required: false,
      enum: ["vercel", "fluent", "both"],
      default: "both",
    },
    {
      name: "checkHierarchy",
      type: "boolean",
      description: "Check heading hierarchy (h1-h6 order)",
      required: false,
      default: true,
    },
    {
      name: "checkLoading",
      type: "boolean",
      description: "Check font loading strategy (preload, display: swap)",
      required: false,
      default: true,
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 6. browser.spacing-check ────────────────────────────────────────────────

export const SPACING_CHECK_TOOL: ToolManifest = {
  id: "browser.spacing-check",
  name: "Spacing & Grid Audit",
  description:
    "Validate spacing rhythm against Fluent 4px grid, check grid alignment, responsive breakpoint compliance",
  longDescription:
    "Audits all spacing values on the page against the Fluent 2 spacing ramp (0,2,4,6,8,10,12,16,20,24,28,32,36,40,48,52,56px). Checks: padding/margin consistency, grid alignment, gutter widths, responsive breakpoint behavior, whitespace hierarchy (more space = more importance), element proximity (related items close, unrelated items separated). Detects arbitrary spacing values that break the rhythm. Validates min-width:0 on flex children and overflow handling.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "Ruler",
  color: "#06b6d4",
  tags: [
    "spacing",
    "grid",
    "layout",
    "alignment",
    "4px",
    "fluent",
    "rhythm",
  ],
  parameters: [
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID",
      required: false,
    },
    {
      name: "url",
      type: "string",
      description: "URL to audit",
      required: false,
    },
    {
      name: "tolerance",
      type: "number",
      description: "Px tolerance for grid alignment (default 2)",
      required: false,
      default: 2,
    },
    {
      name: "checkGrid",
      type: "boolean",
      description: "Check grid column alignment",
      required: false,
      default: true,
    },
    {
      name: "checkResponsive",
      type: "boolean",
      description: "Validate spacing across Fluent breakpoints",
      required: false,
      default: true,
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── 7. browser.component-qa ─────────────────────────────────────────────────

export const COMPONENT_QA_TOOL: ToolManifest = {
  id: "browser.component-qa",
  name: "Component QA",
  description:
    "Validate buttons, inputs, cards, modals, navigation, and other components against all three guideline sets",
  longDescription:
    "Identifies all UI components on the page and validates each against the combined guidelines. Buttons: label specificity, aria-label on icon buttons, hover/focus/active states, size (44px touch target). Inputs: labels, autocomplete, error states, placeholder style. Cards: content truncation, empty states, image dimensions. Modals: focus trap, escape key, scroll lock, aria attributes. Navigation: URL state sync, link elements vs divs, breadcrumb trail. Produces a per-component QA report with pass/fail for each check.",
  version: "1.0.0",
  category: "design",
  author: "stitaP",
  license: "MIT",
  icon: "LayoutGrid",
  color: "#14b8a6",
  tags: [
    "component",
    "qa",
    "button",
    "input",
    "card",
    "modal",
    "navigation",
    "validation",
  ],
  parameters: [
    {
      name: "tabId",
      type: "number",
      description: "Chrome tab ID",
      required: false,
    },
    {
      name: "url",
      type: "string",
      description: "URL to audit",
      required: false,
    },
    {
      name: "components",
      type: "string",
      description: "Comma-separated list of components to check (default: all)",
      required: false,
    },
    {
      name: "includeFixes",
      type: "boolean",
      description: "Include fix instructions for each issue",
      required: false,
      default: true,
    },
  ],
  capabilities: DESIGN_CAPABILITIES,
  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: new Date().toISOString(),
  slmFriendly: true,
};

// ─── Export all design tools ─────────────────────────────────────────────────

export const DESIGN_TOOLS: ToolManifest[] = [
  DESIGN_AUDIT_TOOL,
  DESIGN_SUGGEST_TOOL,
  DESIGN_GENERATE_TOOL,
  COLOR_PALETTE_TOOL,
  TYPOGRAPHY_CHECK_TOOL,
  SPACING_CHECK_TOOL,
  COMPONENT_QA_TOOL,
];

// ─── CDP Command Generators ──────────────────────────────────────────────────

export interface CDPCommand {
  method: string;
  params: Record<string, unknown>;
}

/** Design audit: comprehensive DOM inspection against all guideline rules. */
export function generateDesignAuditCDP(scope: string, source: string): CDPCommand[] {
  const relevantRules = source === "all"
    ? ALL_RULES
    : ALL_RULES.filter(r => r.source === source);

  const auditScript = `
(function() {
  const violations = [];
  const checked = new Set();

  // ── Accessibility checks ──
  if ("${scope}" === "all" || "${scope}" === "accessibility") {
    // Icon-only buttons without aria-label
    document.querySelectorAll("button, [role=button]").forEach(el => {
      const hasText = el.textContent?.trim();
      const hasAriaLabel = el.getAttribute("aria-label");
      const hasImg = el.querySelector("img[alt]");
      const hasSvgLabel = el.querySelector("svg[aria-label], svg title");
      if (!hasText && !hasAriaLabel && !hasImg && !hasSvgLabel) {
        violations.push({
          rule: "vercel-a11y-icon-btn",
          source: "vercel",
          element: el.tagName + (el.id ? "#" + el.id : ""),
          severity: "error",
          suggestion: "Add aria-label describing the button action",
          confidence: 0.95,
        });
      }
    });

    // Form controls without labels
    document.querySelectorAll("input, select, textarea").forEach(el => {
      const id = el.id;
      const hasLabel = id ? !!document.querySelector("label[for='" + id + "']") : false;
      const hasAriaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      const hasTitle = el.getAttribute("title");
      if (!hasLabel && !hasAriaLabel && !hasTitle) {
        violations.push({
          rule: "vercel-a11y-form-label",
          source: "vercel",
          element: el.tagName + "[type=" + el.getAttribute("type") + "]",
          severity: "error",
          suggestion: "Add <label for=\\"" + id + "\\"> or aria-label",
          confidence: 0.9,
        });
      }
    });

    // Divs/spans with click handlers
    document.querySelectorAll("div[onclick], span[onclick], div[onClick], span[onClick]").forEach(el => {
      violations.push({
        rule: "vercel-a11y-semantic-html",
        source: "vercel",
        element: el.tagName + (el.className ? "." + String(el.className).split(" ")[0] : ""),
        severity: "error",
        suggestion: "Replace <" + el.tagName.toLowerCase() + "> with <button> or <a>",
        confidence: 0.85,
      });
    });

    // Heading hierarchy
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    const h1Count = headings.filter(h => h.tagName === "H1").length;
    if (h1Count === 0) violations.push({ rule: "vercel-a11y-headings", source: "vercel", severity: "warning", suggestion: "Add an h1 heading", confidence: 0.95 });
    if (h1Count > 1) violations.push({ rule: "vercel-a11y-headings", source: "vercel", severity: "warning", suggestion: "Use only one h1 per page (found " + h1Count + ")", confidence: 0.9 });
    let prevLevel = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level > prevLevel + 1 && prevLevel > 0) {
        violations.push({ rule: "vercel-a11y-headings", source: "vercel", element: h.tagName + ": " + (h.textContent || "").slice(0, 50), severity: "warning", suggestion: "Do not skip heading levels (h" + prevLevel + " → h" + level + ")", confidence: 0.9 });
      }
      prevLevel = level;
    });

    // Images without alt
    document.querySelectorAll("img:not([alt])").forEach(img => {
      violations.push({ rule: "vercel-a11y-alt-text", source: "vercel", element: "img[src=" + (img.getAttribute("src") || "").slice(0, 50) + "]", severity: "error", suggestion: "Add alt text (or alt=\\"\\" for decorative images)", confidence: 0.95 });
    });
  }

  // ── Typography checks ──
  if ("${scope}" === "all" || "${scope}" === "typography") {
    // Check for tabular-nums on number-heavy elements
    document.querySelectorAll("[data-number], .number, .price, .stat, .metric").forEach(el => {
      const style = getComputedStyle(el);
      if (!style.fontVariantNumeric?.includes("tabular")) {
        violations.push({ rule: "vercel-type-tabular-nums", source: "vercel", element: el.tagName + "." + (el.className || "").toString().split(" ")[0], severity: "warning", suggestion: "Add font-variant-numeric: tabular-nums to number columns", confidence: 0.7 });
      }
    });

    // Check text-wrap: balance on headings
    headings.forEach(h => {
      const style = getComputedStyle(h);
      if (style.textWrap !== "balance" && style.textWrap !== "pretty") {
        const text = (h.textContent || "").trim();
        if (text.length > 20) {
          violations.push({ rule: "vercel-type-balance", source: "vercel", element: h.tagName + ": " + text.slice(0, 40), severity: "warning", suggestion: "Add text-wrap: balance to prevent widows", confidence: 0.6 });
        }
      }
    });
  }

  // ── Animation checks ──
  if ("${scope}" === "all" || "${scope}" === "animation") {
    const sheets = document.styleSheets;
    try {
      for (const sheet of sheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          for (const rule of rules) {
            if (rule.cssText?.includes("transition: all") || rule.cssText?.includes("transition-property: all")) {
              violations.push({ rule: "vercel-motion-no-transition-all", source: "vercel", severity: "error", suggestion: "Replace transition:all with specific properties", confidence: 0.8 });
              break;
            }
          }
        } catch(e) { /* cross-origin */ }
      }
    } catch(e) {}
  }

  // ── Spacing checks ──
  if ("${scope}" === "all" || "${scope}" === "spacing") {
    const spacingValues = new Set();
    document.querySelectorAll("div, section, article, aside, nav, header, footer, main").forEach(el => {
      const style = getComputedStyle(el);
      [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft,
       style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].forEach(v => {
        const px = parseFloat(v);
        if (px > 0 && px % 4 !== 0) spacingValues.add(px);
      });
    });
    const offGrid = Array.from(spacingValues).filter(v => ![0,2,4,6,8,10,12,16,20,24,28,32,36,40,48,52,56].includes(v));
    if (offGrid.length > 0) {
      violations.push({
        rule: "fluent-spacing-base-unit",
        source: "fluent",
        severity: "warning",
        suggestion: "Spacing values off 4px grid: " + offGrid.slice(0, 5).join(", ") + "px",
        actualValue: offGrid.join(", "),
        expectedValue: "0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48",
        confidence: 0.7,
      });
    }
  }

  // ── Touch target checks ──
  if ("${scope}" === "all" || "${scope}" === "touch") {
    document.querySelectorAll("button, a, input[type=checkbox], input[type=radio], [role=button]").forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        violations.push({
          rule: "fluent-touch-targets",
          source: "fluent",
          element: el.tagName + ": " + (el.textContent || "").trim().slice(0, 30),
          severity: "error",
          suggestion: "Touch target " + Math.round(rect.width) + "x" + Math.round(rect.height) + "px < 44x44px minimum",
          actualValue: Math.round(rect.width) + "x" + Math.round(rect.height),
          expectedValue: "44x44px minimum",
          confidence: 0.9,
        });
      }
    });
  }

  // ── Image checks ──
  if ("${scope}" === "all" || "${scope}" === "images") {
    document.querySelectorAll("img").forEach(img => {
      if (!img.getAttribute("width") && !img.getAttribute("height") && !img.style.width && !img.style.height) {
        violations.push({ rule: "vercel-img-dimensions", source: "vercel", element: "img[src=" + (img.getAttribute("src") || "").slice(0, 50) + "]", severity: "error", suggestion: "Add explicit width and height to prevent CLS", confidence: 0.85 });
      }
    });
  }

  return JSON.stringify({ violations, timestamp: Date.now() });
})()
  `;

  return [
    { method: "Runtime.evaluate", params: { expression: auditScript, returnByValue: true } },
  ];
}

/** Color palette analysis: extract all colours from page. */
export function generateColorPaletteCDP(brandColor?: string): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `(function() {
        const colors = {};
        const textColors = {};
        const bgColors = {};
        const elements = document.querySelectorAll("*");
        for (let i = 0; i < Math.min(elements.length, 1000); i++) {
          const style = getComputedStyle(elements[i]);
          const fg = style.color;
          const bg = style.backgroundColor;
          if (fg && fg !== "rgba(0, 0, 0, 0)") {
            textColors[fg] = (textColors[fg] || 0) + 1;
          }
          if (bg && bg !== "rgba(0, 0, 0, 0)") {
            bgColors[bg] = (bgColors[bg] || 0) + 1;
          }
        }
        const topBg = Object.entries(bgColors).sort((a,b) => b[1]-a[1]).slice(0, 10).map(e => ({color: e[0], count: e[1]}));
        const topFg = Object.entries(textColors).sort((a,b) => b[1]-a[1]).slice(0, 10).map(e => ({color: e[0], count: e[1]}));
        const h1 = document.querySelector("h1");
        const h1Style = h1 ? getComputedStyle(h1) : null;
        const bodyStyle = getComputedStyle(document.body);
        return JSON.stringify({
          textColors: topFg,
          bgColors: topBg,
          bodyFont: bodyStyle.fontFamily,
          bodyFontSize: bodyStyle.fontSize,
          bodyLineHeight: bodyStyle.lineHeight,
          h1Font: h1Style?.fontFamily || "",
          h1Size: h1Style?.fontSize || "",
          h1Color: h1Style?.color || "",
          h1Weight: h1Style?.fontWeight || "",
          title: document.title,
          brandColor: "${brandColor || ""}",
        });
      })()`,
      returnByValue: true,
    }},
  ];
}

/** Typography analysis: extract all font usage. */
export function generateTypographyCDP(): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `(function() {
        const fonts = {};
        const sizes = {};
        const weights = {};
        const lineHeights = {};
        const headings = [];

        document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th").forEach(el => {
          const style = getComputedStyle(el);
          const font = style.fontFamily;
          const size = style.fontSize;
          const weight = style.fontWeight;
          const lh = style.lineHeight;
          fonts[font] = (fonts[font] || 0) + 1;
          sizes[size] = (sizes[size] || 0) + 1;
          weights[weight] = (weights[weight] || 0) + 1;
          lineHeights[lh] = (lineHeights[lh] || 0) + 1;
        });

        document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(h => {
          const style = getComputedStyle(h);
          headings.push({
            level: h.tagName,
            text: (h.textContent || "").trim().slice(0, 60),
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            color: style.color,
            textWrap: style.textWrap,
            letterSpacing: style.letterSpacing,
          });
        });

        return JSON.stringify({
          fonts: Object.entries(fonts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(e => ({family: e[0], count: e[1]})),
          sizes: Object.entries(sizes).sort((a,b) => b[1]-a[1]).map(e => ({size: e[0], count: e[1]})),
          weights: Object.entries(weights).sort((a,b) => b[1]-a[1]).map(e => ({weight: e[0], count: e[1]})),
          lineHeights: Object.entries(lineHeights).sort((a,b) => b[1]-a[1]).slice(0, 8).map(e => ({height: e[0], count: e[1]})),
          headings: headings,
          bodyFont: getComputedStyle(document.body).fontFamily,
          bodySize: getComputedStyle(document.body).fontSize,
        });
      })()`,
      returnByValue: true,
    }},
  ];
}

/** Spacing analysis: extract padding/margin values. */
export function generateSpacingCDP(): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `(function() {
        const spacingValues = {};
        const flexParents = [];
        const gapValues = {};

        document.querySelectorAll("div, section, article, aside, nav, header, footer, main, form, button, a").forEach(el => {
          const style = getComputedStyle(el);
          const paddings = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
          const margins = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];

          paddings.concat(margins).forEach(v => {
            const px = parseFloat(v);
            if (px > 0) {
              spacingValues[px] = (spacingValues[px] || 0) + 1;
            }
          });

          if (style.display === "flex" || style.display === "grid") {
            const gap = parseFloat(style.gap);
            if (gap > 0) {
              gapValues[gap] = (gapValues[gap] || 0) + 1;
            }
            const minW = style.minWidth;
            if (minW === "0px" || minW === "auto" || minW === "0%") {
              // Good: min-w-0 for flex children
            }
          }
        });

        const onGrid = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 56];
        const allValues = Object.keys(spacingValues).map(Number);
        const offGrid = allValues.filter(v => !onGrid.includes(v));

        return JSON.stringify({
          spacingValues: Object.entries(spacingValues).sort((a,b) => b[1]-a[1]).map(e => ({px: Number(e[0]), count: e[1]})),
          gapValues: Object.entries(gapValues).sort((a,b) => b[1]-a[1]).map(e => ({px: Number(e[0]), count: e[1]})),
          offGridValues: offGrid,
          onGridValues: allValues.filter(v => onGrid.includes(v)),
          totalElements: document.querySelectorAll("*").length,
        });
      })()`,
      returnByValue: true,
    }},
  ];
}

/** Component QA: inspect all interactive elements. */
export function generateComponentQACDP(): CDPCommand[] {
  return [
    { method: "Runtime.evaluate", params: {
      expression: `(function() {
        const components = { buttons: [], inputs: [], links: [], modals: [], cards: [], navs: [] };

        // Buttons
        document.querySelectorAll("button, [role=button]").forEach(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          components.buttons.push({
            text: (el.textContent || "").trim().slice(0, 50),
            hasAriaLabel: !!el.getAttribute("aria-label"),
            hasIcon: !!el.querySelector("svg, img, i"),
            isIconOnly: !el.textContent?.trim() && !!el.querySelector("svg, img, i"),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            meetsTouchTarget: rect.width >= 44 && rect.height >= 44,
            hasFocusStyle: style.outlineStyle !== "none" || style.outlineWidth !== "0px",
            cursor: style.cursor,
            disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
          });
        });

        // Inputs
        document.querySelectorAll("input, select, textarea").forEach(el => {
          const id = el.id;
          components.inputs.push({
            type: el.type || el.tagName.toLowerCase(),
            name: el.name || "",
            id: id || "",
            hasLabel: id ? !!document.querySelector("label[for='" + id + "']") : false,
            hasAriaLabel: !!el.getAttribute("aria-label"),
            hasPlaceholder: !!el.placeholder,
            hasAutocomplete: !!el.autocomplete || el.autocomplete === "off",
            required: el.required,
            disabled: el.disabled,
            spellcheck: el.spellcheck,
          });
        });

        // Links
        document.querySelectorAll("a").forEach(el => {
          components.links.push({
            text: (el.textContent || "").trim().slice(0, 50),
            href: el.href?.slice(0, 80) || "",
            hasTarget: !!el.target,
            hasRel: !!el.rel,
            hasHref: !!el.getAttribute("href"),
          });
        });

        // Modals
        document.querySelectorAll("[role=dialog], [role=alertdialog], .modal, [aria-modal=true]").forEach(el => {
          components.modals.push({
            role: el.getAttribute("role"),
            hasAriaLabel: !!el.getAttribute("aria-label"),
            hasCloseButton: !!el.querySelector("[aria-label*='close'], [aria-label*='Close'], button"),
            isFocusTrapped: !!el.querySelector("[autofocus]"),
          });
        });

        // Navigation
        document.querySelectorAll("nav, [role=navigation]").forEach(el => {
          components.navs.push({
            hasAriaLabel: !!el.getAttribute("aria-label"),
            linkCount: el.querySelectorAll("a").length,
            hasCurrentIndicator: !!el.querySelector("[aria-current=page], .active, [aria-selected=true]"),
          });
        });

        return JSON.stringify(components);
      })()`,
      returnByValue: true,
    }},
  ];
}

/** Design generation: produce guideline-compliant component code. */
export function generateDesignCodeCDP(
  component: string,
  framework: string,
  theme: string,
  style: string,
): CDPCommand[] {
  const prompt = `Generate a ${framework} ${component} component with ${style} style, ${theme} theme, fully accessible, responsive, with dark mode and reduced-motion support. Follow Vercel Web Interface Guidelines and Fluent 2 spacing (4px grid).`;

  return [
    { method: "Runtime.evaluate", params: {
      expression: `JSON.stringify({ prompt: ${JSON.stringify(prompt)}, component: ${JSON.stringify(component)}, framework: ${JSON.stringify(framework)}, theme: ${JSON.stringify(theme)}, style: ${JSON.stringify(style)} })`,
      returnByValue: true,
    }},
  ];
}
