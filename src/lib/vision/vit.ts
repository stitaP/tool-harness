/**
 * Vision Transformer (ViT) — from-scratch implementation.
 *
 * Architecture matches a Tiny-ViT / DeiT-Small distilled variant:
 *   PatchEmbed → [CLS] + PositionalEmbed → N × TransformerBlock → Pool → Head
 *
 * All math is native TypeScript: no TF, no PyTorch, no external libs.
 * Weights are bundled as quantised INT8 arrays that the inference runner dequantises.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ViTConfig {
  /** Image side length (images are resized to image_size × image_size). */
  imageSize: number;
  /** Patch side length in pixels. */
  patchSize: number;
  /** Number of input channels (1 = greyscale, 3 = RGB). */
  inChannels: number;
  /** Transformer embedding dimension. */
  embedDim: number;
  /** Number of transformer encoder blocks. */
  depth: number;
  /** Number of attention heads per block. */
  numHeads: number;
  /** MLP hidden ratio inside each block (hidden = embedDim * mlpRatio). */
  mlpRatio: number;
  /** Number of output classes for the classification head. */
  numClasses: number;
  /** Number of UI-element labels the scene-parsing head can emit. */
  sceneLabels: number;
  /** Dropout rate (0 = no dropout at eval). */
  dropout: number;
}

export const TINY_VIT_CONFIG: ViTConfig = {
  imageSize: 224,
  patchSize: 16,
  inChannels: 3,
  embedDim: 192,
  depth: 12,
  numHeads: 3,
  mlpRatio: 4.0,
  numClasses: 1000, // ImageNet (backbone)
  sceneLabels: 64,  // UI-element labels
  dropout: 0.0,
};

// ─── Utility math ────────────────────────────────────────────────────────────

/** Gaussian random via Box-Muller. */
function randn(seed: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = seed();
  while (v === 0) v = seed();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Seeded PRNG (xorshift32). */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

// ─── Tensor helpers (flat Float32Array + shape) ──────────────────────────────

export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export function tensor(shape: number[], fill = 0): Tensor {
  const size = shape.reduce((a, b) => a * b, 1);
  return { data: new Float32Array(size).fill(fill), shape };
}

export function matmul(a: Tensor, b: Tensor): Tensor {
  // 2D × 2D: [M, K] × [K, N] → [M, N]
  // 3D × 2D: [B, M, K] × [K, N] → [B, M, N]
  const aDims = a.shape.length;
  if (aDims === 2) {
    const [M, K] = a.shape;
    const N = b.shape[1];
    const out = tensor([M, N]);
    for (let m = 0; m < M; m++) {
      for (let n = 0; n < N; n++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          sum += a.data[m * K + k] * b.data[k * N + n];
        }
        out.data[m * N + n] = sum;
      }
    }
    return out;
  }
  // Batched: [B, M, K] × [K, N] → [B, M, N]
  const [B, M, K] = a.shape;
  const N = b.shape[1];
  const out = tensor([B, M, N]);
  for (let bIdx = 0; bIdx < B; bIdx++) {
    const baseA = bIdx * M * K;
    const baseO = bIdx * M * N;
    for (let m = 0; m < M; m++) {
      for (let n = 0; n < N; n++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          sum += a.data[baseA + m * K + k] * b.data[k * N + n];
        }
        out.data[baseO + m * N + n] = sum;
      }
    }
  }
  return out;
}

export function addBias(x: Tensor, bias: Tensor): Tensor {
  // bias: [N] → broadcast over leading dims of x: [*, N]
  const N = bias.shape[0];
  const out = tensor(x.shape);
  const total = x.data.length;
  for (let i = 0; i < total; i++) {
    out.data[i] = x.data[i] + bias.data[i % N];
  }
  return out;
}

/** Element-wise add: x + y (same shape). */
export function add(x: Tensor, y: Tensor): Tensor {
  const out = tensor(x.shape);
  for (let i = 0; i < x.data.length; i++) {
    out.data[i] = x.data[i] + y.data[i];
  }
  return out;
}

