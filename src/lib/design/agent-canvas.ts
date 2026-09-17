/**
 * Agent Design Engine — programmatic Figma-style canvas for agents.
 *
 * Agents don't need a drag-and-drop UI. They need a clean API to:
 *  1. Create artboards (desktop, tablet, mobile frames)
 *  2. Add elements (rect, text, image, icon, button, card, nav, hero, grid)
 *  3. Position, size, style with Tailwind-compatible tokens
 *  4. Manage layers (group, reorder, lock, visibility)
 *  5. Export to code (React+Tailwind, HTML+CSS, SVG, Figma JSON)
 *
 * Every operation is a pure function — given a CanvasState and an action,
 * produce a new CanvasState. No DOM, no browser, runs anywhere.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

import type { IndicScript } from "./indic-typography";
import { SCRIPT_RULES, applyIndicStyle } from "./indic-typography";

export type ElementKind =
  | "rect"
  | "text"
  | "image"
  | "icon"
  | "button"
  | "input"
  | "card"
  | "nav"
  | "hero"
  | "grid"
  | "flex"
  | "divider"
  | "badge"
  | "avatar"
  | "modal"
  | "sidebar"
  | "footer"
  | "section"
  | "container"
  | "group";

export type Breakpoint = "mobile" | "tablet" | "desktop" | "wide";

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds extends Position, Size {}

export interface Style {
  /** Tailwind bg class or hex color. */
  backgroundColor?: string;
  /** Tailwind text color or hex. */
  color?: string;
  /** Font size in px or Tailwind size token (text-sm, text-base, etc). */
  fontSize?: string;
  /** Font weight. */
  fontWeight?: string;
  /** Font family. */
  fontFamily?: string;
  /** Tailwind border class or CSS border. */
  border?: string;
  /** Individual border sides. */
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
  /** Border radius in px or Tailwind token. */
  borderRadius?: string;
  /** Tailwind shadow or CSS box-shadow. */
  boxShadow?: string;
  /** Padding (CSS shorthand or Tailwind p-*). */
  padding?: string;
  /** Margin. */
  margin?: string;
  /** Opacity 0-1. */
  opacity?: number;
  /** Tailwind gradient or CSS gradient. */
  gradient?: string;
  /** Text alignment. */
  textAlign?: "left" | "center" | "right";
  /** Line height. */
  lineHeight?: string;
  /** Letter spacing. */
  letterSpacing?: string;
  /** CSS transform. */
  transform?: string;
  /** Z-index. */
  zIndex?: number;
}

export interface CanvasElement {
  id: string;
  kind: ElementKind;
  name: string;
  bounds: Bounds;
  style: Style;
  /** Script for Indic-aware typography (applies line-height, letter-spacing, font rules). */
  script?: IndicScript;
  /** Child element IDs (for containers). */
  children: string[];
  /** Content text (for text, button, input, badge). */
  text?: string;
  /** Image src (data URL or HTTP). */
  src?: string;
  /** Icon lucide name. */
  icon?: string;
  /** Link URL. */
  href?: string;
  /** Alt text for images. */
  alt?: string;
  /** Placeholder text for inputs. */
  placeholder?: string;
  /** Locked from editing. */
  locked?: boolean;
  /** Hidden from render. */
  hidden?: boolean;
  /** Responsive overrides per breakpoint. */
  responsive?: Partial<Record<Breakpoint, Partial<Bounds & Style>>>;
  /** Flexbox layout properties (for flex containers). */
  flex?: {
    direction?: "row" | "column";
    gap?: string;
    align?: "start" | "center" | "end" | "stretch";
    justify?: "start" | "center" | "end" | "between" | "around";
    wrap?: boolean;
  };
  /** Grid layout properties. */
  grid?: {
    columns: number;
    gap?: string;
    minChildWidth?: string;
  };
}

export interface Artboard {
  id: string;
  name: string;
  breakpoint: Breakpoint;
  width: number;
  height: number;
  backgroundColor: string;
  elementIds: string[];
}

export interface CanvasState {
  id: string;
  name: string;
  description: string;
  artboards: Artboard[];
  elements: Map<string, CanvasElement>;
  /** Ordered layer list (top = last). */
  layerOrder: string[];
  /** Design tokens (colors, fonts, spacing). */
  tokens: DesignTokens;
  /** Primary script for the canvas (applies Indic typography rules globally). */
  script?: IndicScript;
  createdAt: string;
  updatedAt: string;
}

