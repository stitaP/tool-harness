/**
 * Capture engine — core types. Mirrors the data structures from the
 * capture-engine blueprint: capture request, job lifecycle states, capture
 * document, annotation model, and validation reports.
 */

/* ------------------------------------------------------------------ */
/* Capture request                                                      */
/* ------------------------------------------------------------------ */

export type CaptureMode = "viewport" | "full-page" | "region" | "element";
export type RasterFormat = "png" | "webp";
export type OutputMode = "portable" | "hybrid" | "native-vector";

export interface CaptureRequest {
  source: {
    type: "demo" | "url";
    url?: string;
    /** CSS selector — element capture mode (demo source only). */
    selector?: string;
  };
  mode: CaptureMode;
  /** Page coordinates in CSS px — region capture mode. */
  region?: { x: number; y: number; width: number; height: number };
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  readiness: {
    strategy: "dom-content-loaded" | "load" | "network-idle" | "selector" | "manual";
    additionalDelayMs: number;
    timeoutMs: number;
    /** CSS selector waited for when `strategy` is "selector". */
    selector?: string;
  };
  scrolling: {
    stepRatio: number;
    delayMs: number;
    maximumHeight: number;
    maximumPasses: number;
  };
  output: {
    mode: OutputMode;
    rasterFormat: RasterFormat;
    quality: number;
    includeMetadata: boolean;
  };
  privacy: {
    includeSourceUrl: boolean;
    includeTimestamp: boolean;
    detectSensitiveData: boolean;
    removeFormValues: boolean;
  };
  intelligence: {
    /**
     * Run OCR/text extraction inside the capture engine and persist the
     * result in the capture document (`CaptureDocument.ocr`). Demo captures
     * use live-DOM text (instant, no download); raster-only captures run
     * on-device tesseract OCR. Feeds alt text, the search index and the
     * sensitive-data scan without a second pass.
     */
    ocrAtCapture: boolean;
  };
}

