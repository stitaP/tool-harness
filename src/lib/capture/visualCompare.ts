/**
 * Visual comparison engine (blueprint §22: rendered-SVG vs source-capture
 * fidelity report).
 *
 * Two layers:
 *
 *   1. `comparePixelBlocks` — pure, deterministic math over RGBA buffers
 *      (per-tile mean-absolute-difference + luminance-histogram agreement).
 *      Unit-testable without a DOM.
 *
 *   2. `compareRenderedFidelity` — DOM wrapper: rasterizes the SVG (and the
 *      source capture) onto canvases at a bounded sample size, then runs the
 *      pure matcher. Used by the Export tab's "Fidelity report" button.
 *
 * Scores are 0–100, 100 = visually identical (within rounding).
 */

export interface VisualCompareTile {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0–100, weighted by luminance agreement + MAE. */
  score: number;
}

export interface VisualCompareReport {
  overall: number;
  width: number;
  height: number;
  tileSize: number;
  tiles: VisualCompareTile[];
  warnings: string[];
}

export interface ComparePixelBlocksOptions {
  /** Tile edge in pixels (buffers are treated as `width × height` RGBA). */
  tileSize?: number;
  /** Sample every Nth pixel on each axis inside a tile (perf). */
  sampleStep?: number;
}

const DEFAULT_TILE = 64;
const DEFAULT_STEP = 2;

function lum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Pure RGBA comparison. `a` and `b` must have identical lengths and `width`.
 * For each tile: mean absolute per-channel difference (MAPD) and the
 * Bhattacharyya-style agreement of 8-bin luminance histograms; the tile score
 * is the lower of the two agreements. Empty or single-color regions that
 * match trivially still score via MAPD, so a shifted layout is penalized.
 */
export function comparePixelBlocks(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  opts: ComparePixelBlocksOptions = {},
): VisualCompareReport {
  const warnings: string[] = [];
  if (a.length !== b.length) {
    throw new Error("comparePixelBlocks: buffers must be the same length");
  }
  const tileSize = Math.max(8, opts.tileSize ?? DEFAULT_TILE);
  const step = Math.max(1, opts.sampleStep ?? DEFAULT_STEP);
  const height = Math.floor(a.length / 4 / width);
  if (width <= 0 || height <= 0) {
    throw new Error("comparePixelBlocks: invalid dimensions");
  }

  const tiles: VisualCompareTile[] = [];
  let acc = 0;
  let accArea = 0;

  for (let ty = 0; ty < height; ty += tileSize) {
    for (let tx = 0; tx < width; tx += tileSize) {
      const tRight = Math.min(tx + tileSize, width);
      const tBottom = Math.min(ty + tileSize, height);
      const tW = tRight - tx;
      const tH = tBottom - ty;

      let sumAbs = 0;
      let samples = 0;
      const histA = new Array(8).fill(0);
      const histB = new Array(8).fill(0);

      for (let y = ty; y < tBottom; y += step) {
        for (let x = tx; x < tRight; x += step) {
          const i = (y * width + x) * 4;
          const ar = a[i], ag = a[i + 1], ab = a[i + 2];
          const br = b[i], bg = b[i + 1], bb = b[i + 2];
          sumAbs += Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
          const la = Math.floor(lum(ar, ag, ab) / 32); // 0..7
          const lb = Math.floor(lum(br, bg, bb) / 32);
          histA[Math.min(la, 7)] += 1;
          histB[Math.min(lb, 7)] += 1;
          samples += 1;
        }
      }
      if (samples === 0) continue;

      const mape = sumAbs / samples / 3; // mean abs per channel 0..255
      const mapeAgreement = Math.max(0, Math.min(100, 100 - (mape / 40) * 100));

      // Histogram agreement (Bhattacharyya coefficient, normalized).
      let histSum = 0;
      for (let k = 0; k < 8; k++) {
        histSum += Math.sqrt((histA[k] / samples) * (histB[k] / samples));
      }
      const histAgreement = Math.max(0, Math.min(100, histSum * 100));

      const score = Math.min(mapeAgreement, histAgreement);
      tiles.push({ x: tx, y: ty, width: tW, height: tH, score });
      acc += score * (tW * tH);
      accArea += tW * tH;
    }
  }

  const overall = accArea > 0 ? acc / accArea : 100;
  if (tiles.length === 0) warnings.push("no comparable regions sampled");
  return { overall, width, height, tileSize, tiles, warnings };
}

export interface FidelityOptions {
  /** Cap the comparison canvas at this many pixels on the long edge. */
  maxEdge?: number;
  tileSize?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
}

function drawScaled(src: string, maxEdge: number): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return loadImage(src).then((img) => {
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const scale = Math.min(1, maxEdge / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  });
}

/**
 * Compare a rasterized SVG against the original source capture.
 * Both inputs are image data URLs; they are drawn at the same sample scale
 * (longest edge ≤ `maxEdge`, default 1600) and compared with
 * `comparePixelBlocks`. Returns the fidelity report.
 */
export async function compareRenderedFidelity(
  sourceDataUrl: string,
  renderedSvgDataUrl: string,
  opts: FidelityOptions = {},
): Promise<VisualCompareReport> {
  const maxEdge = opts.maxEdge ?? 1600;
  const warnings: string[] = [];

  let source: { data: Uint8ClampedArray; width: number; height: number };
  let rendered: { data: Uint8ClampedArray; width: number; height: number };
  try {
    source = await drawScaled(sourceDataUrl, maxEdge);
  } catch {
    return { overall: 0, width: 0, height: 0, tileSize: 0, tiles: [], warnings: ["source capture could not be rasterized"] };
  }
  try {
    rendered = await drawScaled(renderedSvgDataUrl, maxEdge);
  } catch {
    return { overall: 0, width: source.width, height: source.height, tileSize: 0, tiles: [], warnings: ["rendered SVG could not be rasterized"] };
  }

  if (source.width !== rendered.width || source.height !== rendered.height) {
    warnings.push(
      `dimension mismatch (source ${source.width}×${source.height}, SVG ${rendered.width}×${rendered.height}) — comparing the overlapping region`,
    );
  }
  const w = Math.min(source.width, rendered.width);
  const h = Math.min(source.height, rendered.height);
  const a = source.data;
  const b = rendered.data;

  // Re-strip to the overlapping region.
  const aTrim = new Uint8ClampedArray(w * h * 4);
  const bTrim = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = y * source.width * 4;
    const dstStart = y * w * 4;
    aTrim.set(a.subarray(srcStart, srcStart + w * 4), dstStart);
    bTrim.set(b.subarray(y * rendered.width * 4, y * rendered.width * 4 + w * 4), dstStart);
  }

  const report = comparePixelBlocks(aTrim, bTrim, w, { tileSize: opts.tileSize });
  report.warnings = [...report.warnings, ...warnings];
  return report;
}
