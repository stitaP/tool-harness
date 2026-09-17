/**
 * Vision Module — ViT model-backed image understanding.
 *
 * This module provides end-to-end image analysis using a Vision Transformer
 * (ViT) model that runs entirely in the browser via Canvas API.
 *
 * Pipeline:
 *   Image → Preprocess (resize, normalise) → ViT Forward Pass → Scene Parser → LLM Prompt
 *
 * No heuristic rules. No external APIs. No WebAssembly. Pure TypeScript + Canvas.
 */

// Re-export all sub-modules
export {
  type ViTConfig,
  type ViTWeights,
  type ViTOutput,
  type Tensor,
  TINY_VIT_CONFIG,
  tensor,
  matmul,
  softmax,
  layerNorm,
  gelu,
  reshape,
  transpose2d,
  createRng,
  initViTWeights,
  serialiseWeights,
  quantiseINT8,
  dequantiseINT8,
} from "./vit";

export {
  type InferenceOptions,
  type PreprocessedImage,
  type SceneAnalysis,
  InferenceSession,
  preprocessImage,
  preprocessPixels,
  preprocessDataURL,
  postprocessScene,
} from "./inference-runner";

export {
  type SceneElement,
  type SpatialRelation,
  type LayoutZone,
  type SceneDescription,
  parseScene,
} from "./scene-parser";

export {
  type PromptGoal,
  buildScenePrompt,
  buildMinimalPrompt,
  buildStructuredOutput,
} from "./llm-prompt";

// ─── High-level API ──────────────────────────────────────────────────────────

import { TINY_VIT_CONFIG, type ViTConfig, initViTWeights } from "./vit";
import { InferenceSession, preprocessImage, postprocessScene, preprocessDataURL } from "./inference-runner";
import { parseScene, type SceneDescription } from "./scene-parser";
import { buildScenePrompt, buildMinimalPrompt, buildStructuredOutput, type PromptGoal } from "./llm-prompt";

export interface VisionResult {
  /** Full scene description (elements, layout, colours, narrative). */
  scene: SceneDescription;
  /** LLM prompt generated from the scene. */
  llmPrompt: string;
  /** Minimal prompt for constrained SLMs. */
  minimalPrompt: string;
  /** JSON-LD structured output. */
  structured: Record<string, unknown>;
  /** The raw ViT model output (for advanced use). */
  modelOutput: import("./vit").ViTOutput;
  /** Processing time in milliseconds. */
  processingTimeMs: number;
}

let _session: InferenceSession | null = null;

/**
 * Get or create the singleton ViT inference session.
 * Uses random weights by default (architecture demo).
 * Call `loadModel()` with a bundled weight buffer for real inference.
 */
function getSession(config?: ViTConfig): InferenceSession {
  if (!_session) {
    _session = InferenceSession.random(config || TINY_VIT_CONFIG);
  }
  return _session;
}

/**
 * Load a pre-trained weight bundle into the inference session.
 * The buffer must come from serialiseWeights() or a bundled .vitw file.
 */
export async function loadModel(weightBuffer: ArrayBuffer): Promise<void> {
  _session = await InferenceSession.fromBuffer(weightBuffer);
}

/**
 * Analyse an image element using ViT model inference.
 *
 * This is the main entry point:
 *   1. Preprocess the image (resize to 224×224, ImageNet normalisation)
 *   2. Run ViT forward pass (patch embed → transformer → classification heads)
 *   3. Parse model output into structured SceneDescription
 *   4. Generate LLM prompts from the scene
 */
export async function analyseImage(
  source: HTMLImageElement | HTMLCanvasElement,
  options: {
    goal?: PromptGoal;
    includeRaw?: boolean;
    codeLang?: string;
    config?: ViTConfig;
  } = {},
): Promise<VisionResult> {
  const start = performance.now();
  const config = options.config || TINY_VIT_CONFIG;
  const session = getSession(config);

  // Step 1: Preprocess
  const preprocessed = preprocessImage(source, config);

  // Step 2: ViT forward pass
  const modelOutput = session.forward(preprocessed.tensor);

  // Step 3: Post-process → SceneAnalysis
  const analysis = postprocessScene(modelOutput);

  // Step 4: Parse into SceneDescription
  const scene = parseScene(analysis);

  // Step 5: Generate prompts
  const goal = options.goal || "describe";
  const llmPrompt = buildScenePrompt(scene, { goal, includeRaw: options.includeRaw, codeLang: options.codeLang });
  const minimalPrompt = buildMinimalPrompt(scene);
  const structured = buildStructuredOutput(scene);

  return {
    scene,
    llmPrompt,
    minimalPrompt,
    structured,
    modelOutput,
    processingTimeMs: performance.now() - start,
  };
}

/**
 * Analyse a screenshot from a data URL (base64-encoded PNG/JPEG).
 */
export async function analyseScreenshot(
  dataUrl: string,
  options: {
    goal?: PromptGoal;
    includeRaw?: boolean;
    codeLang?: string;
    config?: ViTConfig;
  } = {},
): Promise<VisionResult> {
  const start = performance.now();
  const config = options.config || TINY_VIT_CONFIG;
  const session = getSession(config);

  // Step 1: Load and preprocess from data URL
  const preprocessed = await preprocessDataURL(dataUrl, config);

  // Step 2-5: same as analyseImage
  const modelOutput = session.forward(preprocessed.tensor);
  const analysis = postprocessScene(modelOutput);
  const scene = parseScene(analysis);
  const goal = options.goal || "describe";
  const llmPrompt = buildScenePrompt(scene, { goal, includeRaw: options.includeRaw, codeLang: options.codeLang });
  const minimalPrompt = buildMinimalPrompt(scene);
  const structured = buildStructuredOutput(scene);

  return {
    scene,
    llmPrompt,
    minimalPrompt,
    structured,
    modelOutput,
    processingTimeMs: performance.now() - start,
  };
}

/**
 * Analyse raw RGBA pixel data.
 */
export function analysePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    goal?: PromptGoal;
    includeRaw?: boolean;
    codeLang?: string;
    config?: ViTConfig;
  } = {},
): VisionResult {
  const start = performance.now();
  const config = options.config || TINY_VIT_CONFIG;
  const session = getSession(config);

  // Create a canvas to preprocess from
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);

  const preprocessed = preprocessImage(canvas, config);
  const modelOutput = session.forward(preprocessed.tensor);
  const analysis = postprocessScene(modelOutput);
  const scene = parseScene(analysis, preprocessed, { data: rgba, width, height });
  const goal = options.goal || "describe";
  const llmPrompt = buildScenePrompt(scene, { goal, includeRaw: options.includeRaw, codeLang: options.codeLang });
  const minimalPrompt = buildMinimalPrompt(scene);
  const structured = buildStructuredOutput(scene);

  return {
    scene,
    llmPrompt,
    minimalPrompt,
    structured,
    modelOutput,
    processingTimeMs: performance.now() - start,
  };
}

/**
 * Generate a vector embedding for an image (for similarity search / clustering).
 */
export function getImageEmbedding(
  source: HTMLImageElement | HTMLCanvasElement,
  config?: ViTConfig,
): Float32Array {
  const session = getSession(config);
  const preprocessed = preprocessImage(source, config || TINY_VIT_CONFIG);
  return session.getEmbedding(preprocessed.tensor);
}

/**
 * Compute cosine similarity between two image embeddings.
 */
export function embeddingSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}
