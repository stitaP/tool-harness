/**
 * Metadata generation (blueprint §19). Three levels: accessible <title>/<desc>,
 * structured embedded <metadata> in a namespaced vocabulary, and a JSON
 * sidecar for export. All values are typed, length-limited and escaped.
 */

import {
  CaptureDocument,
  CaptureMetadataModel,
  VC_NS,
} from "./types";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface MetadataValidation {
  ok: boolean;
  errors: string[];
}

const LIMITS = {
  title: 300,
  description: 4000,
  tag: 80,
  tags: 50,
};

/** Validate editor-provided metadata before it touches the document. */
export function validateMetadata(model: CaptureMetadataModel): MetadataValidation {
  const errors: string[] = [];
  if (!model.title.trim()) errors.push("Title is required");
  if (model.title.length > LIMITS.title)
    errors.push(`Title exceeds ${LIMITS.title} characters`);
  if (model.description.length > LIMITS.description)
    errors.push(`Description exceeds ${LIMITS.description} characters`);
  if (model.tags.length > LIMITS.tags)
    errors.push(`Tags exceed ${LIMITS.tags}`);
  for (const tag of model.tags) {
    if (tag.length > LIMITS.tag) errors.push(`Tag "${tag.slice(0, 20)}…" exceeds ${LIMITS.tag} characters`);
  }
  return { ok: errors.length === 0, errors };
}

export function defaultMetadataFor(
  doc: CaptureDocument,
): CaptureMetadataModel {
  return {
    title: `${doc.source.title || "Untitled capture"} — capture`,
    description: `${doc.source.mode === "full-page" ? "Full-page" : "Viewport"} capture of ${
      doc.source.url ?? "the demo documentation page"
    } · ${doc.canvas.width} × ${doc.canvas.height}px · captured ${new Date(doc.source.capturedAt).toISOString()}`,
    tags: ["capture", doc.source.mode.replace("-", "-")],
    includeMetadata: true,
    includeSourceUrl: true,
    includeTimestamp: true,
  };
}

interface MetadataContext {
  doc: CaptureDocument;
  model: CaptureMetadataModel;
  outputMode: string;
}

/** The <metadata> block with the capture vocabulary, or "" when disabled. */
export function buildMetadataXml(ctx: MetadataContext): string {
  if (!ctx.model.includeMetadata) return "";
  const { doc, model } = ctx;
  const vc = (tag: string, value: string | number | boolean) =>
    `    <vc:${tag}>${escapeXml(String(value))}</vc:${tag}>`;
  const lines: string[] = [];
  lines.push(`  <metadata>`);
  lines.push(`    <vc:CaptureMetadata xmlns:vc="${VC_NS}">`);
  lines.push(vc("documentId", doc.documentId));
  lines.push(vc("captureMode", doc.source.mode));
  lines.push(vc("outputMode", ctx.outputMode));
  if (model.includeTimestamp) lines.push(vc("capturedAt", doc.source.capturedAt));
  lines.push(vc("viewportWidth", doc.source.viewport.width));
  lines.push(vc("viewportHeight", doc.source.viewport.height));
  lines.push(vc("deviceScaleFactor", doc.source.viewport.deviceScaleFactor));
  lines.push(vc("canvasWidth", doc.canvas.width));
  lines.push(vc("canvasHeight", doc.canvas.height));
  lines.push(vc("tileCount", doc.baseLayers.length));
  if (doc.source.target) lines.push(vc("captureTarget", doc.source.target));
  if (model.includeSourceUrl && doc.source.url) {
    lines.push(vc("sourceUrl", doc.source.url));
  }
  if (model.tags.length > 0) {
    lines.push(`      <vc:tags>`);
    for (const tag of model.tags) lines.push(`        <vc:tag>${escapeXml(tag)}</vc:tag>`);
    lines.push(`      </vc:tags>`);
  }
  // OCR-at-capture state (blueprint §14 ocrLayers) — flattened text + counts
  // survive the SVG round-trip; full layers persist via the sidecar JSON.
  if (doc.ocr && doc.ocr.status !== "none") {
    lines.push(vc("ocrStatus", doc.ocr.status));
    lines.push(vc("ocrEngine", doc.ocr.engine));
    lines.push(vc("ocrBlockCount", doc.ocr.layers.length));
    lines.push(`      <vc:ocrText>${escapeXml(doc.ocr.text)}</vc:ocrText>`);
  }
  lines.push(`    </vc:CaptureMetadata>`);
  lines.push(`  </metadata>`);
  return lines.join("\n");
}

/** JSON sidecar (blueprint §19) — downloaded alongside the SVG. */
export function buildSidecarJson(ctx: MetadataContext): Record<string, unknown> {
  const { doc, model } = ctx;
  return {
    schema: VC_NS,
    documentId: doc.documentId,
    title: model.title,
    description: model.description,
    tags: model.tags,
    capture: {
      mode: doc.source.mode,
      timestamp: model.includeTimestamp ? doc.source.capturedAt : undefined,
      url: model.includeSourceUrl ? doc.source.url : undefined,
      viewport: {
        width: doc.source.viewport.width,
        height: doc.source.viewport.height,
        deviceScaleFactor: doc.source.viewport.deviceScaleFactor,
      },
      canvas: { width: doc.canvas.width, height: doc.canvas.height },
      tileCount: doc.baseLayers.length,
      target: doc.source.target,
    },
    privacy: {
      redacted: !!doc.redacted,
      redactions: (doc.redactions ?? []).map((r) => ({
        id: r.id,
        verified: r.verified,
        appliedAt: r.appliedAt,
      })),
      sensitiveDataScan: false,
    },
    ocr: doc.ocr && doc.ocr.status !== "none"
      ? {
          status: doc.ocr.status,
          engine: doc.ocr.engine,
          blockCount: doc.ocr.layers.length,
          text: doc.ocr.text,
          truncated: !!doc.ocr.truncated,
        }
      : undefined,
  };
}
