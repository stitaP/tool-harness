/**
 * Scene Parser — converts ViT model output into structured scene descriptions.
 *
 * This module replaces all heuristic pixel-analysis rules with actual model inference.
 * The ViT model classifies image regions and the parser organises the results into
 * spatial relationships, layout zones, and LLM-consumable descriptions.
 */

import { type ViTConfig, type Tensor, TINY_VIT_CONFIG } from "./vit";
import { type PreprocessedImage } from "./inference-runner";
import type { SceneAnalysis } from "./inference-runner";

// ─── Scene Description (LLM-consumable output) ──────────────────────────────

export interface SceneElement {
  label: string;
  confidence: number;
  bbox?: { x: number; y: number; w: number; h: number };
  description?: string;
}

export interface SpatialRelation {
  subject: string;
  relation: string;
  object: string;
  distance?: number;
}

export interface LayoutZone {
  zone: string;
  confidence: number;
  elements: string[];
}

export interface SceneDescription {
  /** Scene-level classification from the model. */
  sceneType: string;
  /** Confidence of scene classification. */
  sceneConfidence: number;
  /** All detected UI elements. */
  elements: SceneElement[];
  /** Spatial relationships between elements. */
  relations: SpatialRelation[];
  /** Detected layout zones (header, sidebar, main, footer, etc.). */
  layoutZones: LayoutZone[];
  /** Dominant colors extracted from the image. */
  dominantColors: string[];
  /** Natural language description of the scene. */
  narrative: string;
  /** Structured JSON-LD-style description for programmatic use. */
  structured: Record<string, unknown>;
  /** The CLS embedding vector for similarity search. */
  embedding: Float32Array;
  /** Raw scene logits for downstream processing. */
  rawLogits: Float32Array;
}

// ─── Element description templates ───────────────────────────────────────────

const ELEMENT_DESCRIPTIONS: Record<string, (e: SceneElement) => string> = {
  heading: (e) => `A heading/section title (${e.label})`,
  paragraph: (e) => `A block of body text`,
  button: (e) => `A clickable button element`,
  link: (e) => `A hyperlink for navigation`,
  input_text: (e) => `A text input field for user entry`,
  input_search: (e) => `A search input field`,
  input_email: (e) => `An email input field`,
  input_password: (e) => `A password input field (masked)`,
  textarea: (e) => `A multi-line text input area`,
  checkbox: (e) => `A checkbox toggle control`,
  radio: (e) => `A radio button (single selection)`,
  select_dropdown: (e) => `A dropdown selection menu`,
  image: (e) => `An image element (photo, illustration, or graphic)`,
  icon: (e) => `A small icon/graphic element`,
  logo: (e) => `A brand/company logo`,
  navigation_bar: (e) => `A navigation bar with menu links`,
  sidebar: (e) => `A sidebar panel with secondary navigation or filters`,
  footer: (e) => `A page footer with links and copyright info`,
  card: (e) => `A content card container`,
  modal: (e) => `A modal dialog overlay`,
  tooltip: (e) => `A tooltip popup with contextual info`,
  badge: (e) => `A badge/status indicator`,
  tag: (e) => `A tag or label chip`,
  table: (e) => `A data table with rows and columns`,
  list: (e) => `An ordered or unordered list`,
  code_block: (e) => `A code block with syntax highlighting`,
  quote: (e) => `A blockquote element`,
  divider: (e) => `A horizontal divider line`,
  progress_bar: (e) => `A progress indicator bar`,
  spinner: (e) => `A loading spinner animation`,
  tab_bar: (e) => `A tab bar for switching views`,
  accordion: (e) => `A collapsible accordion section`,
  carousel: (e) => `A carousel/slider for rotating content`,
  avatar: (e) => `A user avatar image or placeholder`,
  alert_banner: (e) => `An alert/notification banner`,
  toast_notification: (e) => `A toast notification popup`,
  breadcrumb: (e) => `A breadcrumb navigation trail`,
  pagination: (e) => `A pagination control for multi-page content`,
  slider: (e) => `A range slider control`,
  toggle_switch: (e) => `A toggle switch control`,
  file_upload: (e) => `A file upload area or dropzone`,
  video_player: (e) => `A video player component`,
  audio_player: (e) => `An audio/music player component`,
  map_embed: (e) => `An embedded map view`,
  form_group: (e) => `A form field group with label and input`,
  submit_button: (e) => `A form submit button`,
  cancel_button: (e) => `A cancel/dismiss button`,
  close_button: (e) => `A close (×) button`,
  search_bar: (e) => `A search bar with input and submit`,
  dropdown_menu: (e) => `A dropdown/popup menu`,
  context_menu: (e) => `A right-click context menu`,
  datepicker: (e) => `A date picker calendar control`,
  color_picker: (e) => `A color selection control`,
  rating_stars: (e) => `A star rating component`,
  social_icon: (e) => `A social media platform icon`,
  chat_bubble: (e) => `A chat message bubble`,
  notification_dot: (e) => `A notification indicator dot`,
  loading_skeleton: (e) => `A loading skeleton placeholder`,
  hero_banner: (e) => `A hero banner with headline and CTA`,
  cta_section: (e) => `A call-to-action section`,
  footer_link: (e) => `A link in the footer area`,
  inline_help: (e) => `Inline help text or hint`,
};

// ─── Layout zone detection ───────────────────────────────────────────────────

