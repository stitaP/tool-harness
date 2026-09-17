/**
 * Agent Design Engine Tools — programmatic Figma-style canvas for agents.
 *
 * These tools let agents create, compose, and export visual designs
 * without any human UI interaction.
 */

import type { ToolManifest } from "../tool-types";

// ─── Tool Manifests ───────────────────────────────────────────────────────────

export const DESIGN_CREATE_CANVAS_MANIFEST: ToolManifest = {
  id: "design.canvas.create",
  name: "Create Design Canvas",
  description: "Create a new blank design canvas with tokens",
  longDescription:
    "Initialize a new design canvas with optional design tokens (colors, fonts, spacing, radii, shadows). Returns a canvas ID for subsequent operations.",
  category: "design",
  subcategory: "canvas",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "canvas", "figma", "visual", "layout"],
  icon: "PenTool",
  color: "#8b5cf6",
  parameters: [
    { name: "name", type: "string", description: "Canvas name", required: false, default: "Untitled Design" },
    { name: "description", type: "string", description: "Canvas description", required: false },
    { name: "tokens", type: "object", description: "Custom design tokens { colors, fonts, fontSizes, spacing, radii, shadows }", required: false },
  ],
  capabilities: [
    { name: "create-canvas", description: "Initialize a new design canvas", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 14200,
  rating: 4.9,
  ratingCount: 387,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_ADD_ARTBOARD_MANIFEST: ToolManifest = {
  id: "design.artboard.add",
  name: "Add Artboard",
  description: "Add a responsive artboard (mobile/tablet/desktop/wide)",
  longDescription:
    "Add an artboard frame to the canvas. Presets: iPhone 14 (375×812), iPad (768×1024), Desktop (1440×900), Wide (1920×1080). Custom sizes supported.",
  category: "design",
  subcategory: "canvas",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "artboard", "frame", "responsive", "breakpoint"],
  icon: "Square",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID to add artboard to", required: true },
    { name: "breakpoint", type: "enum", description: "Responsive breakpoint preset", required: false, default: "desktop", enum: ["mobile", "tablet", "desktop", "wide"] },
    { name: "name", type: "string", description: "Artboard name", required: false },
    { name: "width", type: "number", description: "Custom width in px (overrides breakpoint preset)", required: false },
    { name: "height", type: "number", description: "Custom height in px", required: false },
    { name: "backgroundColor", type: "string", description: "Background color (hex or Tailwind)", required: false, default: "#ffffff" },
  ],
  capabilities: [
    { name: "add-artboard", description: "Create responsive artboard frames", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 11800,
  rating: 4.7,
  ratingCount: 298,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_ADD_ELEMENT_MANIFEST: ToolManifest = {
  id: "design.element.add",
  name: "Add Design Element",
  description: "Add an element (rect, text, button, card, nav, hero, grid, image, etc.)",
  longDescription:
    "Add a visual element to an artboard. Supports 20+ element kinds: rect, text, image, icon, button, input, card, nav, hero, grid, flex, divider, badge, avatar, modal, sidebar, footer, section, container, group. Each element has position, size, style, and optional children.",
  category: "design",
  subcategory: "elements",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "element", "rect", "text", "button", "card", "component"],
  icon: "Plus",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "artboardId", type: "string", description: "Artboard ID to add element to", required: true },
    { name: "kind", type: "enum", description: "Element type", required: true, enum: ["rect", "text", "image", "icon", "button", "input", "card", "nav", "hero", "grid", "flex", "divider", "badge", "avatar", "modal", "sidebar", "footer", "section", "container", "group"] },
    { name: "name", type: "string", description: "Element name for layer panel", required: false },
    { name: "x", type: "number", description: "X position in px", required: false, default: 0 },
    { name: "y", type: "number", description: "Y position in px", required: false, default: 0 },
    { name: "width", type: "number", description: "Width in px", required: true },
    { name: "height", type: "number", description: "Height in px", required: true },
    { name: "text", type: "string", description: "Text content (for text, button, badge, card)", required: false },
    { name: "src", type: "string", description: "Image source URL or data URL", required: false },
    { name: "icon", type: "string", description: "Lucide icon name", required: false },
    { name: "href", type: "string", description: "Link URL", required: false },
    { name: "backgroundColor", type: "string", description: "Background color", required: false },
    { name: "color", type: "string", description: "Text color", required: false },
    { name: "fontSize", type: "string", description: "Font size (px or Tailwind token)", required: false },
    { name: "fontWeight", type: "string", description: "Font weight (400-800)", required: false },
    { name: "borderRadius", type: "string", description: "Border radius", required: false },
    { name: "padding", type: "string", description: "Padding (CSS shorthand)", required: false },
    { name: "textAlign", type: "enum", description: "Text alignment", required: false, enum: ["left", "center", "right"] },
  ],
  capabilities: [
    { name: "add-element", description: "Create and position design elements", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 16400,
  rating: 4.9,
  ratingCount: 421,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_PRESET_MANIFEST: ToolManifest = {
  id: "design.preset.add",
  name: "Add Component Preset",
  description: "Add a pre-built component (hero, navbar, cards, pricing, footer)",
  longDescription:
    "Drop in a ready-made component pattern: hero-center (centered headline + CTA), navbar (logo + links + button), card-grid (3-column features), pricing-table (3 tiers), footer (multi-column links). Each preset contains multiple pre-styled elements.",
  category: "design",
  subcategory: "elements",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "preset", "template", "hero", "navbar", "cards", "pricing", "footer"],
  icon: "LayoutTemplate",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "artboardId", type: "string", description: "Artboard ID", required: true },
    { name: "preset", type: "enum", description: "Component preset to add", required: true, enum: ["hero-center", "navbar", "card-grid", "pricing-table", "footer"] },
    { name: "offsetY", type: "number", description: "Y offset to stack below existing content", required: false, default: 0 },
  ],
  capabilities: [
    { name: "add-preset", description: "Drop in pre-built component patterns", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 13600,
  rating: 4.8,
  ratingCount: 354,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_LAYOUT_MANIFEST: ToolManifest = {
  id: "design.layout.auto",
  name: "Auto-Layout",
  description: "Auto-arrange elements in flex row/column or center them",
  longDescription:
    "Automatically arrange elements in an artboard using flex row/column layout with configurable gap, alignment, and padding. Or center all elements.",
  category: "design",
  subcategory: "layout",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "layout", "flex", "auto-layout", "alignment", "spacing"],
  icon: "AlignHorizontalSpaceAround",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "artboardId", type: "string", description: "Artboard ID", required: true },
    { name: "mode", type: "enum", description: "Layout mode", required: false, default: "row", enum: ["row", "column", "center"] },
    { name: "gap", type: "number", description: "Gap between elements in px", required: false, default: 16 },
    { name: "align", type: "enum", description: "Cross-axis alignment", required: false, default: "start", enum: ["start", "center", "end"] },
    { name: "padding", type: "number", description: "Padding around all edges in px", required: false, default: 0 },
  ],
  capabilities: [
    { name: "auto-layout", description: "Automatically arrange elements", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 10200,
  rating: 4.6,
  ratingCount: 231,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_GROUP_MANIFEST: ToolManifest = {
  id: "design.element.group",
  name: "Group Elements",
  description: "Group multiple elements into a container",
  longDescription:
    "Select multiple elements and group them into a single container element. Computes bounding box, repositions children relative to group origin.",
  category: "design",
  subcategory: "elements",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "group", "container", "layers", "organization"],
  icon: "Group",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "artboardId", type: "string", description: "Artboard ID", required: true },
    { name: "elementIds", type: "array", description: "Array of element IDs to group", required: true },
    { name: "name", type: "string", description: "Group name", required: false, default: "Group" },
  ],
  capabilities: [
    { name: "group-elements", description: "Organize elements into groups", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 8400,
  rating: 4.5,
  ratingCount: 178,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_LANDING_PAGE_MANIFEST: ToolManifest = {
  id: "design.landing.create",
  name: "Create Full Landing Page",
  description: "Auto-generate a complete landing page (navbar + hero + cards + footer)",
  longDescription:
    "One-shot landing page creation: generates a desktop artboard with navbar, centered hero (customizable headline/subtitle/CTA), 3-column feature cards, and footer. All elements are pre-styled and positioned.",
  category: "design",
  subcategory: "templates",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "landing-page", "template", "full-page", "one-shot"],
  icon: "Layout",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "title", type: "string", description: "Hero headline text", required: false, default: "Build something amazing" },
    { name: "subtitle", type: "string", description: "Hero subheadline", required: false, default: "The all-in-one platform for modern teams" },
    { name: "cta", type: "string", description: "CTA button text", required: false, default: "Get Started" },
    { name: "brand", type: "string", description: "Brand name for navbar and footer", required: false, default: "Acme Inc" },
  ],
  capabilities: [
    { name: "create-landing", description: "Generate complete landing page layouts", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 18200,
  rating: 4.9,
  ratingCount: 467,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_EXPORT_MANIFEST: ToolManifest = {
  id: "design.export",
  name: "Export Design to Code",
  description: "Export canvas as React+Tailwind, HTML+CSS, SVG, or Figma JSON",
  longDescription:
    "Export the design canvas to production-ready code. Formats: React + Tailwind (default), HTML + inline CSS, SVG markup, or Figma-compatible JSON for round-tripping.",
  category: "design",
  subcategory: "export",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "export", "react", "tailwind", "html", "svg", "figma", "code-generation"],
  icon: "Code",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID to export", required: true },
    { name: "format", type: "enum", description: "Export format", required: false, default: "react", enum: ["react", "html", "svg", "figma-json"] },
    { name: "artboardId", type: "string", description: "Export specific artboard (omit for all)", required: false },
  ],
  capabilities: [
    { name: "export-design", description: "Convert designs to production code", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 15800,
  rating: 4.8,
  ratingCount: 402,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_UPDATE_ELEMENT_MANIFEST: ToolManifest = {
  id: "design.element.update",
  name: "Update Element",
  description: "Update an element's position, size, style, or content",
  longDescription:
    "Modify any property of an existing element: position, dimensions, colors, fonts, borders, shadows, text content, image source, or responsive overrides.",
  category: "design",
  subcategory: "elements",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "update", "edit", "style", "position"],
  icon: "Pencil",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "elementId", type: "string", description: "Element ID to update", required: true },
    { name: "patch", type: "object", description: "Properties to update (x, y, width, height, text, backgroundColor, color, fontSize, etc.)", required: true },
  ],
  capabilities: [
    { name: "update-element", description: "Modify element properties", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 12400,
  rating: 4.7,
  ratingCount: 312,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_REMOVE_ELEMENT_MANIFEST: ToolManifest = {
  id: "design.element.remove",
  name: "Remove Element",
  description: "Remove an element (and its children) from the canvas",
  longDescription:
    "Delete an element and all its children recursively. Updates artboard element lists and layer order.",
  category: "design",
  subcategory: "elements",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "remove", "delete", "cleanup"],
  icon: "Trash2",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "elementId", type: "string", description: "Element ID to remove", required: true },
  ],
  capabilities: [
    { name: "remove-element", description: "Delete elements from canvas", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 9600,
  rating: 4.6,
  ratingCount: 201,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

export const DESIGN_REORDER_LAYER_MANIFEST: ToolManifest = {
  id: "design.layer.reorder",
  name: "Reorder Layer",
  description: "Move an element up/down/top/bottom in the layer stack",
  longDescription:
    "Change the z-order of an element within its artboard. Supports: move up, move down, move to top, move to bottom.",
  category: "design",
  subcategory: "layers",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["design", "layer", "z-order", "reorder", "stacking"],
  icon: "ArrowUpDown",
  color: "#8b5cf6",
  parameters: [
    { name: "canvasId", type: "string", description: "Canvas ID", required: true },
    { name: "elementId", type: "string", description: "Element ID to reorder", required: true },
    { name: "direction", type: "enum", description: "Direction to move", required: true, enum: ["up", "down", "top", "bottom"] },
  ],
  capabilities: [
    { name: "reorder-layer", description: "Change element z-order", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],
  installs: 7800,
  rating: 4.5,
  ratingCount: 156,
  updatedAt: "2026-08-28",
  slmFriendly: true,
};

/** All design engine tool manifests. */
export const DESIGN_ENGINE_TOOLS: ToolManifest[] = [
  DESIGN_CREATE_CANVAS_MANIFEST,
  DESIGN_ADD_ARTBOARD_MANIFEST,
  DESIGN_ADD_ELEMENT_MANIFEST,
  DESIGN_PRESET_MANIFEST,
  DESIGN_LAYOUT_MANIFEST,
  DESIGN_GROUP_MANIFEST,
  DESIGN_LANDING_PAGE_MANIFEST,
  DESIGN_EXPORT_MANIFEST,
  DESIGN_UPDATE_ELEMENT_MANIFEST,
  DESIGN_REMOVE_ELEMENT_MANIFEST,
  DESIGN_REORDER_LAYER_MANIFEST,
];
