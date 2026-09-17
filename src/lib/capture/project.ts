/**
 * Editable project file (.vcap) — blueprint §14.
 *
 * The published SVG is a flat picture; the project file carries everything
 * needed to *re-edit* a capture after reopening: the capture document
 * (base layers + metadata + OCR), the annotation model, and the undo/redo
 * history. Round-trips through JSON with minimal structural validation so
 * a corrupt file fails loudly instead of half-loading.
 */
import type {
  Annotation,
  CaptureDocument,
  CaptureMetadataModel,
} from "./types";
import { defaultMetadataFor } from "./metadata";

export const VCAP_FORMAT = "stitap-project";
export const VCAP_VERSION = 1;

export interface ProjectHistory {
  past: Annotation[][];
  future: Annotation[][];
}

export interface ProjectFile {
  format: typeof VCAP_FORMAT;
  version: typeof VCAP_VERSION;
  savedAt: string;
  document: CaptureDocument;
  metadata: CaptureMetadataModel;
  annotations: Annotation[];
  history: ProjectHistory;
}

export function buildProjectFile(input: {
  document: CaptureDocument;
  metadata: CaptureMetadataModel;
  annotations: Annotation[];
  history: ProjectHistory;
}): string {
  const file: ProjectFile = {
    format: VCAP_FORMAT,
    version: VCAP_VERSION,
    savedAt: new Date().toISOString(),
    document: input.document,
    metadata: input.metadata,
    annotations: input.annotations,
    history: input.history,
  };
  return JSON.stringify(file);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Validate the minimal document shape and return a typed project file. */
export function parseProjectFile(json: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Not a valid .vcap file — the JSON could not be parsed.");
  }
  if (!isRecord(raw)) throw new Error("Not a valid .vcap file — expected an object.");
  if (raw.format !== VCAP_FORMAT) {
    throw new Error("Not a stitaP project file (.vcap).");
  }
  if (raw.version !== VCAP_VERSION) {
    throw new Error(`Unsupported .vcap version ${String(raw.version)} — expected ${VCAP_VERSION}.`);
  }
  const doc = raw.document;
  if (
    !isRecord(doc) ||
    !isRecord(doc.canvas) ||
    typeof doc.canvas.width !== "number" ||
    typeof doc.canvas.height !== "number" ||
    !Array.isArray(doc.baseLayers) ||
    !isRecord(doc.source)
  ) {
    throw new Error("The .vcap file is missing a valid capture document.");
  }
  const annotations = Array.isArray(raw.annotations) ? (raw.annotations as Annotation[]) : [];
  const history =
    isRecord(raw.history) &&
    Array.isArray(raw.history.past) &&
    Array.isArray(raw.history.future)
      ? (raw.history as unknown as ProjectHistory)
      : { past: [], future: [] };
  const metadata = isRecord(raw.metadata) && typeof raw.metadata.title === "string"
    ? (raw.metadata as unknown as CaptureMetadataModel)
    : defaultMetadataFor(doc as unknown as CaptureDocument);
  return {
    format: VCAP_FORMAT,
    version: VCAP_VERSION,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
    document: doc as unknown as CaptureDocument,
    metadata,
    annotations,
    history,
  };
}
