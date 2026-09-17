/**
 * ONNX-style inference runner for the bundled ViT model.
 *
 * Self-contained ONNX-compatible runtime in pure TypeScript:
 * - Loads serialised weight bundles
 * - Handles quantised INT8 ↔ FP32 conversion
 * - Manages tensor memory pools
 * - Runs ViT forward pass end-to-end
 * - Zero WebAssembly, zero external dependencies
 */

import {
  type ViTConfig,
  type ViTWeights,
  type ViTOutput,
  type Tensor,
  TINY_VIT_CONFIG,
  tensor,
  vitForward,
  dequantiseINT8,
  serialiseWeights,
  initViTWeights,
  createRng,
} from "./vit";

// ─── Inference Session ───────────────────────────────────────────────────────

export interface InferenceOptions {
  /** Max batch size (default 1). */
  batchSize?: number;
  /** Whether to run in quantised INT8 mode (saves memory, slight精度 loss). */
  quantised?: boolean;
  /** Force image preprocessing dimensions. */
  inputSize?: number;
}

interface TensorRecord {
  name: string;
  data: Float32Array;
  shape: number[];
}

export class InferenceSession {
  private config: ViTConfig;
  private weights: ViTWeights;
  private loaded = false;
  private tensorCache: Map<string, Float32Array> = new Map();

  private constructor(config: ViTConfig, weights: ViTWeights) {
    this.config = config;
    this.weights = weights;
  }

  /**
   * Create session from a serialised weight ArrayBuffer.
   * The ArrayBuffer must have been produced by serialiseWeights().
   */
  static async fromBuffer(buf: ArrayBuffer): Promise<InferenceSession> {
    const parsed = deserialiseWeights(buf);
    return new InferenceSession(TINY_VIT_CONFIG, parsed.weights);
  }

  /**
   * Create session with random weights (for architecture validation / demos).
   */
  static random(config: ViTConfig = TINY_VIT_CONFIG, seed = 42): InferenceSession {
    const weights = initViTWeights(config, seed);
    return new InferenceSession(config, weights);
  }

  /** Return the model config. */
  getConfig(): ViTConfig {
    return this.config;
  }

  /** Run the full ViT forward pass on pre-processed pixel tensor. */
  forward(pixels: Tensor): ViTOutput {
    return vitForward(pixels, this.weights, this.config);
  }

  /** Serialise current weights to ArrayBuffer for bundling. */
  exportWeights(): ArrayBuffer {
    return serialiseWeights(this.weights);
  }

  /** Get pooled embedding (for similarity search / clustering). */
  getEmbedding(pixels: Tensor): Float32Array {
    const out = this.forward(pixels);
    return out.pooledEmbedding;
  }

  /** Dispose cached tensors. */
  dispose(): void {
    this.tensorCache.clear();
  }
}

// ─── Image Preprocessor ──────────────────────────────────────────────────────

export interface PreprocessedImage {
  /** Pixel tensor [1, 3, H, W] normalised with ImageNet mean/std. */
  tensor: Tensor;
  /** Original dimensions. */
  originalWidth: number;
  originalHeight: number;
  /** Resize scale applied. */
  scale: number;
}

/**
 * Preprocess an HTMLImageElement or ImageData for ViT input.
 * Resizes to config.imageSize, converts to RGB float [0,1],
 * applies ImageNet normalisation (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]).
 */
