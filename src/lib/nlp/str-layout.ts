/**
 * Stage 1 of the optional two-stage STR OCR pipeline: text-line box
 * detection via projection analysis (no model, no DOM).
 *
 * Pure and deterministic — it takes raw RGBA pixels and returns line boxes
 * in native pixel coordinates, so it runs in Node for smoke tests and in
 * the browser for the real pipeline.
 *
 * The detector is polarity-agnostic: it keys off per-channel gradient
 * ("edge energy") rather than "dark on light", so light text on dark
 * themes is detected just as well as dark text on white. Stage 2
 * (recognition) is `onnx-community/mgp-str-base` via Transformers.js, fed
 * one cropped line at a time; see `NlpService.ocrImage({ strategy: "str" })`.
 */
export interface TextSegment {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StrLayoutOptions {
  /** Analysis is performed at this max width; boxes scale back to native px. */
  maxAnalysisWidth?: number;
  /**
   * Longest single crop per line, in native px. Defaults to ~20× line
   * height (≈40 glyphs at the recognizer's 128px input width).
   */
  maxSegmentWidth?: number;
  /** Hard cap on returned segments (keeps the top-most first). */
  maxSegments?: number;
  /** Minimum band height at analysis scale (px). */
  minBandHeight?: number;
}

const DEFAULTS = {
  maxAnalysisWidth: 1600,
  maxSegments: 300,
  minBandHeight: 6,
} as const;

/** Clamp helper for band widening / segment padding. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function detectTextSegments(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: StrLayoutOptions = {},
): TextSegment[] {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return [];

  const { maxAnalysisWidth, maxSegments, minBandHeight } = {
    ...DEFAULTS,
    ...options,
  };
  const scale = Math.min(1, maxAnalysisWidth / width);
  const aw = Math.max(1, Math.round(width * scale));
  const ah = Math.max(1, Math.round(height * scale));

  /* ---------- sample the source into analysis-space RGB ---------- */

  const sampled = new Uint8Array(aw * ah * 3);
  for (let y = 0; y < ah; y++) {
    const sy = Math.min(height - 1, Math.round(y / scale));
    const rowSrc = sy * width;
    const rowDst = y * aw;
    for (let x = 0; x < aw; x++) {
      const sx = Math.min(width - 1, Math.round(x / scale));
      const s = (rowSrc + sx) * 4;
      const d = (rowDst + x) * 3;
      sampled[d] = rgba[s];
      sampled[d + 1] = rgba[s + 1];
      sampled[d + 2] = rgba[s + 2];
    }
  }

  /* ---------- edge energy = max per-channel gradient ---------- */

  const ink = new Float32Array(aw * ah);
  for (let y = 0; y < ah; y++) {
    const row = y * aw;
    for (let x = 0; x < aw; x++) {
      const i = (row + x) * 3;
      let best = 0;
      for (const dx of [-1, 1]) {
        const nx = clamp(x + dx, 0, aw - 1);
        const j = (row + nx) * 3;
        const dr = Math.abs(sampled[i] - sampled[j]);
        const dg = Math.abs(sampled[i + 1] - sampled[j + 1]);
        const db = Math.abs(sampled[i + 2] - sampled[j + 2]);
        best = Math.max(best, dr, dg, db);
      }
      ink[row + x] = best;
    }
  }

  /* ---------- horizontal projection → text-line bands ---------- */

  const rowEnergy = new Float32Array(ah);
  let total = 0;
  for (let y = 0; y < ah; y++) {
    const row = y * aw;
    let sum = 0;
    for (let x = 0; x < aw; x++) sum += ink[row + x];
    rowEnergy[y] = sum;
    total += sum;
  }
  const threshold = Math.max((total / (aw * ah)) * 1.5, 1);

  const rows = new Uint8Array(ah);
  for (let y = 0; y < ah; y++) rows[y] = rowEnergy[y] >= threshold ? 1 : 0;

