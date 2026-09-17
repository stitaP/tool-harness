/**
 * Editor edit operations (blueprint §3 editor + §17 secure redaction).
 *
 * Pure geometry/model helpers (smoke-testable) plus DOM-dependent pixel
 * operations: cropping the base capture and destructively removing source
 * pixels inside a redaction rectangle.
 */

import {
  Annotation,
  CaptureDocument,
  RasterTile,
  RedactionRegion,
} from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Pure geometry                                                        */
/* ------------------------------------------------------------------ */

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Bounding box of an annotation in document coordinates. */
export function annotationBounds(a: Annotation): Rect {
  switch (a.kind) {
    case "arrow": {
      const x = Math.min(a.start.x, a.end.x);
      const y = Math.min(a.start.y, a.end.y);
      return {
        x,
        y,
        width: Math.abs(a.end.x - a.start.x),
        height: Math.abs(a.end.y - a.start.y),
      };
    }
    case "rect":
    case "highlight":
    case "mask":
    case "blur":
      return { x: a.x, y: a.y, width: a.width, height: a.height };
    case "text":
      return { x: a.x, y: a.y, width: a.text.length * a.fontSize * 0.6, height: a.fontSize * 1.2 };
    case "callout": {
      const minX = Math.min(a.anchor.x, a.end.x);
      const minY = Math.min(a.anchor.y, a.end.y);
      return {
        x: minX,
        y: minY,
        width: Math.abs(a.end.x - a.anchor.x) + a.text.length * a.fontSize * 0.6,
        height: Math.abs(a.end.y - a.anchor.y) + a.fontSize * 1.2,
      };
    }
    case "step":
      return { x: a.x - 14, y: a.y - 14, width: 28, height: 28 };
    case "magnifier":
      return { x: a.x - a.radius, y: a.y - a.radius, width: a.radius * 2, height: a.radius * 2 };
  }
}

/** Annotations whose bounds lie entirely inside the given rectangle. */
export function annotationsCoveredBy(
  annotations: Annotation[],
  rect: Rect,
): Annotation[] {
  return annotations.filter((a) => {
    const b = annotationBounds(a);
    return (
      b.x >= rect.x - 0.5 &&
      b.y >= rect.y - 0.5 &&
      b.x + b.width <= rect.x + rect.width + 0.5 &&
      b.y + b.height <= rect.y + rect.height + 0.5
    );
  });
}

