/**
 * Portable-path export report (blueprint §15/§28 — the generic machine-
 * readable report for the Portable Image SVG mode, complementing the Hybrid
 * report in `hybrid.ts`).
 *
 * Pure aside from `crypto.subtle` (SHA-256 integrity of the emitted SVG), so
 * it runs in the browser and in Bun smoke tests.
 */

import type { Annotation, CaptureDocument } from "./types";

export interface PortableReport {
  kind: "portable";
  title: string;
  url?: string;
  capturedAt: string;
  mode: string;
  target?: string;
  canvas: { width: number; height: number; backgroundColor: string };
  viewport: { width: number; height: number; deviceScaleFactor: number };
  layers: number;
  annotations: {
    total: number;
    byKind: Record<string, number>;
    groups: number;
  };
  redaction: {
    applied: boolean;
    count: number;
    coveragePx: number;
    coveragePct: number;
  };
  integrity: { sha256: string; algorithm: "SHA-256" };
  structure: { imageElements: number; embeddedBytes: number; foreignObjects: number };
  validation: { sanitized: boolean };
  policy: string;
  warnings: string[];
}

export function annotationCountsByKind(annotations: Annotation[]): Record<string, number> {
  const byKind: Record<string, number> = {};
  for (const a of annotations) {
    byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  }
  return byKind;
}

export function countSvgImages(svg: string): { imageElements: number; embeddedBytes: number; foreignObjects: number } {
  const imageElements = (svg.match(/<image\b/g) ?? []).length;
  const foreignObjects = (svg.match(/<foreignObject\b/g) ?? []).length;
  let embeddedBytes = 0;
  const re = /data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    embeddedBytes += Math.floor((m[1].length * 3) / 4);
  }
  return { imageElements, embeddedBytes, foreignObjects };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PortableReportOptions {
  /** Policy summary line (from `summarizePolicy`); empty string if unknown. */
  policy?: string;
  /** Whether the emitted SVG passed the sanitizer in the export path. */
  sanitized?: boolean;
}

/** Build the machine-readable report for the portable (raster) SVG path. */
export async function buildPortableReport(
  doc: CaptureDocument,
  svg: string,
  annotations: Annotation[],
  opts: PortableReportOptions = {},
): Promise<PortableReport> {
  const canvasArea = Math.max(1, doc.canvas.width * doc.canvas.height);
  const redactionCount = (doc.redactions ?? []).length;
  const coveragePx = (doc.redactions ?? []).reduce(
    (sum, r) => sum + Math.max(0, r.width) * Math.max(0, r.height),
    0,
  );
  const groups = new Set(annotations.map((a) => a.group).filter((g): g is string => Boolean(g))).size;
  const structure = countSvgImages(svg);

  return {
    kind: "portable",
    title: doc.source.title,
    url: doc.source.url,
    capturedAt: doc.source.capturedAt,
    mode: doc.source.mode,
    target: doc.source.target,
    canvas: {
      width: doc.canvas.width,
      height: doc.canvas.height,
      backgroundColor: doc.canvas.background,
    },
    viewport: {
      width: doc.source.viewport.width,
      height: doc.source.viewport.height,
      deviceScaleFactor: doc.source.viewport.deviceScaleFactor,
    },
    layers: doc.baseLayers.length,
    annotations: {
      total: annotations.length,
      byKind: annotationCountsByKind(annotations),
      groups,
    },
    redaction: {
      applied: Boolean(doc.redacted),
      count: redactionCount,
      coveragePx,
      coveragePct: Math.min(100, (coveragePx / canvasArea) * 100),
    },
    integrity: { sha256: await sha256Hex(svg), algorithm: "SHA-256" },
    structure,
    validation: { sanitized: opts.sanitized ?? true },
    policy: opts.policy ?? "",
    warnings: [...doc.warnings],
  };
}