export function layerNorm(x: Tensor, gamma: Tensor, beta: Tensor, eps = 1e-5): Tensor {
  // x: [*, D]
  const D = x.shape[x.shape.length - 1];
  const out = tensor(x.shape);
  const outerCount = x.data.length / D;
  for (let i = 0; i < outerCount; i++) {
    let mean = 0;
    for (let d = 0; d < D; d++) mean += x.data[i * D + d];
    mean /= D;
    let var_ = 0;
    for (let d = 0; d < D; d++) {
      const diff = x.data[i * D + d] - mean;
      var_ += diff * diff;
    }
    var_ /= D;
    const inv = 1.0 / Math.sqrt(var_ + eps);
    for (let d = 0; d < D; d++) {
      out.data[i * D + d] = (x.data[i * D + d] - mean) * inv * gamma.data[d] + beta.data[d];
    }
  }
  return out;
}

/** GELU activation (approximation). */
export function gelu(x: Tensor): Tensor {
  const out = tensor(x.shape);
  for (let i = 0; i < x.data.length; i++) {
    const v = x.data[i];
    out.data[i] = 0.5 * v * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * v * v * v)));
  }
  return out;
}

/** Softmax over the last dimension. */
export function softmax(x: Tensor): Tensor {
  const D = x.shape[x.shape.length - 1];
  const out = tensor(x.shape);
  const outerCount = x.data.length / D;
  for (let i = 0; i < outerCount; i++) {
    let max = -Infinity;
    for (let d = 0; d < D; d++) max = Math.max(max, x.data[i * D + d]);
    let sum = 0;
    for (let d = 0; d < D; d++) {
      out.data[i * D + d] = Math.exp(x.data[i * D + d] - max);
      sum += out.data[i * D + d];
    }
    for (let d = 0; d < D; d++) out.data[i * D + d] /= sum;
  }
  return out;
}

/** Reshape tensor (copies data). */
export function reshape(x: Tensor, newShape: number[]): Tensor {
  const newSize = newShape.reduce((a, b) => a * b, 1);
  if (newSize !== x.data.length) throw new Error(`Reshape: size mismatch ${newSize} vs ${x.data.length}`);
  return { data: new Float32Array(x.data), shape: newShape };
}

/** Transpose last two dims: [..., A, B] → [..., B, A]. */
export function transpose2d(x: Tensor): Tensor {
  const [A, B] = x.shape.slice(-2);
  const outShape = [...x.shape.slice(0, -2), B, A];
  const out = tensor(outShape);
  const outerCount = x.data.length / (A * B);
  for (let i = 0; i < outerCount; i++) {
    for (let a = 0; a < A; a++) {
      for (let b = 0; b < B; b++) {
        out.data[i * B * A + b * A + a] = x.data[i * A * B + a * B + b];
      }
    }
  }
  return out;
}

// ─── Layer: Multi-Head Self-Attention ────────────────────────────────────────

export interface MHAWeights {
  qkv_w: Tensor;  // [3*D, D]
  qkv_b: Tensor;  // [3*D]
  proj_w: Tensor;  // [D, D]
  proj_b: Tensor;  // [D]
}

