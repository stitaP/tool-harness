/**
 * Hybrid SVG conversion (blueprint §15).
 *
 * Two-stage pipeline:
 *
 *  1. `snapshotDom` (browser) — walks the live DOM of the built-in demo page
 *     at capture time, records per-element bounds + computed styles, scores
 *     vector suitability, and rasterizes unsupported regions (canvas, video,
 *     iframes, filters, shadows, gradients, external images, 3D/unparseable
 *     transforms) by cropping the
 *     captured raster canvas into self-contained data URLs. The result is a
 *     `DomSnapshot` — plain data, no live DOM, no external references.
 *
 *  2. `buildHybridSvg` (pure string builder, works in Bun) — converts the
 *     snapshot into an SVG where supported elements become native vector
 *     objects (rects, text, embedded images) and unsupported regions become
 *     embedded raster `<image>` elements. Annotations and metadata are layered
 *     on with the same helpers the portable path uses, so hybrid SVG stays a
 *     first-class export of the same editable document.
 *
 * Scoring follows the blueprint's vector-suitability model: ≥90 simple
 * vector, 60–89 complex vector (converted with a warning), <60 rasterized.
 */

import {
  Annotation,
  CaptureDocument,
  CaptureMetadataModel,
  DomClipShape,
  DomSnapshot,
  DomSnapshotNode,
  HybridRegionReport,
  HybridReport,
  HybridRisk,
  ParsedTransform,
  SemanticRole,
  SVG_NS,
} from "./types";
import { buildMetadataXml, escapeXml } from "./metadata";
import { annotationsToXml, buildDefsInner } from "./svg";

/* ------------------------------------------------------------------ */
/* Vector-suitability scoring (§15)                                     */
/* ------------------------------------------------------------------ */

export interface ScoreInput {
  tag: string;
  backgroundColor: string;
  backgroundImage: string;
  borderWidths: number[]; // one per side, CSS px
  borderRadius: number;
  filter: string;
  backdropFilter: string;
  transform: string;
  boxShadow: string;
  /** Computed clip-path value (inset/circle/ellipse/polygon → native SVG). */
  clipPath: string;
  /** Computed overflow value (hidden/clip → children clipped). */
  overflow: string;
  opacity: number;
  hasCanvas: boolean;
  hasVideo: boolean;
  hasFrame: boolean;
  hasInlineSvg: boolean;
  hasText: boolean;
}

export interface ScoreResult {
  score: number;
  risk: HybridRisk;
  reasons: string[];
}

/** Vector-suitability scoring (0–100). Pure — no DOM access. */
export function scoreNode(input: ScoreInput): ScoreResult {
  let score = 100;
  const reasons: string[] = [];

  // Gradients and shadows convert to native SVG when parseable; anything
  // unparseable falls through to the raster-required triggers below.
  const gradient = parseGradient(input.backgroundImage);
  const shadow = parseBoxShadow(input.boxShadow);
  if (gradient) {
    score = Math.min(score, 85); // stays vector, but complex
    score -= 5;
    reasons.push(
      gradient.kind === "linear"
        ? "gradient background → SVG linearGradient"
        : "gradient background → SVG radialGradient",
    );
  }
  if (shadow) {
    score = Math.min(score, 85);
    score -= 10;
    reasons.push("box shadow → feDropShadow");
  }

  // Parseable transforms convert to a native SVG matrix(); anything else
  // (matrix3d, individual functions) is a raster trigger. Identity matrices
  // (the computed no-op value) are neither.
  const transformMatrix = parseCssTransform(input.transform);
  if (transformMatrix) {
    score = Math.min(score, 85);
    score -= 10;
    reasons.push("transform → SVG matrix()");
  }

  // Supported clipping converts to a native <clipPath>; anything unparseable
  // (url(#…), path(), shape-box keywords) is a raster trigger.
  const clip = parseClipPath(input.clipPath, { x: 0, y: 0, width: 100, height: 100 });
  if (clip) {
    score = Math.min(score, 85);
    score -= 5;
    reasons.push(`clip-path → SVG ${clip.kind}`);
  }
  if (input.overflow === "hidden" || input.overflow === "clip") {
    reasons.push("overflow hidden → children clipped");
  }

  // Raster-required: rendering features that don't map to simple SVG.
  const rasterTriggers: Array<[boolean, string]> = [
    [!!input.backgroundImage && input.backgroundImage !== "none" && !gradient, "background image/gradient"],
    [!!input.filter && input.filter !== "none", "CSS filter"],
    [!!input.backdropFilter && input.backdropFilter !== "none", "backdrop filter"],
    [!!input.boxShadow && input.boxShadow !== "none" && !shadow, "box shadow"],
    [
      !!input.transform &&
        input.transform !== "none" &&
        transformMatrix === null &&
        !isIdentityCssTransform(input.transform),
      "transform (unparseable)",
    ],
    [!!input.clipPath && input.clipPath !== "none" && !clip, "clip-path"],
    [input.hasCanvas, "canvas"],
    [input.hasVideo, "video"],
    [input.hasFrame, "cross-origin frame"],
    [input.hasInlineSvg, "inline SVG icon"],
  ];
  for (const [hit, label] of rasterTriggers) {
    if (hit) {
      reasons.push(label);
      score = Math.min(score, 40);
    }
  }

  // Medium penalties.
  const sideWidths = input.borderWidths.length > 0 ? input.borderWidths : [0];
  const uniform = sideWidths.every((w) => w === sideWidths[0]);
  if (!uniform && sideWidths.some((w) => w > 0)) {
    score -= 15;
    reasons.push("non-uniform border");
  }
  if (input.opacity < 1) {
    score -= 10;
    reasons.push("opacity");
  }
  if (input.borderRadius > 0) score -= 5;

  const risk: HybridRisk = score >= 90 ? "simple-vector" : score >= 60 ? "complex-vector" : "raster-required";
  return { score: Math.max(0, score), risk, reasons };
}

/* ------------------------------------------------------------------ */
/* Stage 1: live DOM snapshot (browser only, capture time)              */
/* ------------------------------------------------------------------ */

export interface SnapshotDomOpts {
  /** Hard cap on collected nodes (blueprint §26: DOM snapshot limits). */
  maxNodes?: number;
  /** Cap on accumulated raster-fallback bytes. */
  maxFallbackBytes?: number;
  /** Cap on characters measured per text element (line-box measurement). */
  maxMeasureChars?: number;
}