/** Normalize a raw request: coerce numbers, clamp limits, make it immutable. */
export function normalizeRequest(raw: Partial<CaptureRequest>): CaptureRequest {
  const clamp = (n: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(n) || min));
  const rawRegion = raw.region;
  const region =
    rawRegion &&
    Number.isFinite(rawRegion.x) &&
    Number.isFinite(rawRegion.y) &&
    Number.isFinite(rawRegion.width) &&
    Number.isFinite(rawRegion.height)
      ? {
          x: Math.max(0, Math.round(rawRegion.x)),
          y: Math.max(0, Math.round(rawRegion.y)),
          width: Math.min(20_000, Math.max(1, Math.round(rawRegion.width))),
          height: Math.min(50_000, Math.max(1, Math.round(rawRegion.height))),
        }
      : undefined;
  return {
    source: {
      type: raw.source?.type === "url" ? "url" : "demo",
      url: raw.source?.type === "url" ? raw.source.url?.slice(0, 2048) : undefined,
      selector:
        typeof raw.source?.selector === "string" && raw.source.selector.trim()
          ? raw.source.selector.slice(0, 500)
          : undefined,
    },
    mode:
      raw.mode === "viewport" || raw.mode === "region" || raw.mode === "element"
        ? raw.mode
        : "full-page",
    region,
    viewport: {
      width: clamp(raw.viewport?.width ?? 1440, 320, 4000),
      height: clamp(raw.viewport?.height ?? 900, 320, 4000),
      deviceScaleFactor: Math.min(3, Math.max(1, Math.round(raw.viewport?.deviceScaleFactor ?? 1))),
    },
    readiness: {
      strategy: raw.readiness?.strategy ?? "load",
      additionalDelayMs: clamp(raw.readiness?.additionalDelayMs ?? 200, 0, 10_000),
      timeoutMs: clamp(raw.readiness?.timeoutMs ?? 30_000, 2_000, 120_000),
      selector: raw.readiness?.selector?.trim() || undefined,
    },
    scrolling: {
      stepRatio: Math.min(0.85, Math.max(0.4, raw.scrolling?.stepRatio ?? 0.8)),
      delayMs: clamp(raw.scrolling?.delayMs ?? 180, 0, 3_000),
      maximumHeight: clamp(raw.scrolling?.maximumHeight ?? 100_000, 2_000, 500_000),
      maximumPasses: clamp(raw.scrolling?.maximumPasses ?? 40, 1, 200),
    },
    output: {
      mode: raw.output?.mode === "portable" ? "portable" : "portable",
      rasterFormat: raw.output?.rasterFormat === "png" ? "png" : "webp",
      quality: Math.min(1, Math.max(0.5, raw.output?.quality ?? 0.92)),
      includeMetadata: raw.output?.includeMetadata ?? true,
    },
    privacy: {
      includeSourceUrl: raw.privacy?.includeSourceUrl ?? true,
      includeTimestamp: raw.privacy?.includeTimestamp ?? true,
      detectSensitiveData: raw.privacy?.detectSensitiveData ?? false,
      removeFormValues: raw.privacy?.removeFormValues ?? true,
    },
    intelligence: {
      ocrAtCapture: raw.intelligence?.ocrAtCapture ?? true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Capture job lifecycle (blueprint §3)                                 */
/* ------------------------------------------------------------------ */

export const JOB_STATUSES = [
  "created",
  "validating-request",
  "waiting-for-permission",
  "allocating-browser",
  "navigating",
  "waiting-for-page",
  "discovering-page",
  "preparing-page",
  "loading-lazy-content",
  "freezing-page",
  "capturing",
  "processing",
  "generating-svg",
  "sanitizing",
  "validating",
  "saving",
  "completed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobTerminalStatus =
  | "failed"
  | "cancelled"
  | "timed-out"
  | "blocked-by-policy";

export type StageState = "pending" | "active" | "done" | "failed" | "skipped";

export interface JobStage {
  name: JobStatus;
  state: StageState;
  durationMs: number;
  diagnostics: string[];
  warnings: string[];
  /** internal: performance.now() when the stage became active */
  _startedAt?: number;
}

export interface CaptureJobState {
  id: string;
  phase: JobStatus | JobTerminalStatus;
  stages: JobStage[];
  startedAt: number;
  endedAt?: number;
  error?: string;
  errorCode?: string;
}

/* ------------------------------------------------------------------ */
/* Capture document (blueprint §14)                                     */
/* ------------------------------------------------------------------ */

export interface RasterTile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string; // data:image/png|webp;base64,…
}

export interface RedactionRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  verified: boolean;
  appliedAt: string;
}

/** A line of text captured at capture time (blueprint §16/§14 ocrLayers). */
export type OcrLayerSource = "ocr" | "dom";

export interface OcrLayer {
  text: string;
  confidence: number;
  /** Document coordinates in CSS px (capture-rect space). Null for DOM-derived layers without a resolved box. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  source: OcrLayerSource;
}

/**
 * OCR-at-capture result persisted on the capture document (§14 ocrLayers).
 * Demo captures use the live DOM (no model); raster-only captures run
 * on-device tesseract OCR over the base tiles.
 */
export interface CaptureOcrState {
  status: "ok" | "failed" | "none";
  /** What produced the layers: "tesseract", "dom", "hybrid-dom", … */
  engine: string;
  layers: OcrLayer[];
  /** Flattened text (capped at capture) — search, alt text, sensitive scan. */
  text: string;
  /** True when the layer/text caps were applied (very tall pages). */
  truncated?: boolean;
}

export interface CaptureDocument {
  documentId: string;
  canvas: {
    width: number;
    height: number;
    background: string;
  };
  source: {
    title: string;
    url?: string;
    capturedAt: string;
    mode: CaptureMode;
    /** Human-readable capture target for element/region modes (metadata only). */
    target?: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };
  baseLayers: RasterTile[];
  /**
   * OCR-at-capture text layers (blueprint §14) — set when the capture ran
   * with `intelligence.ocrAtCapture`. Consumed by the Intelligence tab, the
   * search index, alt-text heuristics and the sensitive-data scan.
   */
  ocr?: CaptureOcrState;
  /** True once a secure (destructive) redaction has been applied. */
  redacted?: boolean;
  /** Audit trail of applied redactions. */
  redactions?: RedactionRegion[];
  warnings: string[];
}

export interface CaptureJobResult {
  document: CaptureDocument;
  svg: string;
  report: ValidationReport;
  /**
   * Hybrid SVG source snapshot (blueprint §15). Demo captures only — the
   * engine snapshots the live DOM plus raster-fallback crops at capture time.
   * In-memory only, never persisted to the library.
   */
  hybrid?: { snapshot: DomSnapshot; report: HybridReport };
}

/* ------------------------------------------------------------------ */
/* Hybrid SVG (blueprint §15: DOM → SVG conversion)                    */
/* ------------------------------------------------------------------ */

export type HybridRisk = "simple-vector" | "complex-vector" | "raster-required";

/** ARIA landmark / semantic roles emitted as data-role region groups (blueprint §15). */
export type SemanticRole =
  | "banner"
  | "navigation"
  | "main"
  | "complementary"
  | "contentinfo"
  | "region"
  | "form"
  | "search"
  | "article";

/**
 * A resolved CSS clip shape (blueprint §15: supported clipping → vector).
 * Coordinates are absolute in the capture-rect CSS-pixel space
 * (clipPathUnits="userSpaceOnUse").
 */
export type DomClipShape =
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "polygon"; points: Array<{ x: number; y: number }> };

/**
 * A resolved computed CSS transform (blueprint §15 hardening: basic
 * transforms → native SVG `matrix()`). `a`–`f` are the computed 2D matrix
 * coefficients; `width`/`height` are the pre-transform border-box size so the
 * element's own rendering can be drawn in local coordinates (0, 0, w, h)
 * under the matrix. Transformed containers with element children are excluded
 * at snapshot time — see `snapshotDom` in hybrid.ts.
 */
export interface ParsedTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  /** Pre-transform border-box width (offsetWidth). */
  width: number;
  /** Pre-transform border-box height (offsetHeight). */
  height: number;
}