export function mhaForward(
  x: Tensor,      // [B, S, D]
  w: MHAWeights,
  numHeads: number,
): Tensor {
  const [B, S, D] = x.shape;
  const H = numHeads;
  const Hd = D / H;

  // QKV projection: [B, S, D] → [B, S, 3D]
  let qkv = matmul(x, transpose2d(reshape(w.qkv_w, [3 * D, D])));
  qkv = addBias(qkv, w.qkv_b);
  qkv = reshape(qkv, [B, S, 3, H, Hd]);

  // Split Q, K, V: each [B, H, S, Hd]
  const q = tensor([B, H, S, Hd]);
  const k = tensor([B, H, S, Hd]);
  const v = tensor([B, H, S, Hd]);
  for (let b = 0; b < B; b++) {
    for (let h = 0; h < H; h++) {
      for (let s = 0; s < S; s++) {
        for (let d = 0; d < Hd; d++) {
          const idx = ((b * S + s) * 3 + 0) * H * Hd + h * Hd + d;
          q.data[((b * H + h) * S + s) * Hd + d] = qkv.data[idx];
          k.data[((b * H + h) * S + s) * Hd + d] = qkv.data[idx + H * Hd];
          v.data[((b * H + h) * S + s) * Hd + d] = qkv.data[idx + 2 * H * Hd];
        }
      }
    }
  }

  // Attention: score = Q @ K^T / sqrt(Hd)
  const scale = 1.0 / Math.sqrt(Hd);
  const attnOut = tensor([B, H, S, Hd]);
  for (let b = 0; b < B; b++) {
    for (let h = 0; h < H; h++) {
      // scores: [S, S]
      const scores = tensor([S, S]);
      for (let i = 0; i < S; i++) {
        for (let j = 0; j < S; j++) {
          let dot = 0;
          for (let d = 0; d < Hd; d++) {
            dot += q.data[((b * H + h) * S + i) * Hd + d] *
                   k.data[((b * H + h) * S + j) * Hd + d];
          }
          scores.data[i * S + j] = dot * scale;
        }
      }
      // softmax over last dim
      const probs = softmax(scores);
      // out = probs @ V
      for (let i = 0; i < S; i++) {
        for (let d = 0; d < Hd; d++) {
          let sum = 0;
          for (let j = 0; j < S; j++) {
            sum += probs.data[i * S + j] * v.data[((b * H + h) * S + j) * Hd + d];
          }
          attnOut.data[((b * H + h) * S + i) * Hd + d] = sum;
        }
      }
    }
  }

  // Concat heads: [B, H, S, Hd] → [B, S, D]
  const concat = tensor([B, S, D]);
  for (let b = 0; b < B; b++) {
    for (let h = 0; h < H; h++) {
      for (let s = 0; s < S; s++) {
        for (let d = 0; d < Hd; d++) {
          concat.data[(b * S + s) * D + h * Hd + d] =
            attnOut.data[((b * H + h) * S + s) * Hd + d];
        }
      }
    }
  }

  // Output projection
  let out = matmul(concat, transpose2d(reshape(w.proj_w, [D, D])));
  out = addBias(out, w.proj_b);
  return out;
}

// ─── Layer: MLP Block ────────────────────────────────────────────────────────

export interface MLPWeights {
  fc1_w: Tensor; // [hidden, D]
  fc1_b: Tensor; // [hidden]
  fc2_w: Tensor; // [D, hidden]
  fc2_b: Tensor; // [D]
}

export function mlpForward(x: Tensor, w: MLPWeights): Tensor {
  const D = x.shape[x.shape.length - 1];
  let h = matmul(x, transpose2d(w.fc1_w));
  h = addBias(h, w.fc1_b);
  h = gelu(h);
  let out = matmul(h, transpose2d(w.fc2_w));
  out = addBias(out, w.fc2_b);
  return out;
}

// ─── Transformer Block ───────────────────────────────────────────────────────

export interface TransformerBlockWeights {
  ln1_gamma: Tensor; // [D]
  ln1_beta: Tensor;  // [D]
  mha: MHAWeights;
  ln2_gamma: Tensor; // [D]
  ln2_beta: Tensor;  // [D]
  mlp: MLPWeights;
}

export function transformerBlockForward(
  x: Tensor,          // [B, S, D]
  w: TransformerBlockWeights,
  numHeads: number,
): Tensor {
  const D = x.shape[x.shape.length - 1];

  // Pre-norm attention + residual
  let normed = layerNorm(x, w.ln1_gamma, w.ln1_beta);
  let attnOut = mhaForward(normed, w.mha, numHeads);
  let h = tensor(x.shape);
  for (let i = 0; i < x.data.length; i++) h.data[i] = x.data[i] + attnOut.data[i];

  // Pre-norm MLP + residual
  normed = layerNorm(h, w.ln2_gamma, w.ln2_beta);
  const mlpOut = mlpForward(normed, w.mlp);
  const out = tensor(h.shape);
  for (let i = 0; i < h.data.length; i++) out.data[i] = h.data[i] + mlpOut.data[i];

  return out;
}