const px = (v: string | null | undefined): number => {
  if (!v) return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ */
/* CSS parsing (pure — gradients and shadows → native SVG)              */
/* ------------------------------------------------------------------ */

export interface ParsedGradientStop {
  color: string;
  opacity: number;
  /** 0–1; callers resolve missing offsets. */
  offset: number | undefined;
}

export interface ParsedLinearGradient {
  kind: "linear";
  /** CSS angle, degrees (0 = toward top, clockwise). */
  angleDeg: number;
  stops: ParsedGradientStop[];
}

export interface ParsedRadialGradient {
  kind: "radial";
  cx: number;
  cy: number;
  /** 0–1, object-bounding-box units. */
  r: number;
  stops: ParsedGradientStop[];
}

export type ParsedGradient = ParsedLinearGradient | ParsedRadialGradient | null;

export interface ParsedShadow {
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

/** Split on a separator, ignoring separators inside parentheses. */
function splitTopLevel(input: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const fmt = (n: number) => Number(n.toFixed(4)).toString();

/** Parse a CSS color (hex, rgb/rgba, hsl/hsla, named) → { color, opacity }. */
export function parseCssColor(raw: string): { color: string; opacity: number } | null {
  const s = raw.trim();
  if (!s) return null;
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.replace(/./g, (c) => c + c);
    const rgb = h.slice(0, 6);
    const alpha =
      h.length >= 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { color: `#${rgb}`, opacity: clamp01(alpha) };
  }
  const fn = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/i);
  if (fn) {
    const rawInner = fn[2].trim();
    let alpha = 1;
    let nums: number[];
    if (rawInner.includes("/")) {
      // modern syntax: rgb(0 0 0 / 50%) or rgba(0 0 0 / 0.5)
      const [channels, alphaRaw] = rawInner.split("/", 2);
      const aRaw = (alphaRaw ?? "").trim().split(/\s+/)[0] ?? "";
      alpha = aRaw.endsWith("%")
        ? Number.parseFloat(aRaw) / 100
        : Number.parseFloat(aRaw);
      nums = channels
        .replace(/,/g, " ")
        .trim()
        .split(/\s+/)
        .map(Number.parseFloat);
    } else {
      // legacy comma syntax may carry alpha as a 4th channel: rgba(0, 0, 0, 0.5)
      nums = rawInner
        .replace(/,/g, " ")
        .trim()
        .split(/\s+/)
        .map(Number.parseFloat);
      if (nums.length === 4 && Number.isFinite(nums[3])) {
        alpha = nums[3];
        nums = nums.slice(0, 3);
      }
    }
    if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null;
    const a = Number.isFinite(alpha) ? alpha : 1;
    if (fn[1].toLowerCase().startsWith("rgb")) {
      return {
        color: `rgb(${Math.round(nums[0])}, ${Math.round(nums[1])}, ${Math.round(nums[2])})`,
        opacity: clamp01(a),
      };
    }
    // hsl → rgb
    const h = ((nums[0] % 360) + 360) % 360;
    const sL = clamp01(nums[1] / 100);
    const l = clamp01(nums[2] / 100);
    const c = (1 - Math.abs(2 * l - 1)) * sL;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] =
      hp < 1
        ? [c, x, 0]
        : hp < 2
          ? [x, c, 0]
          : hp < 3
            ? [0, c, x]
            : hp < 4
              ? [0, x, c]
              : hp < 5
                ? [x, 0, c]
                : [c, 0, x];
    const m = l - c / 2;
    return {
      color: `rgb(${Math.round((r1 + m) * 255)}, ${Math.round((g1 + m) * 255)}, ${Math.round((b1 + m) * 255)})`,
      opacity: clamp01(a),
    };
  }
  if (/^[a-zA-Z]+$/.test(s)) return { color: s, opacity: 1 }; // named color
  return null;
}

function parseStop(raw: string): ParsedGradientStop | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)(?:\s+(-?[\d.]+)%\s*)?$/);
  if (!m) return null;
  const color = parseCssColor(m[1]);
  if (!color) return null;
  return {
    color: color.color,
    opacity: color.opacity,
    offset: m[2] !== undefined ? clamp01(Number.parseFloat(m[2]) / 100) : undefined,
  };
}

/** Resolve missing stop offsets: first → 0, last → 1, else previous. */
function resolveStops(stops: ParsedGradientStop[]): ParsedGradientStop[] {
  const n = stops.length;
  return stops.map((s, i) => ({
    ...s,
    offset: s.offset ?? (i === 0 ? 0 : i === n - 1 ? 1 : (stops[i - 1].offset ?? 0)),
  }));
}

function parseAngle(raw: string): number | null {
  const kw: Record<string, number> = {
    "to top": 0,
    "to top right": 45,
    "to right top": 45,
    "to right": 90,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom": 180,
    "to bottom left": 225,
    "to left bottom": 225,
    "to left": 270,
    "to top left": 315,
    "to left top": 315,
  };
  const t = raw.trim().toLowerCase();
  if (kw[t] !== undefined) return kw[t];
  const m = t.match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
  if (!m) return null;
  const v = Number.parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  if (m[2] === "turn") return (v * 360) % 360;
  if (m[2] === "rad") return ((v * 180) / Math.PI) % 360;
  if (m[2] === "grad") return (v * 0.9) % 360;
  return v % 360;
}

/** Parse a single CSS gradient function. Unsupported → null (raster fallback). */
export function parseGradient(value: string | undefined | null): ParsedGradient {
  if (!value || value === "none") return null;
  const trimmed = value.trim();
  const linear = trimmed.match(/^linear-gradient\((.*)\)$/i);
  if (linear) {
    const parts = splitTopLevel(linear[1]);
    let angleDeg = 180; // CSS default: top → bottom
    let stopParts = parts;
    const angle = parseAngle(parts[0] ?? "");
    if (angle !== null) {
      angleDeg = angle;
      stopParts = parts.slice(1);
    }
    const stops = stopParts.map(parseStop);
    if (stops.length < 2 || stops.some((s) => s === null)) return null;
    return {
      kind: "linear",
      angleDeg,
      stops: resolveStops(stops as ParsedGradientStop[]),
    };
  }
  const radial = trimmed.match(/^radial-gradient\((.*)\)$/i);
  if (radial) {
    const parts = splitTopLevel(radial[1]);
    let cx = 0.5;
    let cy = 0.5;
    let stopParts = parts;
    const at = (parts[0] ?? "").match(/at\s+(-?[\d.]+)%\s+(-?[\d.]+)%/i);
    if (at) {
      cx = clamp01(Number.parseFloat(at[1]) / 100);
      cy = clamp01(Number.parseFloat(at[2]) / 100);
      stopParts = parts.slice(1);
    }
    const stops = stopParts.map(parseStop);
    if (stops.length < 2 || stops.some((s) => s === null)) return null;
    const r = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(1 - cx, cy),
      Math.hypot(cx, 1 - cy),
      Math.hypot(1 - cx, 1 - cy),
    );
    return { kind: "radial", cx, cy, r, stops: resolveStops(stops as ParsedGradientStop[]) };
  }
  return null; // conic, image urls, multiple backgrounds, var() etc.
}