export interface DomSnapshotNode {
  id: string;
  tag: string;
  kind: "block" | "text" | "image" | "raster";
  /** Nearest snapshot ancestor id (DOM tree preserved for semantic groups + clipping). */
  parentId?: string;
  /** ARIA landmark role, when the element is one (blueprint §15 layer boundaries). */
  role?: SemanticRole;
  /** Resolved explicit clip-path shape (absolute coords). */
  clipShape?: DomClipShape;
  /** overflow:hidden/clip — children are clipped to this node's rect. */
  clipsChildren?: boolean;
  /**
   * Resolved computed transform (2D matrix) when vector-convertible — the
   * node's own rendering is drawn at (0, 0, width, height) under the matrix.
   * Raster crops never carry one: they are already in post-transform space.
   */
  transform?: ParsedTransform;
  /** Capture-rect coordinates (CSS px — same space as the raster canvas). */
  bounds: { x: number; y: number; width: number; height: number };
  styles: {
    display: string;
    position: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    opacity: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    lineHeight?: number;
    textAlign?: "left" | "center" | "right";
    /** Computed background-image value (may contain CSS gradient functions). */
    backgroundImage?: string;
    /** Computed box-shadow value. */
    boxShadow?: string;
    /** Computed overflow value (hidden/clip → children clipped). */
    overflow?: string;
    /** Computed transform value (none / matrix(…) / matrix3d(…)). */
    transform?: string;
  };
  /** Direct text content (visibility-tested, whitespace-collapsed). */
  text?: string;
  /**
   * Measured browser line boxes — per-line text + position from the live
   * DOM (blueprint §15: use measured line boxes, never re-wrap). Present
   * when the element's text wraps to 2+ lines.
   */
  lines?: Array<{ text: string; x: number; y: number; width: number; height: number }>;
  /** data: URL — embedded as a native <image> when self-contained. */
  imgSrc?: string;
  /** Raster crop of the captured canvas — <image> fallback for unsupported regions. */
  fallbackDataUrl?: string;
  /** Vector-suitability score (0–100, blueprint §15). */
  score: number;
  risk: HybridRisk;
  /** Human-readable scoring reasons (reported for complex/raster regions). */
  reasons?: string[];
}

export interface DomSnapshot {
  canvas: { width: number; height: number };
  /** DOM order; coordinates relative to the capture rectangle. */
  nodes: DomSnapshotNode[];
  truncated: boolean;
  warnings: string[];
}