/** Translate an annotation by a document-space delta (used after cropping). */
export function shiftAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.kind) {
    case "arrow":
      return {
        ...a,
        start: { x: a.start.x + dx, y: a.start.y + dy },
        end: { x: a.end.x + dx, y: a.end.y + dy },
      };
    case "rect":
    case "highlight":
    case "mask":
    case "blur":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "text":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "callout":
      return {
        ...a,
        anchor: { x: a.anchor.x + dx, y: a.anchor.y + dy },
        end: { x: a.end.x + dx, y: a.end.y + dy },
      };
    case "step":
      return { ...a, x: a.x + dx, y: a.y + dy };
    case "magnifier":
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

/* ------------------------------------------------------------------ */
/* Layer groups                                                        */
/* ------------------------------------------------------------------ */

/** Tag the given annotations into a new layer group (untagging prior groups). */
export function groupAnnotations(annotations: Annotation[], ids: string[]): Annotation[] {
  const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const wanted = new Set(ids);
  if (wanted.size < 2) return annotations;
  return annotations.map((a) => (wanted.has(a.id) ? ({ ...a, group: groupId } as Annotation) : a));
}

/** Remove every annotation from the given layer group (flatten). */
export function flattenAnnotations(annotations: Annotation[], groupId: string): Annotation[] {
  return annotations.map((a) =>
    a.group === groupId ? ({ ...a, group: undefined } as Annotation) : a,
  );
}

/** Distinct group ids present on a set of annotations. */
export function groupsOf(annotations: Annotation[], ids: string[]): string[] {
  const byId = new Map(annotations.map((a) => [a.id, a]));
  const out = new Set<string>();
  for (const id of ids) {
    const g = byId.get(id)?.group;
    if (g) out.add(g);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Export slicing (extremely tall captures)                             */
/* ------------------------------------------------------------------ */

/** Recommended max height (CSS px) for a single exported SVG slice. */
export const SLICE_MAX_HEIGHT = 16_000;

export interface DocumentSlice {
  /** Slice document: tiles shifted up by `offsetY`, canvas height = slice height. */
  document: CaptureDocument;
  /** Amount this slice was shifted up in document space (for filename/index). */
  offsetY: number;
  /** Annotations kept for this slice, shifted by -offsetY. */
  annotations: Annotation[];
}

/**
 * Split a document into height-bounded vertical slices for export.
 *
 * Pure (no DOM): each slice keeps the full-height tiles it overlaps,
 * shifted up by the slice's offset, plus the annotations that intersect it.
 * Renderers clip at the slice boundary (builders add `overflow: hidden`), so
 * a tile straddling a seam is simply cut where the next slice begins.
 */
export function sliceDocumentForExport(
  doc: CaptureDocument,
  annotations: Annotation[],
  maxHeight: number = SLICE_MAX_HEIGHT,
): DocumentSlice[] {
  const limit = Math.max(1, Math.floor(maxHeight));
  const slices: DocumentSlice[] = [];
  if (doc.canvas.height <= limit) {
    return [{ document: doc, offsetY: 0, annotations }];
  }
  let y0 = 0;
  while (y0 < doc.canvas.height) {
    const y1 = Math.min(doc.canvas.height, y0 + limit);
    const tiles = doc.baseLayers
      .filter((t) => intersectRect(t, { x: 0, y: y0, width: doc.canvas.width, height: y1 - y0 }))
      .map((t) => ({ ...t, y: t.y - y0 }));
    const sliceAnnotations = annotations
      .filter((a) => {
        const b = annotationBounds(a);
        const slice: Rect = { x: 0, y: y0, width: doc.canvas.width, height: y1 - y0 };
        return (
          b.x < slice.x + slice.width &&
          b.x + b.width > slice.x &&
          b.y < slice.y + slice.height &&
          b.y + b.height > slice.y
        );
      })
      .map((a) => shiftAnnotation(a, 0, -y0));
    slices.push({
      document: {
        ...doc,
        canvas: { ...doc.canvas, height: y1 - y0 },
        baseLayers: tiles,
      },
      offsetY: y0,
      annotations: sliceAnnotations,
    });
    y0 = y1;
  }
  return slices;
}

/* ------------------------------------------------------------------ */
/* DOM-dependent pixel operations (canvas)                             */
/* ------------------------------------------------------------------ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the captured image"));
    img.src = src;
  });
}

function tileMime(tile: RasterTile): "image/png" | "image/webp" {
  return tile.dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/png";
}

/** Scale a document-space rect into a tile's pixel space. */
function tilePixelRect(
  tile: RasterTile,
  img: HTMLImageElement,
  rect: Rect,
): { x: number; y: number; width: number; height: number } {
  const kx = img.naturalWidth / Math.max(1, tile.width);
  const ky = img.naturalHeight / Math.max(1, tile.height);
  const inter = intersectRect(tile, rect);
  if (!inter) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round((inter.x - tile.x) * kx),
    y: Math.round((inter.y - tile.y) * ky),
    width: Math.max(1, Math.round(inter.width * kx)),
    height: Math.max(1, Math.round(inter.height * ky)),
  };
}

/** Crop the base capture to a document-space rectangle (destructive). */
export async function cropDocument(
  doc: CaptureDocument,
  rect: Rect,
): Promise<CaptureDocument> {
  const layers: RasterTile[] = [];
  for (const tile of doc.baseLayers) {
    const inter = intersectRect(tile, rect);
    if (!inter) continue;
    const img = await loadImage(tile.dataUrl);
    const p = tilePixelRect(tile, img, rect);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(inter.width * (img.naturalWidth / Math.max(1, tile.width))));
    canvas.height = Math.max(1, Math.round(inter.height * (img.naturalHeight / Math.max(1, tile.height))));
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(img, p.x, p.y, p.width, p.height, 0, 0, canvas.width, canvas.height);
    layers.push({
      id: tile.id,
      x: Math.round(inter.x - rect.x),
      y: Math.round(inter.y - rect.y),
      width: Math.round(inter.width),
      height: Math.round(inter.height),
      dataUrl: canvas.toDataURL(tileMime(tile), 0.92),
    });
  }
  return {
    ...doc,
    canvas: {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      background: doc.canvas.background,
    },
    baseLayers: layers,
  };
}

function regionHash(pixels: Uint8ClampedArray): string {
  // FNV-1a over sampled bytes — cheap and adequate for before/after detection.
  let h = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i += 4) {
    h ^= pixels[i];
    h = Math.imul(h, 0x01000193);
    h ^= pixels[i + 1];
    h = Math.imul(h, 0x01000193);
    h ^= pixels[i + 2];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface PixelChange {
  tileId: string;
  changed: boolean;
}

/**
 * Destructive redaction: replaces source pixels under `rect` with a solid
 * fill, re-encodes the affected tiles and returns a verification record.
 * The redaction is applied to the raster itself — not a shape placed over it.
 */
export async function applyPixelRedaction(
  doc: CaptureDocument,
  rect: Rect,
  fill = "#18181b",
): Promise<{ document: CaptureDocument; changes: PixelChange[]; region: RedactionRegion }> {
  const changes: PixelChange[] = [];
  const layers = await Promise.all(
    doc.baseLayers.map(async (tile) => {
      const inter = intersectRect(tile, rect);
      if (!inter) return tile;
      const img = await loadImage(tile.dataUrl);
      const p = tilePixelRect(tile, img, rect);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return tile;
      ctx.drawImage(img, 0, 0);
      const before = regionHash(
        ctx.getImageData(p.x, p.y, p.width, p.height).data,
      );
      ctx.fillStyle = fill;
      ctx.fillRect(p.x, p.y, p.width, p.height);
      const after = regionHash(
        ctx.getImageData(p.x, p.y, p.width, p.height).data,
      );
      const changed = before !== after;
      changes.push({ tileId: tile.id, changed });
      return {
        ...tile,
        dataUrl: canvas.toDataURL(tileMime(tile), 0.92),
      };
    }),
  );
  const region: RedactionRegion = {
    id: `redaction-${Date.now().toString(36)}`,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    verified: changes.length > 0 && changes.every((c) => c.changed),
    appliedAt: new Date().toISOString(),
  };
  return {
    document: {
      ...doc,
      redacted: true,
      redactions: [...(doc.redactions ?? []), region],
      warnings: [
        ...doc.warnings,
        region.verified
          ? `Redaction ${region.id}: source pixels removed and verified`
          : `Redaction ${region.id}: applied but could not verify pixel change`,
      ],
      baseLayers: layers,
    },
    changes,
    region,
  };
}