/** Pull a CSS color (with balanced parens) off the front or end of a string. */
function extractShadowColor(
  s: string,
): { colorRaw: string; rest: string } | null {
  const trimmed = s.trim();
  const fn = /^(rgba?|hsla?)\(/.exec(trimmed);
  if (fn) {
    let depth = 0;
    let i = 0;
    for (; i < trimmed.length; i++) {
      if (trimmed[i] === "(") depth += 1;
      else if (trimmed[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (i >= trimmed.length) return null;
    return { colorRaw: trimmed.slice(0, i + 1), rest: trimmed.slice(i + 1).trim() };
  }
  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";
  if (
    /^#[0-9a-f]{3,8}$/i.test(last) ||
    /^[a-z]+$/i.test(last) ||
    /^(rgba?|hsla?)\([^)]*\)$/i.test(last)
  ) {
    return { colorRaw: last, rest: tokens.slice(0, -1).join(" ") };
  }
  return null;
}

/**
 * Parse a computed box-shadow into a feDropShadow-friendly shape.
 * Only a single shadow without spread is vectorizable; everything else
 * (inset, spread, multiple shadows) → null → raster fallback.
 */
export function parseBoxShadow(value: string | undefined | null): ParsedShadow | null {
  if (!value || value === "none") return null;
  const shadows = splitTopLevel(value);
  if (shadows.length !== 1) return null;
  const s = shadows[0].trim();
  if (s.includes("inset")) return null;
  const extracted = extractShadowColor(s);
  const rest = extracted ? extracted.rest : s;
  const nums: number[] = [];
  for (const t of rest.split(/\s+/).filter(Boolean)) {
    const n = Number.parseFloat(t);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (nums.length < 2) return null;
  const [dx, dy, blur = 0, spread = 0] = nums;
  if (spread !== 0) return null;
  const parsed = extracted
    ? parseCssColor(extracted.colorRaw)
    : { color: "rgba(0, 0, 0, 0.5)", opacity: 0.5 };
  if (!parsed) return null;
  return { dx, dy, blur, color: parsed.color, opacity: parsed.opacity };
}

/** Computed CSS 2D matrix coefficients (matrix(a, b, c, d, e, f)). */
export interface CssMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Parse a computed `transform` into its 2D matrix (blueprint §15 hardening:
 * basic transforms → native SVG `matrix()`). Computed transforms are always
 * `none`, `matrix(...)`, or `matrix3d(...)` — individual functions never
 * survive `getComputedStyle`. Returns null for identity/no-op matrices and
 * anything unparseable (matrix3d, garbage) so callers fall back to raster.
 */
export function parseCssTransform(value: string | undefined | null): CssMatrix | null {
  if (!value || value === "none") return null;
  const m = value.trim().match(/^matrix\(\s*([^)]+)\)$/i);
  if (!m) return null;
  const nums = m[1].split(",").map((s) => Number.parseFloat(s.trim()));
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d, e, f] = nums;
  if (isIdentityMatrix(a, b, c, d, e, f)) {
    return null; // identity — visually a no-op
  }
  return { a, b, c, d, e, f };
}

const isIdentityMatrix = (a: number, b: number, c: number, d: number, e: number, f: number): boolean =>
  Math.abs(a - 1) < 1e-6 &&
  Math.abs(b) < 1e-6 &&
  Math.abs(c) < 1e-6 &&
  Math.abs(d - 1) < 1e-6 &&
  Math.abs(e) < 1e-6 &&
  Math.abs(f) < 1e-6;

/**
 * True when the computed value is an identity `matrix(1, 0, 0, 1, 0, 0)` — a
 * no-op that must NOT be treated as a raster-required transform (unlike
 * matrix3d/unparseable values). Distinguishes the two null cases of
 * `parseCssTransform`.
 */
export function isIdentityCssTransform(value: string | undefined | null): boolean {
  const m = (value ?? "").trim().match(/^matrix\(\s*([^)]+)\)$/i);
  if (!m) return false;
  const nums = m[1].split(",").map((s) => Number.parseFloat(s.trim()));
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return false;
  return isIdentityMatrix(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
}

/** Resolve a px or % length against a reference size. Unsupported units → null. */
function resolveLength(raw: string, ref: number): number | null {
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? (n / 100) * ref : null;
  }
  if (/^-?[\d.]+(px)?$/.test(t)) {
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }
  return null; // calc(), em, rem, var()…
}

/**
 * Parse a computed CSS clip-path into a resolved shape (blueprint §15:
 * supported clipping → native SVG <clipPath>). Coordinates resolve against
 * the node's bounds into capture-rect space (clipPathUnits="userSpaceOnUse").
 * Unsupported values (url(#…), path(), shape-box keywords, calc(), degenerate
 * shapes) → null → raster fallback.
 */
export function parseClipPath(
  value: string | undefined | null,
  bounds: { x: number; y: number; width: number; height: number },
): DomClipShape | null {
  if (!value || value === "none") return null;
  const v = value.trim();
  const w = bounds.width;
  const h = bounds.height;
  const x0 = bounds.x;
  const y0 = bounds.y;

  const inset = v.match(/^inset\((.*)\)$/i);
  if (inset) {
    const tokens = inset[1].trim().split(/\s+/).filter(Boolean);
    const roundIdx = tokens.findIndex((t) => t.toLowerCase() === "round");
    const lengths = roundIdx >= 0 ? tokens.slice(0, roundIdx) : tokens;
    if (lengths.length < 1 || lengths.length > 4) return null;
    const [a, b, c, d] = lengths;
    const [top, right, bottom, left] =
      lengths.length === 1
        ? [a, a, a, a]
        : lengths.length === 2
          ? [a, b, a, b]
          : lengths.length === 3
            ? [a, b, c, b]
            : [a, b, c, d];
    const topN = resolveLength(top, h);
    const rightN = resolveLength(right, w);
    const bottomN = resolveLength(bottom, h);
    const leftN = resolveLength(left, w);
    if (topN === null || rightN === null || bottomN === null || leftN === null) return null;
    const x = x0 + leftN;
    const y = y0 + topN;
    const width = w - leftN - rightN;
    const height = h - topN - bottomN;
    if (width < 1 || height < 1) return null; // degenerate — nothing visible
    let rx = 0;
    if (roundIdx >= 0) {
      const rTok = tokens[roundIdx + 1];
      if (rTok !== undefined) {
        const rn = resolveLength(rTok, Math.min(w, h));
        if (rn === null) return null;
        rx = rn;
      }
    }
    return { kind: "rect", x, y, width, height, rx };
  }

  const circle = v.match(/^circle\((.+)\)$/i);
  if (circle) {
    const parts = circle[1].split(/\bat\b/i).map((s) => s.trim());
    const radius = parts[0] ?? "";
    const atParts = (parts[1] ?? "").split(/\s+/).filter(Boolean);
    let cx = x0 + w / 2;
    let cy = y0 + h / 2;
    if (atParts.length >= 1) {
      const cxN = resolveLength(atParts[0], w);
      if (cxN === null) return null;
      cx = x0 + cxN;
    }
    if (atParts.length >= 2) {
      const cyN = resolveLength(atParts[1], h);
      if (cyN === null) return null;
      cy = y0 + cyN;
    }
    let r: number;
    if (radius === "closest-side") r = Math.min(w, h) / 2;
    else if (radius === "farthest-side") r = Math.max(w, h) / 2;
    else if (radius.endsWith("%")) {
      const n = Number.parseFloat(radius);
      if (!Number.isFinite(n)) return null;
      // CSS Shapes: percentage circle radius = sqrt(w²+h²)/√2 of the reference box.
      r = (Math.hypot(w, h) / Math.SQRT2) * (n / 100);
    } else {
      const rn = resolveLength(radius, Math.min(w, h));
      if (rn === null) return null;
      r = rn;
    }
    return { kind: "circle", cx, cy, r };
  }

  const ellipse = v.match(/^ellipse\((.+)\)$/i);
  if (ellipse) {
    const parts = ellipse[1].split(/\bat\b/i).map((s) => s.trim());
    const radii = (parts[0] ?? "").split(/\s+/).filter(Boolean);
    const atParts = (parts[1] ?? "").split(/\s+/).filter(Boolean);
    const rxN =
      radii[0] === undefined || radii[0] === "closest-side"
        ? w / 2
        : resolveLength(radii[0], w);
    const ryN =
      radii[1] === undefined || radii[1] === "closest-side"
        ? h / 2
        : resolveLength(radii[1], h);
    if (rxN === null || ryN === null) return null;
    let cx = x0 + w / 2;
    let cy = y0 + h / 2;
    if (atParts.length >= 1) {
      const cxN = resolveLength(atParts[0], w);
      if (cxN === null) return null;
      cx = x0 + cxN;
    }
    if (atParts.length >= 2) {
      const cyN = resolveLength(atParts[1], h);
      if (cyN === null) return null;
      cy = y0 + cyN;
    }
    return { kind: "ellipse", cx, cy, rx: rxN, ry: ryN };
  }

  const polygon = v.match(/^polygon\((.+)\)$/i);
  if (polygon) {
    const pairs = splitTopLevel(polygon[1]);
    const points: Array<{ x: number; y: number }> = [];
    for (const pair of pairs) {
      const nums = pair.trim().split(/\s+/).filter(Boolean);
      if (nums.length !== 2) return null;
      const pxN = resolveLength(nums[0], w);
      const pyN = resolveLength(nums[1], h);
      if (pxN === null || pyN === null) return null;
      points.push({ x: x0 + pxN, y: y0 + pyN });
    }
    if (points.length < 3) return null;
    return { kind: "polygon", points };
  }

  return null; // url(#…), path(), shape-box keywords, calc(), etc.
}

const LANDMARK_ROLES: SemanticRole[] = [
  "banner",
  "navigation",
  "main",
  "complementary",
  "contentinfo",
  "region",
  "form",
  "search",
  "article",
];

/**
 * Derive an element's ARIA landmark role (blueprint §15 layer boundaries).
 * Explicit role attributes win; tag mapping follows the HTML landmark rules
 * (header/footer only count outside article/aside/main/nav/section, and a
 * section must carry an accessible name to be a region).
 */
export function semanticRoleOf(el: Element): SemanticRole | undefined {
  const roleAttr = el.getAttribute("role");
  if (roleAttr) {
    const r = roleAttr.trim().toLowerCase();
    if ((LANDMARK_ROLES as string[]).includes(r)) return r as SemanticRole;
  }
  switch (el.tagName.toLowerCase()) {
    case "header":
      return el.closest("article, aside, main, nav, section") ? undefined : "banner";
    case "footer":
      return el.closest("article, aside, main, nav, section") ? undefined : "contentinfo";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "aside":
      return "complementary";
    case "form":
      return "form";
    case "search":
      return "search";
    case "article":
      return "article";
    case "section":
      return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
        ? "region"
        : undefined;
    default:
      return undefined;
  }
}

function intersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function cropCanvasDataUrl(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  quality = 0.9,
): string {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width));
  out.height = Math.max(1, Math.round(height));
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.drawImage(source, x, y, out.width, out.height, 0, 0, out.width, out.height);
  }
  return out.toDataURL("image/png", quality);
}