// ─── Patch Embedding ─────────────────────────────────────────────────────────

export interface PatchEmbedWeights {
  proj_w: Tensor; // [D, P*P*C]
  proj_b: Tensor; // [D]
  pos_embed: Tensor; // [1, N+1, D]  (CLS + patches)
}

/**
 * Patch embedding: unfold image into non-overlapping patches,
 * linearly project each to embedDim, add positional embeddings.
 *
 * Input:  [B, C, H, W]  (pixel values normalised to [0,1])
 * Output: [B, N+1, D]   (CLS token + N patch tokens)
 */
export function patchEmbed(
  x: Tensor,       // [B, C, H, W]
  w: PatchEmbedWeights,
  patchSize: number,
): Tensor {
  const [B, C, H, W] = x.shape;
  const D = w.proj_b.shape[0];
  const pH = H / patchSize;
  const pW = W / patchSize;
  const N = pH * pW;
  const PC = patchSize * patchSize * C;

  // Flatten patches: [B, N, PC]
  const patches = tensor([B, N, PC]);
  for (let b = 0; b < B; b++) {
    let n = 0;
    for (let py = 0; py < pH; py++) {
      for (let px = 0; px < pW; px++) {
        let c = 0;
        for (let ch = 0; ch < C; ch++) {
          for (let dy = 0; dy < patchSize; dy++) {
            for (let dx = 0; dx < patchSize; dx++) {
              patches.data[(b * N + n) * PC + c] =
                x.data[((b * C + ch) * H + py * patchSize + dy) * W + px * patchSize + dx];
              c++;
            }
          }
        }
        n++;
      }
    }
  }

  // Linear projection: [B, N, PC] → [B, N, D]
  let projected = matmul(patches, transpose2d(reshape(w.proj_w, [D, PC])));
  projected = addBias(projected, w.proj_b);

  // Prepend CLS token: [B, 1, D] + [B, N, D] → [B, N+1, D]
  const clsToken = tensor([B, 1, D]);
  for (let d = 0; d < D; d++) clsToken.data[d] = w.pos_embed.data[d]; // CLS pos embed

  const all = tensor([B, N + 1, D]);
  for (let b = 0; b < B; b++) {
    // CLS
    for (let d = 0; d < D; d++) {
      all.data[(b * (N + 1)) * D + d] = clsToken.data[b * D + d] + projected.data[b * N * D + d];
    }
    // Patches + positional
    for (let n = 0; n < N; n++) {
      for (let d = 0; d < D; d++) {
        all.data[(b * (N + 1) + n + 1) * D + d] =
          projected.data[(b * N + n) * D + d] + w.pos_embed.data[(n + 1) * D + d];
      }
    }
  }

  return all;
}

// ─── Full ViT Model ──────────────────────────────────────────────────────────

export interface ViTWeights {
  patchEmbed: PatchEmbedWeights;
  blocks: TransformerBlockWeights[];
  ln_final_gamma: Tensor; // [D]
  ln_final_beta: Tensor;  // [D]
  cls_head_w: Tensor;     // [numClasses, D]
  cls_head_b: Tensor;     // [numClasses]
  scene_head_w: Tensor;   // [sceneLabels, D]
  scene_head_b: Tensor;   // [sceneLabels]
}

export interface ViTOutput {
  /** Raw classification logits [numClasses]. */
  classificationLogits: Float32Array;
  /** Scene-element logits [sceneLabels]. */
  sceneLogits: Float32Array;
  /** Pooled embedding [D] — can be used for similarity search. */
  pooledEmbedding: Float32Array;
  /** CLS token features after final layer norm [D]. */
  clsFeatures: Float32Array;
}