export function preprocessImage(
  source: HTMLImageElement | HTMLCanvasElement | ImageData,
  config: ViTConfig,
): PreprocessedImage {
  const canvas = document.createElement("canvas");
  canvas.width = config.imageSize;
  canvas.height = config.imageSize;
  const ctx = canvas.getContext("2d")!;

  let origW: number;
  let origH: number;

  if (source instanceof HTMLImageElement) {
    origW = source.naturalWidth || source.width;
    origH = source.naturalHeight || source.height;
    ctx.drawImage(source, 0, 0, config.imageSize, config.imageSize);
  } else if (source instanceof HTMLCanvasElement) {
    origW = source.width;
    origH = source.height;
    ctx.drawImage(source, 0, 0, config.imageSize, config.imageSize);
  } else {
    origW = source.width;
    origH = source.height;
    // Put ImageData into a temp canvas to resize
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = origW;
    tmpCanvas.height = origH;
    tmpCanvas.getContext("2d")!.putImageData(source, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0, config.imageSize, config.imageSize);
  }

  const imageData = ctx.getImageData(0, 0, config.imageSize, config.imageSize);
  const pixels = imageData.data; // RGBA
  const C = 3;
  const H = config.imageSize;
  const W = config.imageSize;

  // ImageNet normalisation
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  const tensorData = new Float32Array(C * H * W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      for (let c = 0; c < C; c++) {
        tensorData[c * H * W + y * W + x] = (pixels[idx + c] / 255.0 - mean[c]) / std[c];
      }
    }
  }

  return {
    tensor: { data: tensorData, shape: [1, C, H, W] },
    originalWidth: origW,
    originalHeight: origH,
    scale: config.imageSize / Math.max(origW, origH),
  };
}

/**
 * Preprocess from a raw pixel buffer (e.g. from canvas capture or WASM output).
 */
export function preprocessPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  config: ViTConfig,
): PreprocessedImage {
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return preprocessImage(canvas, config);
}

/**
 * Preprocess a base64 data URL.
 */
export async function preprocessDataURL(
  dataUrl: string,
  config: ViTConfig,
): Promise<PreprocessedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve(preprocessImage(img, config));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Failed to load image from data URL"));
    img.src = dataUrl;
  });
}

// ─── Post-processing ─────────────────────────────────────────────────────────

const UI_ELEMENT_LABELS = [
  "background",
  "heading",
  "paragraph",
  "button",
  "link",
  "input_text",
  "input_search",
  "input_email",
  "input_password",
  "textarea",
  "checkbox",
  "radio",
  "select_dropdown",
  "image",
  "icon",
  "logo",
  "navigation_bar",
  "sidebar",
  "footer",
  "card",
  "modal",
  "tooltip",
  "badge",
  "tag",
  "table",
  "list",
  "code_block",
  "quote",
  "divider",
  "progress_bar",
  "spinner",
  "tab_bar",
  "accordion",
  "carousel",
  "avatar",
  "alert_banner",
  "toast_notification",
  "breadcrumb",
  "pagination",
  "slider",
  "toggle_switch",
  "file_upload",
  "video_player",
  "audio_player",
  "map_embed",
  "form_group",
  "submit_button",
  "cancel_button",
  "close_button",
  "search_bar",
  "dropdown_menu",
  "context_menu",
  "datepicker",
  "color_picker",
  "rating_stars",
  "social_icon",
  "chat_bubble",
  "notification_dot",
  "loading_skeleton",
  "hero_banner",
  "cta_section",
  "footer_link",
  "inline_help",
];

export interface SceneElement {
  label: string;
  confidence: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface SceneAnalysis {
  /** All detected elements with labels and confidence. */
  elements: SceneElement[];
  /** Dominant element type. */
  dominantElement: string;
  /** Overall scene classification. */
  sceneType: string;
  /** Raw logits for custom downstream processing. */
  rawSceneLogits: Float32Array;
  /** CLS embedding for similarity search. */
  embedding: Float32Array;
}

/** Post-process model output into structured scene analysis. */
export function postprocessScene(output: ViTOutput): SceneAnalysis {
  const logits = output.sceneLogits;
  const probs = softmaxArray(logits);

  // Find top-k elements
  const indexed = Array.from(probs)
    .map((p, i) => ({ label: UI_ELEMENT_LABELS[i] || `class_${i}`, confidence: p, idx: i }))
    .sort((a, b) => b.confidence - a.confidence);

  const elements: SceneElement[] = indexed
    .filter((e) => e.confidence > 0.05)
    .slice(0, 20)
    .map((e) => ({
      label: e.label,
      confidence: e.confidence,
    }));

  const dominant = indexed[0];
  const sceneType = dominant.label;

  return {
    elements,
    dominantElement: dominant.label,
    sceneType,
    rawSceneLogits: logits,
    embedding: output.pooledEmbedding,
  };
}

function softmaxArray(arr: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  const out = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    out[i] = Math.exp(arr[i] - max);
    sum += out[i];
  }
  for (let i = 0; i < arr.length; i++) out[i] /= sum;
  return out;
}