export interface HybridRegionReport {
  id: string;
  tag: string;
  representation: "vector" | "browser-text" | "embedded-image" | "raster-fallback" | "redacted";
  bounds: { x: number; y: number; width: number; height: number };
  fidelity: "high" | "medium" | "approximate";
  /** ARIA landmark role when the node opens a semantic region group. */
  role?: SemanticRole;
  warnings: string[];
}

export interface HybridReport {
  counts: {
    vectorRects: number;
    vectorTexts: number;
    embeddedImages: number;
    rasterFallbacks: number;
    /** Number of semantic landmark region groups (<g id="region-…" data-role="…">). */
    semanticGroups: number;
    /** Destructive redaction regions (mask/blur annotations, doc.redactions). */
    redacted: number;
  };
  totalNodes: number;
  truncated: boolean;
  warnings: string[];
  regions: HybridRegionReport[];
}

/* ------------------------------------------------------------------ */
/* Annotations (blueprint §15/§18)                                      */
/* ------------------------------------------------------------------ */

export interface Point {
  x: number;
  y: number;
}

export type AnnotationKind =
  | "arrow"
  | "rect"
  | "text"
  | "callout"
  | "step"
  | "highlight"
  | "mask"
  | "blur"
  | "magnifier";

interface AnnotationBase {
  id: string;
  kind: AnnotationKind;
  visible: boolean;
  /**
   * Optional layer-group id. Members with the same id form a group
   * (reorder/move/delete together); `undefined` = ungrouped. Groups are
   * serialized as `data-group` on the annotation element and are purely a
   * model concept — layout is identical with or without grouping.
   */
  group?: string;
}

export interface ArrowAnnotation extends AnnotationBase {
  kind: "arrow";
  start: Point;
  end: Point;
  stroke: string;
  strokeWidth: number;
}
export interface RectAnnotation extends AnnotationBase {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}
export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
  fontWeight: number;
  align: "start" | "middle" | "end";
}
export interface CalloutAnnotation extends AnnotationBase {
  kind: "callout";
  anchor: Point;
  end: Point;
  text: string;
  stroke: string;
  fontSize: number;
  fill: string;
}
export interface StepAnnotation extends AnnotationBase {
  kind: "step";
  x: number;
  y: number;
  number: number;
  fill: string;
}
export interface HighlightAnnotation extends AnnotationBase {
  kind: "highlight";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
}
export interface MaskAnnotation extends AnnotationBase {
  kind: "mask";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  label: boolean;
}

/** Blur a region of the base capture with a real SVG filter (feGaussianBlur). */
export interface BlurAnnotation extends AnnotationBase {
  kind: "blur";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * Magnifier lens: a circular loupe centered at (x, y) that re-draws the
 * base capture through a circular clip at `zoom`× around its center.
 */
export interface MagnifierAnnotation extends AnnotationBase {
  kind: "magnifier";
  x: number;
  y: number;
  radius: number;
  zoom: number;
  stroke: string;
}

export type Annotation =
  | ArrowAnnotation
  | RectAnnotation
  | TextAnnotation
  | CalloutAnnotation
  | StepAnnotation
  | HighlightAnnotation
  | MaskAnnotation
  | BlurAnnotation
  | MagnifierAnnotation;

/** Editor-level metadata state (title/desc/tags + embedding toggles). */
export interface CaptureMetadataModel {
  title: string;
  description: string;
  tags: string[];
  includeMetadata: boolean;
  includeSourceUrl: boolean;
  includeTimestamp: boolean;
}

/* ------------------------------------------------------------------ */
/* Validation report (blueprint §22)                                    */
/* ------------------------------------------------------------------ */

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ValidationReport {
  ok: boolean;
  checks: ValidationCheck[];
  rendered: { width: number; height: number } | null;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Shared constants                                                     */
/* ------------------------------------------------------------------ */

export const SVG_NS = "http://www.w3.org/2000/svg";
export const VC_NS = "https://stitap.capture/metadata/1";
export const MAX_TILE_HEIGHT = 4000; // CSS px per embedded <image> tile