export interface DesignTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  fontSizes: Record<string, string>;
  spacing: Record<string, string>;
  radii: Record<string, string>;
  shadows: Record<string, string>;
}

// ─── Default Tokens ───────────────────────────────────────────────────────────

const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    primary: "#3b82f6",
    secondary: "#8b5cf6",
    accent: "#06b6d4",
    background: "#ffffff",
    foreground: "#09090b",
    muted: "#f4f4f5",
    "muted-foreground": "#71717a",
    border: "#e4e4e7",
    destructive: "#ef4444",
    success: "#22c55e",
    warning: "#f59e0b",
  },
  fonts: {
    sans: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
    display: "Cal Sans, Inter, sans-serif",
  },
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
  },
  radii: {
    none: "0",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
  },
};

// ─── Artboard Presets ─────────────────────────────────────────────────────────

export const ARTBOARD_PRESETS: Record<Breakpoint, { width: number; height: number; name: string }> = {
  mobile: { width: 375, height: 812, name: "iPhone 14" },
  tablet: { width: 768, height: 1024, name: "iPad" },
  desktop: { width: 1440, height: 900, name: "Desktop" },
  wide: { width: 1920, height: 1080, name: "Wide Desktop" },
};

// ─── ID Generator ─────────────────────────────────────────────────────────────

