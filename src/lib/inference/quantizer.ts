/**
 * stitaP Inference — In-House Quantizer
 *
 * Converts full-precision weight tensors into the small-bit builds the
 * rest of the platform documents: Q8_0, Q4_K, Q3_K, Q2_K, importance-
 * weighted IQ builds, and BitNet-style b1.58 ternary weights.
 *
 * The math follows the GGUF block scheme: weights are grouped into
 * blocks of 32, super-blocks of 256; each block stores a scale (and
 * minimum where applicable) plus N-bit integer codes. IQ builds differ
 * only in the objective: code selection minimizes IMPORTANCE-WEIGHTED
 * error, using per-weight weights measured by a calibration pass.
 *
 * Everything here is pure TypeScript with zero dependencies, so the
 * same engine runs in the browser (planning + verification on sampled
 * tensors) and in the desktop engine (full-file conversion).
 *
 * Rules encoded from the manual:
 * - Always quantize from ORIGINAL weights; requantization is refused.
 * - Sub-4-bit builds carry explicit quality warnings.
 * - Every build is verified against the original before being trusted.
 */

// ─── Formats ──────────────────────────────────────────────────────────────────

export type QuantBuildFormat = "q8_0" | "q4_k" | "q3_k" | "q2_k" | "iq2" | "iq3" | "b158";

export interface QuantFormatSpec {
  format: QuantBuildFormat;
  label: string;
  bitsPerWeight: number;
  blockSize: number;
  /** Bits per code, where the format stores uniform-width codes */
  codeBits: number;
  /** Importance-weighted error minimization (IQ family) */
  importanceWeighted: boolean;
  /** Trained-quantized family (BitNet) — never produced by conversion */
  bornQuantized: boolean;
  qualityNote: string;
}

export const QUANT_FORMATS: Record<QuantBuildFormat, QuantFormatSpec> = {
  q8_0: {
    format: "q8_0",
    label: "Q8_0",
    bitsPerWeight: 8.5,
    blockSize: 32,
    codeBits: 8,
    importanceWeighted: false,
    bornQuantized: false,
    qualityNote: "Near-lossless. Half the size of FP16. The safe default when memory allows.",
  },
  q4_k: {
    format: "q4_k",
    label: "Q4_K_M",
    bitsPerWeight: 4.85,
    blockSize: 256,
    codeBits: 4,
    importanceWeighted: false,
    bornQuantized: false,
    qualityNote: "Best quality-per-byte. The platform default for ordinary tasks.",
  },
  q3_k: {
    format: "q3_k",
    label: "Q3_K_M",
    bitsPerWeight: 3.9,
    blockSize: 256,
    codeBits: 3,
    importanceWeighted: false,
    bornQuantized: false,
    qualityNote: "Tight laptops. Small quality cost; fine for extraction and tool calling.",
  },
  q2_k: {
    format: "q2_k",
    label: "Q2_K",
    bitsPerWeight: 3.35,
    blockSize: 256,
    codeBits: 2,
    importanceWeighted: false,
    bornQuantized: false,
    qualityNote: "Legacy 2-bit. Prefer an IQ2 build of the same size. Simple tasks only.",
  },
  iq2: {
    format: "iq2",
    label: "IQ2_XS",
    bitsPerWeight: 2.45,
    blockSize: 256,
    codeBits: 2,
    importanceWeighted: true,
    bornQuantized: false,
    qualityNote: "Importance-weighted 2-bit: scarce bits protect the weights that matter. Short, simple tasks on very small machines.",
  },
  iq3: {
    format: "iq3",
    label: "IQ3_XS",
    bitsPerWeight: 3.3,
    blockSize: 256,
    codeBits: 3,
    importanceWeighted: true,
    bornQuantized: false,
    qualityNote: "Importance-weighted 3-bit: nearly Q4 quality at three-quarters of the size.",
  },
  b158: {
    format: "b158",
    label: "BitNet b1.58",
    bitsPerWeight: 1.58,
    blockSize: 256,
    codeBits: 2,
    importanceWeighted: false,
    bornQuantized: true,
    qualityNote: "Ternary weights (-1/0/+1) trained in from the start. Smallest usable builds; choose for the memory floor, not capability.",
  },
};