export function vitForward(
  pixels: Tensor,    // [1, C, H, W]
  weights: ViTWeights,
  config: ViTConfig,
): ViTOutput {
  // Patch embed
  let x = patchEmbed(pixels, weights.patchEmbed, config.patchSize);

  // Transformer blocks
  for (let i = 0; i < config.depth; i++) {
    x = transformerBlockForward(x, weights.blocks[i], config.numHeads);
  }

  // Final layer norm on CLS token
  const D = config.embedDim;
  const clsNormed = layerNorm(
    { data: x.data.slice(0, D), shape: [1, D] },
    weights.ln_final_gamma,
    weights.ln_final_beta,
  );

  // Classification head
  let clsLogits = matmul(clsNormed, transpose2d(reshape(weights.cls_head_w, [config.numClasses, D])));
  clsLogits = addBias(clsLogits, weights.cls_head_b);

  // Scene head
  let sceneLogits = matmul(clsNormed, transpose2d(reshape(weights.scene_head_w, [config.sceneLabels, D])));
  sceneLogits = addBias(sceneLogits, weights.scene_head_b);

  return {
    classificationLogits: clsLogits.data,
    sceneLogits: sceneLogits.data,
    pooledEmbedding: clsNormed.data.slice(0),
    clsFeatures: clsNormed.data.slice(0),
  };
}

// ─── Weight Initialisation ───────────────────────────────────────────────────

export function initViTWeights(config: ViTConfig, seed = 42): ViTWeights {
  const rng = createRng(seed);
  const rand = () => randn(rng);
  const D = config.embedDim;
  const PC = config.patchSize * config.patchSize * config.inChannels;
  const hidden = Math.round(D * config.mlpRatio);
  const N = (config.imageSize / config.patchSize) ** 2;

  const fanIn = (rows: number) => Math.sqrt(2 / rows);

  function weight(rows: number, cols: number): Tensor {
    const t = tensor([rows, cols]);
    const scale = fanIn(rows);
    for (let i = 0; i < t.data.length; i++) t.data[i] = rand() * scale;
    return t;
  }

  function bias(size: number): Tensor {
    return tensor([size]);
  }

  function ones(size: number): Tensor {
    return tensor([size], 1);
  }

  function zeros(size: number): Tensor {
    return tensor([size], 0);
  }

  const blocks: TransformerBlockWeights[] = [];
  for (let i = 0; i < config.depth; i++) {
    blocks.push({
      ln1_gamma: ones(D),
      ln1_beta: zeros(D),
      mha: {
        qkv_w: weight(3 * D, D),
        qkv_b: bias(3 * D),
        proj_w: weight(D, D),
        proj_b: bias(D),
      },
      ln2_gamma: ones(D),
      ln2_beta: zeros(D),
      mlp: {
        fc1_w: weight(hidden, D),
        fc1_b: bias(hidden),
        fc2_w: weight(D, hidden),
        fc2_b: bias(D),
      },
    });
  }

  // Positional embedding: [1, N+1, D]
  const posEmbed = tensor([1, N + 1, D]);
  for (let i = 0; i < posEmbed.data.length; i++) {
    posEmbed.data[i] = rand() * 0.02;
  }

  return {
    patchEmbed: {
      proj_w: weight(D, PC),
      proj_b: bias(D),
      pos_embed: posEmbed,
    },
    blocks,
    ln_final_gamma: ones(D),
    ln_final_beta: zeros(D),
    cls_head_w: weight(config.numClasses, D),
    cls_head_b: bias(config.numClasses),
    scene_head_w: weight(config.sceneLabels, D),
    scene_head_b: bias(config.sceneLabels),
  };
}

// ─── Quantisation / Serialisation ────────────────────────────────────────────

/**
 * Quantise Float32 weights to INT8 (asymmetric) for bundling.
 * Returns { scale, zeroPoint, data: Uint8Array }.
 */
export function quantiseINT8(data: Float32Array): {
  scale: number;
  zeroPoint: number;
  data: Uint8Array;
} {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  const range = max - min || 1;
  const scale = range / 255;
  const zeroPoint = Math.round(-min / scale);
  const q = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    q[i] = Math.min(255, Math.max(0, Math.round(data[i] / scale + zeroPoint)));
  }
  return { scale, zeroPoint, data: q };
}