  const bands: Array<[number, number]> = [];
  let y = 0;
  while (y < ah) {
    if (!rows[y]) {
      y++;
      continue;
    }
    let end = y;
    let gap = 0;
    while (end + 1 < ah && (rows[end + 1] === 1 || gap < 2)) {
      if (rows[end + 1] === 1) gap = 0;
      else gap++;
      end++;
    }
    // Widen by one row each side so ascenders/descenders just below the
    // threshold stay in the crop.
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(ah - 1, end + 1);
    if (y1 - y0 + 1 >= minBandHeight) bands.push([y0, y1]);
    y = end + 1;
  }

  /* ---------- vertical projection inside each band → segments ---------- */

  const segments: TextSegment[] = [];
  for (const [y0, y1] of bands) {
    const bandH = y1 - y0 + 1;

    const colEnergy = new Float32Array(aw);
    let bandSum = 0;
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * aw;
      for (let x = 0; x < aw; x++) {
        const e = ink[row + x];
        colEnergy[x] += e;
        bandSum += e;
      }
    }

    // Solid blocks (logo boxes, rules) only have ink on their borders, so
    // their active columns are a handful of edge spikes; text spreads ink
    // across the whole line. Require a spread of active columns.
    const colThresh = Math.max((bandSum / aw) * 0.5, 1);
    const active = new Uint8Array(aw);
    let activeCount = 0;
    for (let x = 0; x < aw; x++) {
      if (colEnergy[x] >= colThresh) {
        active[x] = 1;
        activeCount++;
      }
    }
    if (activeCount < Math.max(8, aw * 0.15)) continue;

    // Runs of active columns (merging gaps ≤ 2 px — word spaces larger
    // than that become split points for wide lines).
    const runs: Array<{ start: number; end: number }> = [];
    let x = 0;
    while (x < aw) {
      if (!active[x]) {
        x++;
        continue;
      }
      let end = x;
      let gap = 0;
      while (end + 1 < aw && (active[end + 1] === 1 || gap < 2)) {
        if (active[end + 1] === 1) gap = 0;
        else gap++;
        end++;
      }
      runs.push({ start: x, end });
      x = end + 1;
    }
    if (runs.length === 0) continue;

    // A single crop should hold at most ~40 glyphs; the recognizer squashes
    // whatever it gets into 32×128, so longer lines must be chunked.
    const maxSegW = options.maxSegmentWidth
      ? options.maxSegmentWidth * scale
      : Math.max(96, 20 * bandH);

    const chunk = (run: { start: number; end: number }): Array<{ start: number; end: number }> => {
      const out: Array<{ start: number; end: number }> = [];
      if (run.end - run.start + 1 <= maxSegW) {
        out.push(run);
        return out;
      }
      for (let s = run.start; s <= run.end; s += maxSegW) {
        out.push({ start: s, end: Math.min(run.end, s + maxSegW - 1) });
      }
      return out;
    };

    // Greedily group words (runs) into crops that fit the width budget.
    const pieces: Array<{ start: number; end: number }> = [];
    let cur: { start: number; end: number } | null = null;
    for (const run of runs) {
      if (!cur) {
        cur = { start: run.start, end: run.end };
        continue;
      }
      if (run.end - cur.start + 1 <= maxSegW) {
        cur.end = run.end;
      } else {
        pieces.push(...chunk(cur));
        cur = { start: run.start, end: run.end };
      }
    }
    if (cur) pieces.push(...chunk(cur));

    for (const p of pieces) {
      const ax0 = Math.max(0, p.start - 2);
      const ax1 = Math.min(aw - 1, p.end + 2);
      const seg: TextSegment = {
        x: Math.max(0, Math.round(ax0 / scale)),
        y: Math.max(0, Math.round(y0 / scale)),
        width: Math.max(1, Math.round((ax1 - ax0 + 1) / scale)),
        height: Math.max(1, Math.round((y1 - y0 + 1) / scale)),
      };
      if (seg.x + seg.width > width) seg.width = Math.max(1, width - seg.x);
      if (seg.y + seg.height > height) seg.height = Math.max(1, height - seg.y);
      // Drop degenerate slivers.
      if (seg.width < 4 || seg.height < 3) continue;
      segments.push(seg);
    }
  }

  segments.sort((a, b) => a.y - b.y || a.x - b.x);
  if (segments.length > maxSegments) segments.length = maxSegments;
  return segments;
}