const ZONE_LABELS: Record<string, string> = {
  navigation_bar: "header",
  sidebar: "sidebar",
  footer: "footer",
  hero_banner: "hero",
  cta_section: "cta",
  card: "content",
  table: "content",
  form_group: "form",
  modal: "overlay",
};

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a scene analysis (from model inference) into a full SceneDescription
 * that an LLM can consume to understand the image.
 */
export function parseScene(
  analysis: SceneAnalysis,
  preprocessed?: PreprocessedImage,
  rawPixels?: { data: Uint8ClampedArray; width: number; height: number },
): SceneDescription {
  const elements: SceneElement[] = analysis.elements.map((e) => ({
    ...e,
    description: ELEMENT_DESCRIPTIONS[e.label]?.(e) || `A ${e.label} element`,
  }));

  // Spatial relations — derived from confidence ordering (top elements first)
  const relations = buildRelations(elements);

  // Layout zones
  const layoutZones = buildLayoutZones(elements);

  // Dominant colors (simple: sample from raw pixels if available)
  const dominantColors = rawPixels
    ? extractDominantColors(rawPixels.data, rawPixels.width, rawPixels.height)
    : ["#unknown"];

  // Narrative
  const narrative = buildNarrative(analysis.sceneType, elements, relations, layoutZones, dominantColors);

  // Structured output
  const structured: Record<string, unknown> = {
    "@type": "SceneDescription",
    sceneType: analysis.sceneType,
    elementCount: elements.length,
    elements: elements.map((e) => ({
      type: e.label,
      confidence: Math.round(e.confidence * 100) + "%",
      ...(e.description ? { description: e.description } : {}),
    })),
    layout: layoutZones.map((z) => z.zone),
    colors: dominantColors,
  };

  return {
    sceneType: analysis.sceneType,
    sceneConfidence: analysis.elements[0]?.confidence ?? 0,
    elements,
    relations,
    layoutZones,
    dominantColors,
    narrative,
    structured,
    embedding: analysis.embedding,
    rawLogits: analysis.rawSceneLogits,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRelations(elements: SceneElement[]): SpatialRelation[] {
  const relations: SpatialRelation[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      if (!a.bbox || !b.bbox) continue;

      const aCx = a.bbox.x + a.bbox.w / 2;
      const aCy = a.bbox.y + a.bbox.h / 2;
      const bCx = b.bbox.x + b.bbox.w / 2;
      const bCy = b.bbox.y + b.bbox.h / 2;

      const dx = bCx - aCx;
      const dy = bCy - aCy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let rel: string;
      if (Math.abs(dy) > Math.abs(dx)) {
        rel = dy > 0 ? "below" : "above";
      } else {
        rel = dx > 0 ? "to the right of" : "to the left of";
      }

      relations.push({
        subject: a.label,
        relation: rel,
        object: b.label,
        distance: Math.round(dist),
      });
    }
  }

  return relations.slice(0, 30); // limit
}

function buildLayoutZones(elements: SceneElement[]): LayoutZone[] {
  const zoneMap = new Map<string, string[]>();

  for (const el of elements) {
    const zone = ZONE_LABELS[el.label];
    if (zone) {
      if (!zoneMap.has(zone)) zoneMap.set(zone, []);
      zoneMap.get(zone)!.push(el.label);
    }
  }

  const zones: LayoutZone[] = [];
  for (const [zone, els] of zoneMap) {
    zones.push({
      zone,
      confidence: 0.8,
      elements: [...new Set(els)],
    });
  }

  return zones;
}

function extractDominantColors(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): string[] {
  // Simple k-means-ish: sample grid points, bucket by quantised RGB
  const buckets = new Map<string, number>();
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 25)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = Math.round(rgba[idx] / 32) * 32;
      const g = Math.round(rgba[idx + 1] / 32) * 32;
      const b = Math.round(rgba[idx + 2] / 32) * 32;
      // Skip near-white and near-black
      if (r > 240 && g > 240 && b > 240) continue;
      if (r < 15 && g < 15 && b < 15) continue;
      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 5).map(([key]) => {
    const [r, g, b] = key.split(",").map(Number);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  });
}

function buildNarrative(
  sceneType: string,
  elements: SceneElement[],
  relations: SpatialRelation[],
  zones: LayoutZone[],
  colors: string[],
): string {
  const lines: string[] = [];

  // Scene intro
  lines.push(`This image shows a ${sceneType} interface.`);

  // Zones
  if (zones.length > 0) {
    lines.push(
      `The layout contains: ${zones.map((z) => z.zone).join(", ")}.`,
    );
  }

  // Elements summary
  const topElements = elements.slice(0, 8);
  if (topElements.length > 0) {
    const counts = new Map<string, number>();
    for (const e of topElements) {
      counts.set(e.label, (counts.get(e.label) || 0) + 1);
    }
    const parts: string[] = [];
    for (const [label, count] of counts) {
      parts.push(`${count} ${label}${count > 1 ? "s" : ""}`);
    }
    lines.push(`Visible elements include ${parts.join(", ")}.`);
  }

  // Colors
  if (colors.length > 0) {
    lines.push(`The dominant color palette is: ${colors.join(", ")}.`);
  }

  // Key relations
  const keyRels = relations.filter(
    (r) => ["navigation_bar", "button", "heading", "input_text", "sidebar", "footer", "card"].includes(r.subject) ||
           ["navigation_bar", "button", "heading", "input_text", "sidebar", "footer", "card"].includes(r.object),
  ).slice(0, 5);
  if (keyRels.length > 0) {
    for (const r of keyRels) {
      lines.push(`The ${r.subject} is ${r.relation} the ${r.object}.`);
    }
  }

  return lines.join(" ");
}