// ─── Block quantization ────────────────────────────────────────────────────────

/** A quantized block: scale, optional min, and the integer codes. */
export interface QuantizedBlock {
  scale: number;
  min: number;
  /** Quantized integer codes, one per weight */
  codes: number[];
}

export interface QuantizedTensor {
  format: QuantBuildFormat;
  /** Original tensor shape (row-major) */
  rows: number;
  cols: number;
  blocks: QuantizedBlock[];
}

/** Clamp helper */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Round to nearest integer code within [0, maxCode] for scale/min encoding */
function quantizeUniform(w: number[], blockSize: number, codeBits: number): QuantizedBlock[] {
  const maxCode = (1 << codeBits) - 1;
  const blocks: QuantizedBlock[] = [];
  for (let i = 0; i < w.length; i += blockSize) {
    const block = w.slice(i, i + blockSize);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of block) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo || 1e-12;
    const scale = range / maxCode;
    const codes = block.map((v) => clamp(Math.round((v - lo) / scale), 0, maxCode));
    blocks.push({ scale, min: lo, codes });
  }
  return blocks;
}

/**
 * Importance-weighted quantization: choose the scale that minimizes
 * SUM(importance_i * (w_i - dequant_i)^2) by scanning candidate scales
 * around the uniform one. This is the in-house core of the IQ family.
 */
function quantizeWeighted(
  w: number[],
  importance: number[],
  blockSize: number,
  codeBits: number,
): QuantizedBlock[] {
  const maxCode = (1 << codeBits) - 1;
  const blocks: QuantizedBlock[] = [];
  for (let i = 0; i < w.length; i += blockSize) {
    const block = w.slice(i, i + blockSize);
    const imp = importance.slice(i, i + blockSize);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of block) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo || 1e-12;
    const baseScale = range / maxCode;
    let best: QuantizedBlock | null = null;
    let bestErr = Infinity;
    // Scan scales around the uniform choice; weighted error decides.
    for (let s = -4; s <= 4; s++) {
      const scale = baseScale * Math.pow(2, s * 0.25);
      const codes = block.map((v) => clamp(Math.round((v - lo) / scale), 0, maxCode));
      let err = 0;
      for (let j = 0; j < block.length; j++) {
        const d = block[j] - (codes[j] * scale + lo);
        err += (imp[j] ?? 1) * d * d;
      }
      if (err < bestErr) {
        bestErr = err;
        best = { scale, min: lo, codes };
      }
    }
    blocks.push(best!);
  }
  return blocks;
}

/**
 * BitNet b1.58 ternary quantization: weights map to {-1, 0, +1} with a
 * per-block scale (the mean of absolute non-zero values). Only valid on
 * tensors FROM a b1.58-trained model when converting between runtimes;
 * applying it to a dense model is refused by planQuantization.
 */
function quantizeTernary(w: number[], blockSize: number): QuantizedBlock[] {
  const blocks: QuantizedBlock[] = [];
  for (let i = 0; i < w.length; i += blockSize) {
    const block = w.slice(i, i + blockSize);
    // Scale: mean absolute value of the block's largest magnitudes.
    const abs = block.map(Math.abs).sort((a, b2) => b2 - a);
    const top = abs.slice(0, Math.max(1, Math.floor(block.length * 0.7)));
    const scale = top.reduce((a, v) => a + v, 0) / top.length || 1e-12;
    const codes = block.map((v) => {
      const r = v / scale;
      return r > 0.5 ? 2 : r < -0.5 ? 0 : 1; // 0 -> -1, 1 -> 0, 2 -> +1
    });
    blocks.push({ scale, min: 0, codes });
  }
  return blocks;
}