/** Dequantise INT8 back to Float32. */
export function dequantiseINT8(
  q: { scale: number; zeroPoint: number; data: Uint8Array },
  length: number,
): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = (q.data[i] - q.zeroPoint) * q.scale;
  }
  return out;
}

/**
 * Flatten all weights into a single ArrayBuffer and return a compact bundle.
 * Format: magic(4) + version(2) + numTensors(4) + [tensorHeader + data]...
 */
export function serialiseWeights(weights: ViTWeights): ArrayBuffer {
  // Collect all named tensors
  const tensors: Array<{ name: string; data: Float32Array }> = [];
  function collect(name: string, t: Tensor) {
    tensors.push({ name, data: t.data });
  }

  collect("pe.proj_w", weights.patchEmbed.proj_w);
  collect("pe.proj_b", weights.patchEmbed.proj_b);
  collect("pe.pos", weights.patchEmbed.pos_embed);
  collect("lnf.g", weights.ln_final_gamma);
  collect("lnf.b", weights.ln_final_beta);
  collect("cls.w", weights.cls_head_w);
  collect("cls.b", weights.cls_head_b);
  collect("scn.w", weights.scene_head_w);
  collect("scn.b", weights.scene_head_b);

  for (let i = 0; i < weights.blocks.length; i++) {
    const b = weights.blocks[i];
    collect(`b${i}.ln1g`, b.ln1_gamma);
    collect(`b${i}.ln1b`, b.ln1_beta);
    collect(`b${i}.qkvw`, b.mha.qkv_w);
    collect(`b${i}.qkvb`, b.mha.qkv_b);
    collect(`b${i}.projw`, b.mha.proj_w);
    collect(`b${i}.projb`, b.mha.proj_b);
    collect(`b${i}.ln2g`, b.ln2_gamma);
    collect(`b${i}.ln2b`, b.ln2_beta);
    collect(`b${i}.fc1w`, b.mlp.fc1_w);
    collect(`b${i}.fc1b`, b.mlp.fc1_b);
    collect(`b${i}.fc2w`, b.mlp.fc2_w);
    collect(`b${i}.fc2b`, b.mlp.fc2_b);
  }

  // Layout: [magic:4][version:2][numTensors:4][for each: nameLen:2][name][pad4][dataLen:4][data]
  let totalBytes = 10; // header
  for (const t of tensors) {
    const nameEnd = totalBytes + 2 + t.name.length;
    const pad = (4 - (nameEnd % 4)) % 4;
    totalBytes = nameEnd + pad + 4 + t.data.length * 4;
  }

  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let offset = 0;

  // Magic: "ViTW"
  view.setUint8(offset++, 0x56); // V
  view.setUint8(offset++, 0x69); // i
  view.setUint8(offset++, 0x54); // T
  view.setUint8(offset++, 0x57); // W
  // Version
  view.setUint16(offset, 1, true); offset += 2;
  // Num tensors
  view.setUint32(offset, tensors.length, true); offset += 4;

  for (const t of tensors) {
    // Name
    view.setUint16(offset, t.name.length, true); offset += 2;
    for (let i = 0; i < t.name.length; i++) {
      view.setUint8(offset++, t.name.charCodeAt(i));
    }
    // Pad to 4-byte alignment
    while (offset % 4 !== 0) offset++;
    // Data
    view.setUint32(offset, t.data.length, true); offset += 4;
    const f32 = new Float32Array(buf, offset, t.data.length);
    f32.set(t.data);
    offset += t.data.length * 4;
  }

  return buf.slice(0, offset);
}

/** Weight tensor name registry — order matches serialiseWeights. */
export const WEIGHT_NAMES = [
  "pe.proj_w", "pe.proj_b", "pe.pos",
  "lnf.g", "lnf.b",
  "cls.w", "cls.b", "scn.w", "scn.b",
] as const;
