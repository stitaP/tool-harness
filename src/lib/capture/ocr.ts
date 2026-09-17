/**
 * OCR-at-capture (blueprint §14 ocrLayers).
 *
 * The engine runs this during the "processing" stage and persists the result
 * on the capture document (`CaptureDocument.ocr`), so text recognition
 * happens once, at capture time — feeding suggested alt text, the search
 * index and the sensitive-data scan without a second pass.
 *
 * Two producers:
 *  - demo captures: the live-DOM hybrid snapshot already carries measured
 *    text nodes with real bounds — `ocrStateFromDomSnapshot` turns them into
 *    layers instantly (no model download, source "dom").
 *  - raster-only captures (URL / extension): on-device tesseract OCR per
 *    tile — `runOcrAtCapture` → `ocrStateFromBlocks` (source "ocr").
 *
 * The pure helpers (`ocrStateFromDomSnapshot`, `ocrStateFromBlocks`,
 * `flattenOcrLayers`) are Node-safe and exercised by scripts/capture-smoke.ts.
 * `runOcrAtCapture` is browser-only — it dynamically imports the NLP service
 * (tesseract) so this module never loads model code in Node.
 */
import type { OcrBlock, IndicOcrOptions } from "../nlp/types";
import { mergeOcrBlocks, ocrBlocksToText, offsetOcrBlocks } from "../nlp/rule";
import type {
  CaptureOcrState,
  DomSnapshot,
  OcrLayer,
  RasterTile,
} from "./types";

/** Max layers persisted per capture (very tall pages stay bounded). */
export const OCR_AT_CAPTURE_MAX_BLOCKS = 1500;
/** Max flattened text chars persisted (search + metadata stay light). */
export const OCR_AT_CAPTURE_MAX_TEXT = 20_000;
/** Max tiles OCR'd per capture job (keeps the tesseract pass bounded). */
export const OCR_AT_CAPTURE_MAX_TILES = 8;

/** Flatten layers to searchable text (newline-joined, whitespace-collapsed). */
export function flattenOcrLayers(layers: OcrLayer[], maxChars = OCR_AT_CAPTURE_MAX_TEXT): string {
  return layers
    .map((l) => l.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}

/** Apply the layer/text caps and build the persisted state. */
export function capOcrState(
  layers: OcrLayer[],
  engine: string,
  opts: { maxBlocks?: number; maxText?: number } = {},
): CaptureOcrState {
  const maxBlocks = opts.maxBlocks ?? OCR_AT_CAPTURE_MAX_BLOCKS;
  const maxText = opts.maxText ?? OCR_AT_CAPTURE_MAX_TEXT;
  const truncated = layers.length > maxBlocks;
  const capped = layers.slice(0, maxBlocks);
  return {
    status: "ok",
    engine,
    layers: capped,
    text: flattenOcrLayers(capped, maxText),
    truncated,
  };
}

/**
 * Build the capture-time OCR state from a hybrid DOM snapshot (demo captures).
 * Every snapshot text node with a resolved line box becomes a layer with its
 * exact document coordinates — no OCR model, instant.
 */
export function ocrStateFromDomSnapshot(
  snapshot: DomSnapshot,
  opts: { maxBlocks?: number; maxText?: number } = {},
): CaptureOcrState {
  const layers: OcrLayer[] = [];
  for (const node of snapshot.nodes) {
    if (node.lines && node.lines.length > 0) {
      for (const line of node.lines) {
        const text = line.text.replace(/\s+/g, " ").trim();
        if (!text) continue;
        layers.push({
          text,
          confidence: 1,
          bounds: { x: line.x, y: line.y, width: line.width, height: line.height },
          source: "dom",
        });
      }
    } else if (node.text) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      layers.push({
        text,
        confidence: 1,
        bounds: {
          x: node.bounds.x,
          y: node.bounds.y,
          width: node.bounds.width,
          height: node.bounds.height,
        },
        source: "dom",
      });
    }
  }
  return capOcrState(layers, "hybrid-dom", opts);
}

/** Build the capture-time OCR state from tesseract blocks (raster captures). */
export function ocrStateFromBlocks(
  blocks: OcrBlock[],
  engine = "tesseract",
  opts: { maxBlocks?: number; maxText?: number } = {},
): CaptureOcrState {
  const layers: OcrLayer[] = blocks.map((b) => ({
    text: b.text,
    confidence: b.confidence,
    bounds: b.bounds,
    source: "ocr",
  }));
  return capOcrState(layers, engine, opts);
}

/**
 * Browser-only OCR-at-capture strategy (engine-injected, demo + raster).
 *
 * - `demoSnapshot` present → live-DOM layers (no download).
 * - `indicOptions` present → multi-script Indian language OCR.
 * - otherwise → on-device tesseract OCR over the first tiles, offsets merged
 *   into document coordinates, capped.
 */
export async function runOcrAtCapture(ctx: {
  tiles: RasterTile[];
  demoSnapshot?: DomSnapshot;
  indicOptions?: IndicOcrOptions;
}): Promise<CaptureOcrState> {
  if (ctx.demoSnapshot) {
    return ocrStateFromDomSnapshot(ctx.demoSnapshot);
  }
  const { nlp } = await import("../nlp/service");
  const lists: OcrBlock[][] = [];
  for (const tile of ctx.tiles.slice(0, OCR_AT_CAPTURE_MAX_TILES)) {
    const blocks = await nlp.ocrImage(tile.dataUrl, {
      strategy: ctx.indicOptions ? "indic" : undefined,
      indicOptions: ctx.indicOptions,
    });
    lists.push(offsetOcrBlocks(blocks, tile.x, tile.y));
  }
  const merged = mergeOcrBlocks(lists);
  if (merged.length === 0) {
    return { status: "ok", engine: ctx.indicOptions ? "indic" : "tesseract", layers: [], text: "" };
  }
  return ocrStateFromBlocks(merged, ctx.indicOptions ? "indic-tesseract" : "tesseract");
}

/** Convenience: the flattened searchable text from any OCR state. */
export function ocrTextOf(state: CaptureOcrState | undefined): string {
  if (!state) return "";
  if (state.text) return state.text;
  return flattenOcrLayers(state.layers);
}

/** Re-export the pure merge helpers for callers building OCR states. */
export { mergeOcrBlocks, ocrBlocksToText, offsetOcrBlocks };