/** Quantize a full-precision weight vector to the requested build. */
export function quantizeTensor(
  weights: number[],
  format: QuantBuildFormat,
  importance?: number[],
): QuantizedTensor {
  if (importance && importance.length !== weights.length) {
    throw new Error("importance array must match weights length");
  }
  const spec = QUANT_FORMATS[format];
  const blockSize = spec.format === "q8_0" ? spec.blockSize : spec.blockSize;
  let blocks: QuantizedBlock[];
  if (spec.bornQuantized) {
    blocks = quantizeTernary(weights, blockSize);
  } else if (spec.importanceWeighted && importance) {
    blocks = quantizeWeighted(weights, importance, blockSize, spec.codeBits);
  } else {
    blocks = quantizeUniform(weights, blockSize, spec.codeBits);
  }
  return { format, rows: 1, cols: weights.length, blocks };
}

/** Dequantize back to full precision — the reference for verification. */
export function dequantizeTensor(t: QuantizedTensor): number[] {
  const out: number[] = [];
  const spec = QUANT_FORMATS[t.format];
  for (const b of t.blocks) {
    for (const c of b.codes) {
      if (spec.bornQuantized) {
        out.push((c - 1) * b.scale); // 0 -> -scale, 1 -> 0, 2 -> +scale
      } else {
        out.push(c * b.scale + b.min);
      }
    }
  }
  return out;
}

/** Root-mean-square error between original and rebuilt weights. */
export function rmsError(original: number[], rebuilt: number[]): number {
  let sum = 0;
  for (let i = 0; i < original.length; i++) {
    const d = original[i] - rebuilt[i];
    sum += d * d;
  }
  return Math.sqrt(sum / original.length);
}

/** Importance-weighted error — what IQ builds actually minimize. */
export function weightedRmsError(
  original: number[],
  rebuilt: number[],
  importance: number[],
): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < original.length; i++) {
    const d = original[i] - rebuilt[i];
    sum += (importance[i] ?? 1) * d * d;
    wsum += importance[i] ?? 1;
  }
  return Math.sqrt(sum / (wsum || 1));
}

/**
 * Estimate the calibration-derived importance for a weight vector from
 * activation magnitudes. In the full pipeline the calibration pass runs
 * text through the model and records per-input activations; this helper
 * derives the same shape of table from sampled activations.
 */
export function deriveImportance(activations: number[], weightCount: number): number[] {
  const importance = new Array<number>(weightCount).fill(1);
  if (activations.length === 0) return importance;
  for (let i = 0; i < weightCount; i++) {
    importance[i] = 1 + Math.abs(activations[i % activations.length]);
  }
  return importance;
}

// ─── Build planning ────────────────────────────────────────────────────────────

export interface QuantBuildPlan {
  model: string;
  parameterBillions: number;
  /** Builds to CREATE, in creation order */
  builds: Array<{
    format: QuantBuildFormat;
    label: string;
    estimatedGb: number;
    fitsTarget: boolean;
    reason: string;
  }>;
  /** Builds refused, with the honest reason */
  refusals: Array<{ format: QuantBuildFormat; reason: string }>;
  warnings: string[];
}

const GB = 1024 * 1024 * 1024;

/** Estimate on-disk GB for a model at a build level (params × bits/8 × 1.15 container overhead). */
export function estimateBuildGb(parameterBillions: number, format: QuantBuildFormat): number {
  const spec = QUANT_FORMATS[format];
  return Math.round(parameterBillions * spec.bitsPerWeight * 0.115 * 10) / 10;
}

/**
 * Plan which builds to create for a model on a target machine.
 * Encodes the manual's rules: original weights required, sub-4-bit
 * warnings, BitNet only from trained-ternary sources.
 */