let _counter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_counter).toString(36)}`;
}

// ─── Canvas Operations ────────────────────────────────────────────────────────

/** Create a new empty canvas. */
export function createCanvas(opts: {
  name?: string;
  description?: string;
  tokens?: Partial<DesignTokens>;
}): CanvasState {
  return {
    id: genId("canvas"),
    name: opts.name ?? "Untitled Design",
    description: opts.description ?? "",
    artboards: [],
    elements: new Map(),
    layerOrder: [],
    tokens: { ...DEFAULT_TOKENS, ...opts.tokens },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Add an artboard to the canvas. */
export function addArtboard(
  state: CanvasState,
  opts: {
    name?: string;
    breakpoint?: Breakpoint;
    width?: number;
    height?: number;
    backgroundColor?: string;
  },
): { state: CanvasState; artboard: Artboard } {
  const preset = opts.breakpoint ? ARTBOARD_PRESETS[opts.breakpoint] : undefined;
  const artboard: Artboard = {
    id: genId("artboard"),
    name: opts.name ?? preset?.name ?? "Artboard",
    breakpoint: opts.breakpoint ?? "desktop",
    width: opts.width ?? preset?.width ?? 1440,
    height: opts.height ?? preset?.height ?? 900,
    backgroundColor: opts.backgroundColor ?? "#ffffff",
    elementIds: [],
  };
  const newState = { ...state, artboards: [...state.artboards, artboard], updatedAt: new Date().toISOString() };
  return { state: newState, artboard };
}

/** Add an element to an artboard. */
export function addElement(
  state: CanvasState,
  artboardId: string,
  element: Omit<CanvasElement, "id">,
): { state: CanvasState; element: CanvasElement } {
  const id = genId(element.kind);
  const full: CanvasElement = { ...element, id };
  const elements = new Map(state.elements);
  elements.set(id, full);

  const artboards = state.artboards.map((a) =>
    a.id === artboardId ? { ...a, elementIds: [...a.elementIds, id] } : a,
  );

  const newState: CanvasState = {
    ...state,
    elements,
    artboards,
    layerOrder: [...state.layerOrder, id],
    updatedAt: new Date().toISOString(),
  };
  return { state: newState, element: full };
}

/** Update an element's properties. */
export function updateElement(
  state: CanvasState,
  elementId: string,
  patch: Partial<Omit<CanvasElement, "id">>,
): CanvasState {
  const el = state.elements.get(elementId);
  if (!el) return state;
  const elements = new Map(state.elements);
  elements.set(elementId, { ...el, ...patch });
  return { ...state, elements, updatedAt: new Date().toISOString() };
}

/** Remove an element (and its children recursively). */
export function removeElement(state: CanvasState, elementId: string): CanvasState {
  const elements = new Map(state.elements);
  const toRemove = new Set<string>();

  function collect(id: string) {
    const el = elements.get(id);
    if (!el) return;
    toRemove.add(id);
    for (const childId of el.children) collect(childId);
  }
  collect(elementId);

  for (const id of toRemove) elements.delete(id);

  const artboards = state.artboards.map((a) => ({
    ...a,
    elementIds: a.elementIds.filter((id) => !toRemove.has(id)),
  }));

  const layerOrder = state.layerOrder.filter((id) => !toRemove.has(id));
  return { ...state, elements, artboards, layerOrder, updatedAt: new Date().toISOString() };
}

/** Reorder layers (move element up/down in z-order). */
export function reorderLayer(
  state: CanvasState,
  elementId: string,
  direction: "up" | "down" | "top" | "bottom",
): CanvasState {
  const idx = state.layerOrder.indexOf(elementId);
  if (idx === -1) return state;
  const order = [...state.layerOrder];
  order.splice(idx, 1);

  switch (direction) {
    case "up":
      order.splice(Math.min(idx + 1, order.length), 0, elementId);
      break;
    case "down":
      order.splice(Math.max(idx - 1, 0), 0, elementId);
      break;
    case "top":
      order.push(elementId);
      break;
    case "bottom":
      order.unshift(elementId);
      break;
  }

  return { ...state, layerOrder: order, updatedAt: new Date().toISOString() };
}

/** Group elements into a container. */
export function groupElements(
  state: CanvasState,
  artboardId: string,
  elementIds: string[],
  groupName?: string,
): { state: CanvasState; groupId: string } {
  const groupId = genId("group");
  const children = elementIds.map((id) => state.elements.get(id)).filter(Boolean) as CanvasElement[];
  if (children.length === 0) return { state, groupId: "" };

  // Compute bounding box
  const minX = Math.min(...children.map((c) => c.bounds.x));
  const minY = Math.min(...children.map((c) => c.bounds.y));
  const maxX = Math.max(...children.map((c) => c.bounds.x + c.bounds.width));
  const maxY = Math.max(...children.map((c) => c.bounds.y + c.bounds.height));

  const group: CanvasElement = {
    id: groupId,
    kind: "group",
    name: groupName ?? "Group",
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    style: {},
    children: elementIds,
  };

  const elements = new Map(state.elements);
  elements.set(groupId, group);

  // Reposition children relative to group
  for (const id of elementIds) {
    const el = elements.get(id);
    if (el) {
      elements.set(id, {
        ...el,
        bounds: {
          ...el.bounds,
          x: el.bounds.x - minX,
          y: el.bounds.y - minY,
        },
      });
    }
  }

  const artboards = state.artboards.map((a) => {
    if (a.id !== artboardId) return a;
    return {
      ...a,
      elementIds: [groupId, ...a.elementIds.filter((id) => !elementIds.includes(id))],
    };
  });

  return {
    state: { ...state, elements, artboards, layerOrder: [...state.layerOrder, groupId], updatedAt: new Date().toISOString() },
    groupId,
  };
}

// ─── Component Presets (quick add common patterns) ────────────────────────────

export interface ComponentPreset {
  name: string;
  description: string;
  elements: Array<Omit<CanvasElement, "id">>;
}

export const COMPONENT_PRESETS: Record<string, ComponentPreset> = {
  "hero-center": {
    name: "Hero Section (Centered)",
    description: "Centered headline + subheadline + CTA button",
    elements: [
      {
        kind: "section", name: "Hero", bounds: { x: 0, y: 0, width: 1440, height: 600 },
        style: { backgroundColor: "#09090b", padding: "80px 0" },
        children: [],
        flex: { direction: "column", align: "center", justify: "center", gap: "24px" },
      },
      {
        kind: "text", name: "Headline", bounds: { x: 200, y: 160, width: 1040, height: 80 },
        style: { fontSize: "3rem", fontWeight: "800", color: "#ffffff", textAlign: "center" },
        children: [], text: "Build something amazing",
      },
      {
        kind: "text", name: "Subheadline", bounds: { x: 300, y: 260, width: 840, height: 48 },
        style: { fontSize: "1.25rem", color: "#a1a1aa", textAlign: "center" },
        children: [], text: "The all-in-one platform for modern teams",
      },
      {
        kind: "button", name: "CTA Button", bounds: { x: 620, y: 340, width: 200, height: 48 },
        style: { backgroundColor: "#3b82f6", color: "#ffffff", borderRadius: "0.5rem", fontSize: "1rem", fontWeight: "600" },
        children: [], text: "Get Started",
      },
    ],
  },
  "navbar": {
    name: "Navigation Bar",
    description: "Logo + nav links + CTA button",
    elements: [
      {
        kind: "nav", name: "Navbar", bounds: { x: 0, y: 0, width: 1440, height: 64 },
        style: { backgroundColor: "#ffffff", borderBottom: "1px solid #e4e4e7", padding: "0 48px" },
        children: [],
        flex: { direction: "row", align: "center", justify: "between" },
      },
      {
        kind: "text", name: "Logo", bounds: { x: 48, y: 20, width: 120, height: 24 },
        style: { fontSize: "1.25rem", fontWeight: "700", color: "#09090b" },
        children: [], text: "Acme Inc",
      },
      {
        kind: "text", name: "Nav Links", bounds: { x: 500, y: 22, width: 400, height: 20 },
        style: { fontSize: "0.875rem", color: "#71717a" },
        children: [], text: "Features  Pricing  Docs  Blog",
      },
      {
        kind: "button", name: "Sign Up", bounds: { x: 1280, y: 14, width: 112, height: 36 },
        style: { backgroundColor: "#09090b", color: "#ffffff", borderRadius: "0.375rem", fontSize: "0.875rem" },
        children: [], text: "Sign Up",
      },
    ],
  },
  "card-grid": {
    name: "3-Column Feature Cards",
    description: "Three equal feature cards in a grid",
    elements: [
      {
        kind: "grid", name: "Card Grid", bounds: { x: 0, y: 0, width: 1440, height: 400 },
        style: { padding: "64px 96px" },
        children: [],
        grid: { columns: 3, gap: "32px" },
      },
      {
        kind: "card", name: "Card 1", bounds: { x: 96, y: 64, width: 384, height: 280 },
        style: { backgroundColor: "#ffffff", border: "1px solid #e4e4e7", borderRadius: "0.75rem", padding: "32px" },
        children: [],
      },
      {
        kind: "text", name: "Card 1 Title", bounds: { x: 128, y: 96, width: 320, height: 32 },
        style: { fontSize: "1.25rem", fontWeight: "600", color: "#09090b" },
        children: [], text: "Lightning Fast",
      },
      {
        kind: "text", name: "Card 1 Desc", bounds: { x: 128, y: 144, width: 320, height: 64 },
        style: { fontSize: "0.875rem", color: "#71717a" },
        children: [], text: "Optimized for speed with edge computing and smart caching.",
      },
      {
        kind: "card", name: "Card 2", bounds: { x: 512, y: 64, width: 384, height: 280 },
        style: { backgroundColor: "#ffffff", border: "1px solid #e4e4e7", borderRadius: "0.75rem", padding: "32px" },
        children: [],
      },
      {
        kind: "card", name: "Card 3", bounds: { x: 928, y: 64, width: 384, height: 280 },
        style: { backgroundColor: "#ffffff", border: "1px solid #e4e4e7", borderRadius: "0.75rem", padding: "32px" },
        children: [],
      },
    ],
  },
  "pricing-table": {
    name: "Pricing Table (3 tiers)",
    description: "Free / Pro / Enterprise pricing cards",
    elements: [
      {
        kind: "section", name: "Pricing Section", bounds: { x: 0, y: 0, width: 1440, height: 600 },
        style: { backgroundColor: "#f4f4f5", padding: "80px 0" },
        children: [],
      },
      {
        kind: "text", name: "Pricing Title", bounds: { x: 500, y: 80, width: 440, height: 48 },
        style: { fontSize: "2.25rem", fontWeight: "700", color: "#09090b", textAlign: "center" },
        children: [], text: "Simple, transparent pricing",
      },
    ],
  },
  "footer": {
    name: "Footer",
    description: "Multi-column footer with links",
    elements: [
      {
        kind: "footer", name: "Footer", bounds: { x: 0, y: 0, width: 1440, height: 300 },
        style: { backgroundColor: "#09090b", padding: "64px 96px" },
        children: [],
      },
      {
        kind: "text", name: "Footer Brand", bounds: { x: 96, y: 64, width: 200, height: 24 },
        style: { fontSize: "1.25rem", fontWeight: "700", color: "#ffffff" },
        children: [], text: "Acme Inc",
      },
      {
        kind: "text", name: "Copyright", bounds: { x: 96, y: 240, width: 400, height: 20 },
        style: { fontSize: "0.75rem", color: "#71717a" },
        children: [], text: "© 2026 Acme Inc. All rights reserved.",
      },
    ],
  },
};

// ─── Export: Tailwind Classes ──────────────────────────────────────────────────

/** Convert a Style object to Tailwind class string. */
export function styleToTailwind(style: Style): string {
  const classes: string[] = [];

  if (style.backgroundColor) {
    const tw = colorToTailwindBg(style.backgroundColor);
    if (tw) classes.push(tw);
    else if (style.backgroundColor.startsWith("#")) classes.push(`bg-[${style.backgroundColor}]`);
  }
  if (style.color) {
    const tw = colorToTailwindText(style.color);
    if (tw) classes.push(tw);
    else if (style.color.startsWith("#")) classes.push(`text-[${style.color}]`);
  }
  if (style.fontSize) classes.push(fontSizeToTailwind(style.fontSize));
  if (style.fontWeight) classes.push(weightToTailwind(style.fontWeight));
  if (style.textAlign) classes.push(`text-${style.textAlign}`);
  if (style.borderRadius) classes.push(radiusToTailwind(style.borderRadius));
  if (style.boxShadow) classes.push(shadowToTailwind(style.boxShadow));
  if (style.opacity !== undefined && style.opacity < 1) classes.push(`opacity-${Math.round(style.opacity * 100)}`);
  if (style.padding) classes.push(paddingToTailwind(style.padding));

  return classes.filter(Boolean).join(" ");
}

function colorToTailwindBg(c: string): string | null {
  const map: Record<string, string> = {
    "#ffffff": "bg-white", "#09090b": "bg-zinc-950", "#f4f4f5": "bg-zinc-100",
    "#3b82f6": "bg-blue-500", "#8b5cf6": "bg-violet-500", "#06b6d4": "bg-cyan-500",
    "#ef4444": "bg-red-500", "#22c55e": "bg-green-500", "#f59e0b": "bg-amber-500",
  };
  return map[c] ?? null;
}

function colorToTailwindText(c: string): string | null {
  const map: Record<string, string> = {
    "#ffffff": "text-white", "#09090b": "text-zinc-950", "#71717a": "text-zinc-500",
    "#a1a1aa": "text-zinc-400", "#3b82f6": "text-blue-500", "#ef4444": "text-red-500",
  };
  return map[c] ?? null;
}

function fontSizeToTailwind(s: string): string {
  const map: Record<string, string> = {
    "0.75rem": "text-xs", "0.875rem": "text-sm", "1rem": "text-base",
    "1.125rem": "text-lg", "1.25rem": "text-xl", "1.5rem": "text-2xl",
    "1.875rem": "text-3xl", "2.25rem": "text-4xl", "3rem": "text-5xl",
  };
  return map[s] ?? `text-[${s}]`;
}

function weightToTailwind(w: string): string {
  const map: Record<string, string> = {
    "400": "font-normal", "500": "font-medium", "600": "font-semibold",
    "700": "font-bold", "800": "font-extrabold",
  };
  return map[w] ?? `font-[${w}]`;
}

function radiusToTailwind(r: string): string {
  const map: Record<string, string> = {
    "0": "rounded-none", "0.25rem": "rounded-sm", "0.375rem": "rounded",
    "0.5rem": "rounded-md", "0.75rem": "rounded-lg", "1rem": "rounded-xl",
    "9999px": "rounded-full",
  };
  return map[r] ?? `rounded-[${r}]`;
}

function shadowToTailwind(s: string): string {
  if (s.includes("0 1px 2px")) return "shadow-sm";
  if (s.includes("0 4px 6px")) return "shadow-md";
  if (s.includes("0 10px 15px")) return "shadow-lg";
  if (s.includes("0 20px 25px")) return "shadow-xl";
  return `shadow-[${s}]`;
}

function paddingToTailwind(p: string): string {
  // Simple: "32px" → p-[32px], "80px 0" → py-20 px-0, etc
  const parts = p.split(/\s+/);
  if (parts.length === 1) return `p-[${parts[0]}]`;
  if (parts.length === 2) return `py-[${parts[0]}] px-[${parts[1]}]`;
  if (parts.length === 4) return `pt-[${parts[0]}] pr-[${parts[1]}] pb-[${parts[2]}] pl-[${parts[3]}]`;
  return `p-[${p}]`;
}

// ─── Export: React + Tailwind Code ─────────────────────────────────────────────

/** Export canvas as a React + Tailwind component. */
export function exportToReact(state: CanvasState, artboardId?: string): string {
  const artboards = artboardId
    ? state.artboards.filter((a) => a.id === artboardId)
    : state.artboards;

  const lines: string[] = [
    `import React from "react";`,
    ``,
    `export default function Design() {`,
    `  return (`,
  ];

  for (const ab of artboards) {
    lines.push(`    <div className="min-h-screen" style={{ backgroundColor: "${ab.backgroundColor}" }}>`);
    for (const elId of ab.elementIds) {
      const el = state.elements.get(elId);
      if (el && !el.hidden) lines.push(...renderElement(el, state, 2));
    }
    lines.push(`    </div>`);
  }

  lines.push(`  );`, `}`);
  return lines.join("\n");
}

function renderElement(el: CanvasElement, state: CanvasState, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const tw = styleToTailwind(el.style);
  const pos = `absolute left-[${el.bounds.x}px] top-[${el.bounds.y}px] w-[${el.bounds.width}px] h-[${el.bounds.height}px]`;
  const cls = [pos, tw].filter(Boolean).join(" ");

  switch (el.kind) {
    case "text":
      return [`${indent}<p className="${cls}">${el.text ?? ""}</p>`];
    case "button":
      return [`${indent}<button className="${cls}">${el.text ?? ""}</button>`];
    case "image":
      return [`${indent}<img src="${el.src ?? ""}" alt="${el.alt ?? ""}" className="${cls}" />`];
    case "nav":
    case "section":
    case "footer":
    case "container":
    case "group":
    case "grid":
    case "flex": {
      const lines: string[] = [`${indent}<div className="${cls}">`];
      for (const childId of el.children) {
        const child = state.elements.get(childId);
        if (child && !child.hidden) lines.push(...renderElement(child, state, depth + 1));
      }
      lines.push(`${indent}</div>`);
      return lines;
    }
    case "card":
      return [
        `${indent}<div className="${cls}">`,
        `${indent}  <h3 className="text-xl font-semibold">${el.text ?? el.name}</h3>`,
        `${indent}</div>`,
      ];
    case "divider":
      return [`${indent}<hr className="${cls}" />`];
    default:
      return [`${indent}<div className="${cls}" data-kind="${el.kind}">${el.text ?? ""}</div>`];
  }
}

// ─── Export: Figma-compatible JSON ─────────────────────────────────────────────

/** Export canvas as Figma-compatible JSON (for import or agent handoff). */
export function exportToFigmaJson(state: CanvasState): Record<string, unknown> {
  return {
    name: state.name,
    description: state.description,
    tokens: state.tokens,
    artboards: state.artboards.map((ab) => ({
      id: ab.id,
      name: ab.name,
      breakpoint: ab.breakpoint,
      width: ab.width,
      height: ab.height,
      backgroundColor: ab.backgroundColor,
      children: ab.elementIds.map((id) => {
        const el = state.elements.get(id);
        if (!el) return null;
        return {
          id: el.id,
          type: el.kind.toUpperCase(),
          name: el.name,
          x: el.bounds.x,
          y: el.bounds.y,
          width: el.bounds.width,
          height: el.bounds.height,
          style: el.style,
          content: el.text,
          src: el.src,
          children: el.children,
        };
      }).filter(Boolean),
    })),
  };
}

// ─── Auto-Layout Engine ───────────────────────────────────────────────────────

/** Auto-arrange elements in a flex row or grid. */
export function autoLayout(
  state: CanvasState,
  artboardId: string,
  opts: {
    direction?: "row" | "column";
    gap?: number;
    align?: "start" | "center" | "end";
    padding?: number;
  },
): CanvasState {
  const artboard = state.artboards.find((a) => a.id === artboardId);
  if (!artboard) return state;

  const gap = opts.gap ?? 16;
  const padding = opts.padding ?? 0;
  const dir = opts.direction ?? "row";
  const abWidth = artboard.width - padding * 2;
  const abHeight = artboard.height - padding * 2;

  const elements = new Map(state.elements);
  let offset = dir === "row" ? padding : padding;

  for (const elId of artboard.elementIds) {
    const el = elements.get(elId);
    if (!el || el.locked || el.kind === "group") continue;

    if (dir === "row") {
      const newY = opts.align === "center"
        ? padding + (abHeight - el.bounds.height) / 2
        : opts.align === "end"
          ? padding + abHeight - el.bounds.height
          : padding;
      elements.set(elId, { ...el, bounds: { ...el.bounds, x: offset, y: newY } });
      offset += el.bounds.width + gap;
    } else {
      const newX = opts.align === "center"
        ? padding + (abWidth - el.bounds.width) / 2
        : opts.align === "end"
          ? padding + abWidth - el.bounds.width
          : padding;
      elements.set(elId, { ...el, bounds: { ...el.bounds, x: newX, y: offset } });
      offset += el.bounds.height + gap;
    }
  }

  return { ...state, elements, updatedAt: new Date().toISOString() };
}

/** Center all elements in an artboard. */
export function centerElements(state: CanvasState, artboardId: string): CanvasState {
  const artboard = state.artboards.find((a) => a.id === artboardId);
  if (!artboard) return state;

  const elements = new Map(state.elements);
  for (const elId of artboard.elementIds) {
    const el = elements.get(elId);
    if (!el || el.locked) continue;
    elements.set(elId, {
      ...el,
      bounds: {
        ...el.bounds,
        x: (artboard.width - el.bounds.width) / 2,
        y: (artboard.height - el.bounds.height) / 2,
      },
    });
  }

  return { ...state, elements, updatedAt: new Date().toISOString() };
}

// ─── Helpers for Agents ───────────────────────────────────────────────────────

/** Quick-create a full landing page layout. */
export function createLandingPage(state: CanvasState, opts?: {
  title?: string;
  subtitle?: string;
  cta?: string;
  brand?: string;
}): { state: CanvasState; artboardId: string } {
  let s = state;
  const { state: s2, artboard } = addArtboard(s, { breakpoint: "desktop", name: "Landing Page" });
  s = s2;
  const abId = artboard.id;

  // Navbar
  for (const preset of COMPONENT_PRESETS["navbar"].elements) {
    const { state: ns } = addElement(s, abId, preset);
    s = ns;
  }

  // Hero
  const heroPreset = COMPONENT_PRESETS["hero-center"].elements;
  for (let i = 0; i < heroPreset.length; i++) {
    let el = { ...heroPreset[i] };
    if (i === 0) el = { ...el, bounds: { ...el.bounds, y: 64 } }; // below navbar
    if (i === 1 && opts?.title) el = { ...el, text: opts.title };
    if (i === 2 && opts?.subtitle) el = { ...el, text: opts.subtitle };
    if (i === 3 && opts?.cta) el = { ...el, text: opts.cta };
    const { state: ns } = addElement(s, abId, el);
    s = ns;
  }

  // Cards
  for (const preset of COMPONENT_PRESETS["card-grid"].elements) {
    const el = { ...preset, bounds: { ...preset.bounds, y: preset.bounds.y + 664 } };
    const { state: ns } = addElement(s, abId, el);
    s = ns;
  }

  // Footer
  for (const preset of COMPONENT_PRESETS["footer"].elements) {
    const el = { ...preset, bounds: { ...preset.bounds, y: preset.bounds.y + 1064 } };
    const { state: ns } = addElement(s, abId, el);
    s = ns;
  }

  return { state: s, artboardId: abId };
}

/** Serialize/deserialize canvas state (for persistence). */
export function serializeCanvas(state: CanvasState): string {
  return JSON.stringify({
    ...state,
    elements: Array.from(state.elements.entries()),
  });
}

export function deserializeCanvas(json: string): CanvasState {
  const parsed = JSON.parse(json);
  return {
    ...parsed,
    elements: new Map(parsed.elements),
  };
}