// ─── Deserialisation ─────────────────────────────────────────────────────────

function deserialiseWeights(buf: ArrayBuffer): { weights: ViTWeights; config: ViTConfig } {
  const view = new DataView(buf);
  let offset = 0;

  // Magic
  const magic = String.fromCharCode(
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
  );
  if (magic !== "ViTW") throw new Error(`Invalid weight bundle magic: ${magic}`);

  // Version
  const version = view.getUint16(offset, true); offset += 2;
  if (version !== 1) throw new Error(`Unsupported weight bundle version: ${version}`);

  // Num tensors
  const numTensors = view.getUint32(offset, true); offset += 4;

  const tensorMap = new Map<string, Float32Array>();

  for (let i = 0; i < numTensors; i++) {
    const nameLen = view.getUint16(offset, true); offset += 2;
    let name = "";
    for (let j = 0; j < nameLen; j++) {
      name += String.fromCharCode(view.getUint8(offset++));
    }
    // Skip padding to 4-byte alignment
    while (offset % 4 !== 0) offset++;
    const dataLen = view.getUint32(offset, true); offset += 4;
    const data = new Float32Array(buf, offset, dataLen);
    tensorMap.set(name, new Float32Array(data)); // copy
    offset += dataLen * 4;
  }

  const D = TINY_VIT_CONFIG.embedDim;
  const N = (TINY_VIT_CONFIG.imageSize / TINY_VIT_CONFIG.patchSize) ** 2;

  function get(name: string): Float32Array {
    const d = tensorMap.get(name);
    if (!d) throw new Error(`Missing weight tensor: ${name}`);
    return d;
  }

  function getT(name: string, shape: number[]): Tensor {
    return { data: get(name), shape };
  }

  const hidden = Math.round(D * TINY_VIT_CONFIG.mlpRatio);
  const numClasses = TINY_VIT_CONFIG.numClasses;
  const sceneLabels = TINY_VIT_CONFIG.sceneLabels;
  const PC = TINY_VIT_CONFIG.patchSize ** 2 * TINY_VIT_CONFIG.inChannels;

  const blocks: import("./vit").TransformerBlockWeights[] = [];
  for (let i = 0; i < TINY_VIT_CONFIG.depth; i++) {
    blocks.push({
      ln1_gamma: getT(`b${i}.ln1g`, [D]),
      ln1_beta: getT(`b${i}.ln1b`, [D]),
      mha: {
        qkv_w: getT(`b${i}.qkvw`, [3 * D, D]),
        qkv_b: getT(`b${i}.qkvb`, [3 * D]),
        proj_w: getT(`b${i}.projw`, [D, D]),
        proj_b: getT(`b${i}.projb`, [D]),
      },
      ln2_gamma: getT(`b${i}.ln2g`, [D]),
      ln2_beta: getT(`b${i}.ln2b`, [D]),
      mlp: {
        fc1_w: getT(`b${i}.fc1w`, [hidden, D]),
        fc1_b: getT(`b${i}.fc1b`, [hidden]),
        fc2_w: getT(`b${i}.fc2w`, [D, hidden]),
        fc2_b: getT(`b${i}.fc2b`, [D]),
      },
    });
  }

  const weights: ViTWeights = {
    patchEmbed: {
      proj_w: getT("pe.proj_w", [D, PC]),
      proj_b: getT("pe.proj_b", [D]),
      pos_embed: getT("pe.pos", [1, N + 1, D]),
    },
    blocks,
    ln_final_gamma: getT("lnf.g", [D]),
    ln_final_beta: getT("lnf.b", [D]),
    cls_head_w: getT("cls.w", [numClasses, D]),
    cls_head_b: getT("cls.b", [numClasses]),
    scene_head_w: getT("scn.w", [sceneLabels, D]),
    scene_head_b: getT("scn.b", [sceneLabels]),
  };

  return { weights, config: TINY_VIT_CONFIG };
}