export function planQuantization(opts: {
  model: string;
  parameterBillions: number;
  originalWeightsAvailable: boolean;
  sourceIsBornQuantized: boolean;
  targetFreeRamGb: number;
  wantsImportanceMatrix: boolean;
}): QuantBuildPlan {
  const { model, parameterBillions, originalWeightsAvailable, sourceIsBornQuantized, targetFreeRamGb } = opts;
  const builds: QuantBuildPlan["builds"] = [];
  const refusals: QuantBuildPlan["refusals"] = [];
  const warnings: string[] = [];

  if (!originalWeightsAvailable && !sourceIsBornQuantized) {
    warnings.push(
      "Original FP16 weights are not available. Only pre-made quants can be used; creating new builds from an already-quantized file is refused (compounding loss).",
    );
    return { model, parameterBillions, builds: [], refusals: [], warnings };
  }

  const order: QuantBuildFormat[] = ["q8_0", "q4_k", "iq3", "q3_k", "iq2", "q2_k", "b158"];
  for (const format of order) {
    const spec = QUANT_FORMATS[format];
    const gb = estimateBuildGb(parameterBillions, format);
    const fits = gb <= targetFreeRamGb * 0.75;

    if (spec.bornQuantized && !sourceIsBornQuantized) {
      refusals.push({
        format,
        reason:
          "b1.58 is a TRAINED format: converting a dense model to ternary destroys it. Download an official BitNet GGUF instead.",
      });
      continue;
    }
    if (spec.importanceWeighted && !opts.wantsImportanceMatrix) {
      refusals.push({
        format,
        reason: "IQ builds need a calibration pass (importance matrix). Enable calibration to create one.",
      });
      continue;
    }

    builds.push({
      format,
      label: spec.label,
      estimatedGb: gb,
      fitsTarget: fits,
      reason: fits
        ? `Fits in ${targetFreeRamGb.toFixed(1)} GB free with headroom`
        : `Needs ${gb} GB — exceeds the ${targetFreeRamGb.toFixed(1)} GB free`,
    });
  }

  if (builds.some((b2) => QUANT_FORMATS[b2.format].bitsPerWeight < 4)) {
    warnings.push(
      "Sub-4-bit builds degrade multi-step reasoning and code generation. Verify against a Q4 build on ten fixed questions before trusting one.",
    );
  }

  return { model, parameterBillions, builds, refusals, warnings };
}

// ─── Verification ──────────────────────────────────────────────────────────────

export interface VerificationReport {
  format: QuantBuildFormat;
  label: string;
  rmsError: number;
  weightedRmsError?: number;
  /** Relative error vs the tensor's own magnitude */
  relativeError: number;
  passed: boolean;
  verdict: string;
}

/**
 * Verify a build by rebuilding sampled tensors and measuring error.
 * A build passes when relative error stays within the tolerance for
 * its bit level — the same check the manual tells users to run with
 * ten fixed questions, applied here to the weights themselves.
 */
export function verifyBuild(
  original: number[],
  format: QuantBuildFormat,
  importance?: number[],
): VerificationReport {
  const t = quantizeTensor(original, format, importance);
  const rebuilt = dequantizeTensor(t);
  const err = rmsError(original, rebuilt);
  const magnitude = Math.sqrt(original.reduce((a, v) => a + v * v, 0) / original.length) || 1e-12;
  const rel = err / magnitude;
  const spec = QUANT_FORMATS[format];
  // Tolerances: tighter formats allow less relative error.
  const tolerance =
    format === "q8_0" ? 0.02 : format === "q4_k" ? 0.06 : format === "b158" ? 0.35 : 0.12;
  const passed = rel <= tolerance;
  return {
    format,
    label: spec.label,
    rmsError: err,
    weightedRmsError:
      importance && spec.importanceWeighted ? weightedRmsError(original, rebuilt, importance) : undefined,
    relativeError: rel,
    passed,
    verdict: passed
      ? `${spec.label}: ${ (rel * 100).toFixed(1) }% relative error — within tolerance for ${spec.bitsPerWeight}-bit.`
      : `${spec.label}: ${ (rel * 100).toFixed(1) }% relative error exceeds the ${spec.bitsPerWeight}-bit tolerance — use a higher-bit build.`,
  };
}