function ownText(el: Element): string | undefined {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Split text into line-break boundaries using only a `lineTopOf(offset)`
 * probe (pure — the DOM wrapper supplies real rect tops). Binary search per
 * line: each line ends at the first offset whose top differs by ≥ 0.5px.
 */
export function findLineBreaks(
  lineTopOf: (offset: number) => number,
  length: number,
): Array<{ start: number; end: number }> {
  const breaks: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < length) {
    const lineTop = lineTopOf(cursor);
    let lo = cursor + 1;
    let hi = length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Math.abs(lineTopOf(mid) - lineTop) < 0.5) lo = mid + 1;
      else hi = mid;
    }
    breaks.push({ start: cursor, end: lo });
    cursor = lo;
  }
  return breaks;
}

/**
 * Measure the browser's actual line boxes for an element's direct text:
 * per-line text + position. Returns undefined when measurement is skipped
 * (no text, oversized) so the caller falls back to approximation.
 */
function measureTextLines(
  el: HTMLElement,
  origin: { x: number; y: number },
  maxChars: number,
): Array<{ text: string; x: number; y: number; width: number; height: number }> | undefined {
  const textNodes = Array.from(el.childNodes).filter(
    (n): n is Text => n.nodeType === Node.TEXT_NODE,
  );
  if (textNodes.length === 0) return undefined;
  const range = document.createRange();
  const topOf = (tn: Text, offset: number): number => {
    const k = Math.min(offset, Math.max(0, tn.length - 1));
    range.setStart(tn, k);
    range.setEnd(tn, k + 1);
    return range.getBoundingClientRect().top;
  };
  const out: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
  let total = 0;
  for (const tn of textNodes) {
    const len = tn.length;
    total += len;
    if (total > maxChars) return undefined; // too large to measure — fall back
    if (len === 0 || !tn.data.trim()) continue;
    const breaks = findLineBreaks((offset) => topOf(tn, offset), len);
    for (const { start, end } of breaks) {
      const text = tn.data.slice(start, end).replace(/\s+$/, "");
      if (!text) continue;
      range.setStart(tn, start);
      range.setEnd(tn, end);
      const rect = range.getBoundingClientRect();
      out.push({
        text,
        x: rect.left - origin.x,
        y: rect.top - origin.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Walk the live demo DOM and produce a self-contained snapshot.
 * `rect` is the captured region in content CSS px; `rasterCanvas` is the
 * captured raster for that region (device px). Node coordinates are
 * rect-relative, matching the SVG canvas.
 */
export function snapshotDom(
  root: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
  scale: number,
  rasterCanvas: HTMLCanvasElement,
  opts: SnapshotDomOpts = {},
): DomSnapshot {
  const maxNodes = opts.maxNodes ?? 2_000;
  const maxFallbackBytes = opts.maxFallbackBytes ?? 8 * 1024 * 1024;
  const nodes: DomSnapshotNode[] = [];
  const warnings: string[] = [];
  const rootRect = root.getBoundingClientRect();
  let truncated = false;
  let fallbackBytes = 0;
  let nodeIndex = 0;

  // Element → snapshot id, so each node can record its nearest snapshot
  // ancestor (the DOM tree survives into the SVG for semantic groups and
  // overflow/clip-path clipping).
  const nodeIdByEl = new Map<Element, string>();
  const parentIdOf = (target: Element): string | undefined => {
    let p = target.parentElement;
    while (p) {
      const pid = nodeIdByEl.get(p);
      if (pid) return pid;
      p = p.parentElement;
    }
    return undefined;
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let el: HTMLElement | null = walker.currentNode as HTMLElement | null;
  while (el && nodes.length < maxNodes) {
    if (el.nodeType === Node.ELEMENT_NODE && el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0";
      const er = el.getBoundingClientRect();
      const bounds = intersect(
        {
          x: er.left - rootRect.left,
          y: er.top - rootRect.top,
          width: er.width,
          height: er.height,
        },
        rect,
      );
      if (visible && bounds) {
        const tag = el.tagName.toLowerCase();
        const borderWidths = [
          px(style.borderTopWidth),
          px(style.borderRightWidth),
          px(style.borderBottomWidth),
          px(style.borderLeftWidth),
        ];
        const borderWidth = Math.max(...borderWidths);
        const hasChildCanvas = el.querySelector("canvas") !== null;
        const hasChildVideo = el.querySelector("video") !== null;
        const hasChildFrame =
          el.querySelector("iframe, frame, object, embed") !== null;
        const hasChildSvg = el.querySelector("svg") !== null;
        const text = ownText(el);

        const scored = scoreNode({
          tag,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderWidths,
          borderRadius: px(style.borderRadius),
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          transform: style.transform,
          boxShadow: style.boxShadow,
          clipPath: style.clipPath,
          overflow: style.overflow,
          opacity: px(style.opacity),
          hasCanvas: tag === "canvas" || hasChildCanvas,
          hasVideo: tag === "video" || hasChildVideo,
          hasFrame: hasChildFrame,
          hasInlineSvg: tag === "svg" || hasChildSvg,
          hasText: !!text,
        });

        // Computed transform → native SVG matrix() for leaf nodes. The
        // computed matrix maps the element's local border-box coordinates
        // (transform-origin is already folded in), so we record the
        // pre-transform size (offsetWidth/offsetHeight) and draw the node's
        // own rendering at (0, 0, w, h) under the matrix. Transformed
        // containers (element children) and overflow-clipped regions stay
        // raster crops: children are already measured at their post-transform
        // page positions, and a rotated overflow clip can't be rebuilt from
        // the axis-aligned bbox.
        const transformMatrix = parseCssTransform(style.transform);
        const overflowClips =
          style.overflow.includes("hidden") || style.overflow.includes("clip");
        const hasElementChildren = el.children.length > 0;
        const forceRasterTransform =
          !!transformMatrix && (hasElementChildren || overflowClips);
        const transform: ParsedTransform | undefined =
          transformMatrix && !forceRasterTransform
            ? {
                a: transformMatrix.a,
                b: transformMatrix.b,
                c: transformMatrix.c,
                d: transformMatrix.d,
                e: transformMatrix.e,
                f: transformMatrix.f,
                width: el.offsetWidth || er.width,
                height: el.offsetHeight || er.height,
              }
            : undefined;

        // Explicit clip-path → native <clipPath>; overflow hidden/clip clips
        // children to this node's rect. Both are capture-rect coordinates —
        // except for transformed nodes, where clip-path applies to the local
        // border box before the transform (so it's resolved against local
        // geometry and the clip rides inside the matrix group).
        const rectRelBounds = {
          x: bounds.x - rect.x,
          y: bounds.y - rect.y,
          width: bounds.width,
          height: bounds.height,
        };
        const clipShape =
          parseClipPath(
            style.clipPath,
            transform ? { x: 0, y: 0, width: transform.width, height: transform.height } : rectRelBounds,
          ) ?? undefined;
        const clipsChildren = overflowClips && !clipShape; // an explicit clip on the group already covers children

        let kind: DomSnapshotNode["kind"] = "block";
        let imgSrc: string | undefined;
        let fallbackDataUrl: string | undefined;

        if (tag === "img") {
          const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
          if (src.startsWith("data:")) {
            kind = "image";
            imgSrc = src;
          } else {
            kind = "raster";
          }
        } else if (scored.risk === "raster-required" || forceRasterTransform) {
          kind = "raster";
        } else if (text) {
          kind = "text";
        }

        // A forced-raster transform node is a real raster fallback — keep the
        // report honest (risk + reason) even though the score stayed vector.
        const risk: HybridRisk = forceRasterTransform ? "raster-required" : scored.risk;
        const reasons: string[] = forceRasterTransform
          ? [
              ...scored.reasons,
              "transform + child content → rasterized (native transform can't carry children)",
            ]
          : scored.reasons;

        if (kind === "raster") {
          const crop = cropCanvasDataUrl(
            rasterCanvas,
            (bounds.x - rect.x) * scale,
            (bounds.y - rect.y) * scale,
            bounds.width * scale,
            bounds.height * scale,
          );
          if (fallbackBytes + crop.length > maxFallbackBytes) {
            warnings.push("Raster-fallback budget exceeded — remaining complex regions skipped");
          } else {
            fallbackBytes += crop.length;
            fallbackDataUrl = crop;
          }
        }

        // Measured line boxes: exact browser wraps for multi-line text.
        let lines: DomSnapshotNode["lines"];
        if (kind === "text" && text) {
          const measured = measureTextLines(
            el,
            { x: rootRect.left, y: rootRect.top },
            opts.maxMeasureChars ?? 4_000,
          );
          if (measured && measured.length >= 2) {
            lines = measured.map((l) => ({
              text: l.text,
              x: Math.round(l.x - rect.x),
              y: Math.round(l.y - rect.y),
              width: Math.round(l.width),
              height: Math.round(l.height),
            }));
          }
        }

        const textAlign =
          style.textAlign === "center" || style.textAlign === "right"
            ? style.textAlign
            : "left";

        const nodeId = `n-${nodeIndex++}`;
        nodeIdByEl.set(el, nodeId);
        nodes.push({
          id: nodeId,
          parentId: parentIdOf(el),
          role: semanticRoleOf(el),
          clipShape,
          clipsChildren,
          tag,
          kind,
          bounds: {
            x: Math.round(rectRelBounds.x),
            y: Math.round(rectRelBounds.y),
            width: Math.round(rectRelBounds.width),
            height: Math.round(rectRelBounds.height),
          },
          styles: {
            display: style.display,
            position: style.position,
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderWidth,
            borderRadius: Math.round(px(style.borderRadius)),
            opacity: px(style.opacity),
            fontFamily: style.fontFamily,
            fontSize: px(style.fontSize) || undefined,
            fontWeight: style.fontWeight,
            lineHeight: px(style.lineHeight) || undefined,
            textAlign,
            backgroundImage: style.backgroundImage !== "none" ? style.backgroundImage : undefined,
            boxShadow: style.boxShadow !== "none" ? style.boxShadow : undefined,
            overflow:
              style.overflow !== "visible" ? style.overflow : undefined,
            transform:
              style.transform !== "none" ? style.transform : undefined,
          },
          text,
          lines,
          imgSrc,
          fallbackDataUrl,
          score: scored.score,
          risk,
          reasons,
          transform,
        });
      }
    }
    el = walker.nextNode() as HTMLElement | null;
  }
  if (nodes.length >= maxNodes) {
    truncated = true;
    warnings.push(`Snapshot truncated at ${maxNodes} nodes`);
  }
  return {
    canvas: { width: Math.round(rect.width), height: Math.round(rect.height) },
    nodes,
    truncated,
    warnings: warnings.slice(0, 20),
  };
}

/* ------------------------------------------------------------------ */
/* Stage 2: snapshot → hybrid SVG (pure)                                */
/* ------------------------------------------------------------------ */

export interface BuildHybridSvgOptions {
  doc: CaptureDocument;
  model: CaptureMetadataModel;
  annotations: Annotation[];
}

function isTransparent(color: string): boolean {
  return (
    !color ||
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color === "rgba(0,0,0,0)"
  );
}

function textAnchorOf(align?: string): string {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}

/**
 * The box a node's own vector rendering occupies: the local border box under
 * a native transform, or the capture-rect bounds. Raster crops are excluded —
 * they're cut from the post-transform bbox and must stay put.
 */
function renderRectOf(n: DomSnapshotNode): { x: number; y: number; width: number; height: number } {
  if (n.transform) return { x: 0, y: 0, width: n.transform.width, height: n.transform.height };
  return n.bounds;
}

function textX(n: DomSnapshotNode): number {
  const r = renderRectOf(n);
  const align = n.styles.textAlign;
  if (align === "center") return r.x + r.width / 2;
  if (align === "right") return r.x + r.width;
  return r.x;
}

export interface NodeUrls {
  /** url(#id) fill for a gradient background, if any. */
  fill?: string;
  /** url(#id) filter for a box shadow, if any. */
  filter?: string;
}

/** Gradient → <linearGradient>/<radialGradient> defs for a node (or none). */
export function gradientDefs(n: DomSnapshotNode): { defs: string; fillUrl?: string } {
  const gradient = parseGradient(n.styles.backgroundImage);
  if (!gradient) return { defs: "" };
  const id = `hybrid-grad-${n.id}`;
  const stops = gradient.stops
    .map(
      (s) =>
        `    <stop offset="${fmt(s.offset ?? 0)}" stop-color="${escapeXml(s.color)}"${s.opacity < 1 ? ` stop-opacity="${fmt(s.opacity)}"` : ""}/>`,
    )
    .join("\n");
  if (gradient.kind === "linear") {
    const rad = (gradient.angleDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    return {
      defs: `  <linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${fmt(0.5 - dx / 2)}" y1="${fmt(0.5 - dy / 2)}" x2="${fmt(0.5 + dx / 2)}" y2="${fmt(0.5 + dy / 2)}">\n${stops}\n  </linearGradient>`,
      fillUrl: `url(#${id})`,
    };
  }
  return {
    defs: `  <radialGradient id="${id}" gradientUnits="objectBoundingBox" cx="${fmt(gradient.cx)}" cy="${fmt(gradient.cy)}" r="${fmt(gradient.r)}">\n${stops}\n  </radialGradient>`,
    fillUrl: `url(#${id})`,
  };
}

/** Box shadow → <feDropShadow> filter def for a node (or none). */
export function shadowDefs(n: DomSnapshotNode): { defs: string; filterUrl?: string } {
  const shadow = parseBoxShadow(n.styles.boxShadow);
  if (!shadow) return { defs: "" };
  const id = `hybrid-shadow-${n.id}`;
  return {
    defs: `  <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">\n    <feDropShadow dx="${fmt(shadow.dx)}" dy="${fmt(shadow.dy)}" stdDeviation="${fmt(shadow.blur / 2)}" flood-color="${escapeXml(shadow.color)}" flood-opacity="${fmt(shadow.opacity)}"/>\n  </filter>`,
    filterUrl: `url(#${id})`,
  };
}

/** Convert one snapshot node to its own renderable SVG content (no <g> wrapper). */
function ownNodeXml(n: DomSnapshotNode, urls: NodeUrls = {}): string {
  const { x, y, width, height } = n.fallbackDataUrl ? n.bounds : renderRectOf(n);

  // Raster fallbacks and embedded images.
  if (n.fallbackDataUrl) {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${n.fallbackDataUrl}" preserveAspectRatio="none"/>`;
  }
  if (n.imgSrc) {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${n.imgSrc}" preserveAspectRatio="none"/>`;
  }

  // Vector background (solid fill, or url(#gradient) when present).
  const parts: string[] = [];
  const bg = n.styles.backgroundColor;
  if ((!isTransparent(bg) || urls.fill) && n.kind === "block") {
    const attrs = [
      `x="${x}"`,
      `y="${y}"`,
      `width="${width}"`,
      `height="${height}"`,
      `rx="${n.styles.borderRadius}"`,
      urls.fill ? `fill="${urls.fill}"` : `fill="${escapeXml(bg)}"`,
    ];
    if (n.styles.borderWidth > 0 && !isTransparent(n.styles.borderColor)) {
      attrs.push(
        `stroke="${escapeXml(n.styles.borderColor)}"`,
        `stroke-width="${n.styles.borderWidth}"`,
      );
    }
    if (urls.filter) attrs.push(`filter="${urls.filter}"`);
    parts.push(`<rect ${attrs.join(" ")}/>`);
  }

  // Browser text (raster-required nodes are covered by their fallback image).
  if (n.text && n.risk !== "raster-required") {
    const baseFont = [
      `font-family="${escapeXml(n.styles.fontFamily ?? "system-ui, sans-serif")}"`,
      `font-size="${n.styles.fontSize ?? 14}"`,
      n.styles.fontWeight ? `font-weight="${escapeXml(String(n.styles.fontWeight))}"` : "",
      `fill="${escapeXml(n.styles.color)}"`,
    ]
      .filter(Boolean)
      .join(" ");
    // Measured line boxes (exact browser wraps, blueprint §15): one <text>
    // per line at its measured position. Anchor is start because x is the
    // line's true left edge, even for centered/right-aligned paragraphs.
    // Measured positions are page-space — only valid without a transform;
    // transformed text falls back to local-space placement.
    if (n.lines && n.lines.length >= 2 && !n.transform) {
      for (const line of n.lines) {
        parts.push(
          `<text x="${line.x}" y="${line.y}" dominant-baseline="text-before-edge" text-anchor="start" ${baseFont}>${escapeXml(line.text)}</text>`,
        );
      }
    } else {
      const font = `${baseFont} text-anchor="${textAnchorOf(n.styles.textAlign)}"`;
      const lines = n.text.split("\n");
      const lineHeight = n.styles.lineHeight ?? Math.round((n.styles.fontSize ?? 14) * 1.2);
      if (lines.length === 1) {
        parts.push(
          `<text x="${textX(n)}" y="${y}" dominant-baseline="text-before-edge" ${font}>${escapeXml(n.text)}</text>`,
        );
      } else {
        const tspans = lines
          .map(
            (line, i) =>
              `      <tspan x="${textX(n)}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
          )
          .join("\n");
        parts.push(
          `<text x="${textX(n)}" y="${y}" dominant-baseline="text-before-edge" ${font}>\n${tspans}\n    </text>`,
        );
      }
    }
  }

  return parts.join("\n");
}

/** Convert one snapshot node to a standalone <g> (flat — no child nesting). */
export function hybridNodeToXml(n: DomSnapshotNode, urls: NodeUrls = {}): string {
  const own = ownNodeXml(n, urls);
  if (!own) return "";
  const transformAttr =
    n.transform && !n.fallbackDataUrl
      ? ` transform="matrix(${fmt(n.transform.a)} ${fmt(n.transform.b)} ${fmt(n.transform.c)} ${fmt(n.transform.d)} ${fmt(n.transform.e)} ${fmt(n.transform.f)})"`
      : "";
  return `<g data-hybrid-region="${n.id}" data-hybrid-kind="${n.kind}" data-hybrid-risk="${n.risk}"${transformAttr}>\n${indentLines(own, 2)}\n  </g>`;
}

/* ------------------------------------------------------------------ */
/* Semantic region groups + clipping (blueprint §15 layer boundaries)   */
/* ------------------------------------------------------------------ */

const indentLines = (s: string, n: number): string =>
  s
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");

function clipShapeXml(shape: DomClipShape): string {
  switch (shape.kind) {
    case "rect": {
      const attrs = [
        `x="${fmt(shape.x)}"`,
        `y="${fmt(shape.y)}"`,
        `width="${fmt(shape.width)}"`,
        `height="${fmt(shape.height)}"`,
      ];
      if (shape.rx > 0) attrs.push(`rx="${fmt(shape.rx)}"`);
      return `<rect ${attrs.join(" ")}/>`;
    }
    case "circle":
      return `<circle cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" r="${fmt(shape.r)}"/>`;
    case "ellipse":
      return `<ellipse cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" rx="${fmt(shape.rx)}" ry="${fmt(shape.ry)}"/>`;
    case "polygon":
      return `<polygon points="${shape.points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ")}"/>`;
  }
}

/** Clip applied to the node's own rendering: explicit clip-path, or an image's border-radius. */
function ownClipFor(n: DomSnapshotNode): DomClipShape | undefined {
  if (n.clipShape) return n.clipShape;
  if (n.kind === "image" && n.styles.borderRadius > 0) {
    const { x, y, width, height } = renderRectOf(n);
    return { kind: "rect", x, y, width, height, rx: n.styles.borderRadius };
  }
  return undefined;
}

/** <clipPath> defs for a node's own clip and/or its overflow-clipped children. */
function clipDefsFor(n: DomSnapshotNode): string[] {
  const ownClip = ownClipFor(n);
  if (ownClip) {
    return [`  <clipPath id="clip-${n.id}" clipPathUnits="userSpaceOnUse">${clipShapeXml(ownClip)}</clipPath>`];
  }
  if (n.clipsChildren) {
    const { x, y, width, height } = n.bounds;
    const rx = n.styles.borderRadius > 0 ? ` rx="${n.styles.borderRadius}"` : "";
    return [`  <clipPath id="clip-children-${n.id}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${width}" height="${height}"${rx}/></clipPath>`];
  }
  return [];
}

interface RenderContext {
  childrenByParent: Map<string, DomSnapshotNode[]>;
  urlCache: Map<string, NodeUrls>;
  /** role → how many region groups already opened (unique ids: region-main-2 …). */
  regionCounters: Map<string, number>;
}

/**
 * Render a snapshot node and its descendants as nested SVG groups. Landmark
 * roles become semantic region groups (`<g id="region-…" data-role="…">`,
 * blueprint §15); explicit clip-paths and overflow-hidden parents become
 * `<clipPath>`-clipped groups; nodes with nothing renderable are flattened.
 */
function renderNode(n: DomSnapshotNode, ctx: RenderContext): string {
  const childrenXml = (ctx.childrenByParent.get(n.id) ?? [])
    .map((c) => renderNode(c, ctx))
    .filter(Boolean)
    .join("\n");
  const own = ownNodeXml(n, ctx.urlCache.get(n.id) ?? {});
  const ownClip = ownClipFor(n);
  const wrapChildren = n.clipsChildren && !ownClip && childrenXml.length > 0;
  const landmark = n.role;
  if (!own && !childrenXml && !landmark && !ownClip && !wrapChildren) {
    return childrenXml; // nothing renderable — flatten
  }

  // Raster crops are already in post-transform page space — never transform
  // them again. Native transforms apply only to the node's own vector
  // rendering (transformed containers were rasterized at snapshot time).
  const applyTransform = !!n.transform && !n.fallbackDataUrl;

  const attrs: string[] = [
    `data-hybrid-region="${n.id}"`,
    `data-hybrid-kind="${n.kind}"`,
    `data-hybrid-risk="${n.risk}"`,
  ];
  if (landmark) {
    const idx = ctx.regionCounters.get(landmark) ?? 0;
    ctx.regionCounters.set(landmark, idx + 1);
    attrs.unshift(
      `id="region-${landmark}${idx === 0 ? "" : `-${idx + 1}`}"`,
      `data-role="${landmark}"`,
    );
  }
  if (ownClip && !applyTransform) attrs.push(`clip-path="url(#clip-${n.id})"`);
  if (applyTransform) {
    const t = n.transform as ParsedTransform;
    attrs.push(
      `transform="matrix(${fmt(t.a)} ${fmt(t.b)} ${fmt(t.c)} ${fmt(t.d)} ${fmt(t.e)} ${fmt(t.f)})"`,
    );
  }

  const blocks: string[] = [];
  if (own) {
    let inner = indentLines(own, 2);
    if (ownClip && applyTransform) {
      // Clip-path applies to the local border box (pre-transform): nest the
      // clip inside the matrix group so userSpaceOnUse coords stay local.
      inner = indentLines(`<g clip-path="url(#clip-${n.id})">\n${inner}\n  </g>`, 2);
    }
    blocks.push(inner);
  }
  if (wrapChildren) {
    blocks.push(
      indentLines(
        `<g clip-path="url(#clip-children-${n.id})">\n${indentLines(childrenXml, 2)}\n  </g>`,
        2,
      ),
    );
  } else if (childrenXml) {
    blocks.push(indentLines(childrenXml, 2));
  }
  return `<g ${attrs.join(" ")}>\n${blocks.join("\n")}\n  </g>`;
}

/** Build the full hybrid SVG: base vector content + metadata + annotations. */
export function buildHybridSvg(
  snapshot: DomSnapshot,
  opts: BuildHybridSvgOptions,
): string {
  const { doc, model, annotations } = opts;
  const meta = buildMetadataXml({ doc, model, outputMode: "hybrid" });

  // Rebuild the DOM tree from the flat snapshot (parentId links).
  const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const childrenByParent = new Map<string, DomSnapshotNode[]>();
  const roots: DomSnapshotNode[] = [];
  for (const n of snapshot.nodes) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) {
      const arr = childrenByParent.get(parent.id) ?? [];
      arr.push(n);
      childrenByParent.set(parent.id, arr);
    } else {
      roots.push(n);
    }
  }

  // Collect gradient/shadow/clip defs and per-node url() refs.
  const defs: string[] = [];
  const urlCache = new Map<string, NodeUrls>();
  for (const n of snapshot.nodes) {
    const grad = gradientDefs(n);
    const shadow = shadowDefs(n);
    if (grad.defs) defs.push(grad.defs);
    if (shadow.defs) defs.push(shadow.defs);
    urlCache.set(n.id, { fill: grad.fillUrl, filter: shadow.filterUrl });
    defs.push(...clipDefsFor(n));
  }

  const ctx: RenderContext = {
    childrenByParent,
    urlCache,
    regionCounters: new Map(),
  };
  const base = indentLines(
    roots.map((r) => renderNode(r, ctx)).filter(Boolean).join("\n"),
    2,
  );
  const allDefs = [buildDefsInner(annotations), ...defs].filter(Boolean).join("\n");
  const annotationsXml = annotationsToXml(annotations);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${snapshot.canvas.width}" height="${snapshot.canvas.height}" viewBox="0 0 ${snapshot.canvas.width} ${snapshot.canvas.height}" role="img" aria-labelledby="capture-title capture-description">
  <title id="capture-title">${escapeXml(model.title)}</title>
  <desc id="capture-description">${escapeXml(model.description)}</desc>
${meta ? meta + "\n" : ""}  <g id="base-capture">
${base || "    <!-- No convertible regions in this snapshot -->"}
  </g>
${allDefs ? `  <defs>\n${allDefs}\n  </defs>\n` : ""}  <g id="annotations">
${annotationsXml || "    <!-- Annotate your capture in the editor -->"}
  </g>
</svg>
`;
}

/* ------------------------------------------------------------------ */
/* Machine-readable export report (§15, §28)                            */
/* ------------------------------------------------------------------ */

export interface SummarizeSnapshotOptions {
  /** Destructive redaction regions (doc.redactions) reported as `redacted` regions. */
  redactions?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}

export function summarizeSnapshot(snapshot: DomSnapshot, opts: SummarizeSnapshotOptions = {}): HybridReport {
  const counts = {
    vectorRects: 0,
    vectorTexts: 0,
    embeddedImages: 0,
    rasterFallbacks: 0,
    semanticGroups: 0,
    redacted: 0,
  };
  const regions: HybridRegionReport[] = [];

  for (const n of snapshot.nodes) {
    const representation: HybridRegionReport["representation"] =
      n.risk === "raster-required" || n.fallbackDataUrl
        ? "raster-fallback"
        : n.kind === "image"
          ? "embedded-image"
          : n.text
            ? "browser-text"
            : "vector";
    const fidelity: HybridRegionReport["fidelity"] =
      n.risk === "simple-vector" ? "high" : n.risk === "complex-vector" ? "medium" : "approximate";

    if (n.fallbackDataUrl) counts.rasterFallbacks += 1;
    else if (n.kind === "image") counts.embeddedImages += 1;
    else if (n.text) counts.vectorTexts += 1;
    else counts.vectorRects += 1;
    if (n.role) counts.semanticGroups += 1;

    const warnings: string[] = [];
    if (n.risk === "raster-required") {
      warnings.push(
        n.fallbackDataUrl
          ? "region rasterized (unsupported rendering features)"
          : "region skipped (raster-fallback budget exceeded)",
      );
    } else if (n.risk === "complex-vector") {
      warnings.push(
        ...(n.reasons && n.reasons.length
          ? n.reasons.slice(0, 2)
          : ["converted to vector with reduced fidelity"]),
      );
    }
    regions.push({
      id: n.id,
      tag: n.tag,
      representation,
      bounds: n.bounds,
      fidelity,
      ...(n.role ? { role: n.role } : {}),
      warnings,
    });
  }

  // Destructive redactions are a first-class report class: the region is no
  // longer the underlying page, it is an irrecoverable edit (blueprint §15).
  for (const r of opts.redactions ?? []) {
    counts.redacted += 1;
    regions.push({
      id: `redact-${r.id}`,
      tag: "redaction",
      representation: "redacted",
      bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
      fidelity: "high",
      warnings: ["destructive redaction applied — underlying pixels are irrecoverable"],
    });
  }

  return {
    counts,
    totalNodes: snapshot.nodes.length,
    truncated: snapshot.truncated,
    warnings: snapshot.warnings,
    regions,
  };
}
