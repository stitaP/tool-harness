/**
 * Vision barrel — clean exports for all vision modules.
 *
 * All modules use ViT model inference. No heuristic rules.
 */

// Core ViT model (from scratch, zero deps)
export {
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
  type ViTConfig,
  type ViTWeights,
  type ViTOutput,
  type Tensor,
} from "./vit";

// Inference runner (loads weights, runs forward pass)
export {
  InferenceSession,
  preprocessImage,
  preprocessPixels,
  preprocessDataURL,
  postprocessScene,
  type InferenceOptions,
  type PreprocessedImage,
  type SceneAnalysis,
} from "./inference-runner";

// Scene parser (model output → structured description)
export {
  parseScene,
  type SceneElement,
  type SpatialRelation,
  type LayoutZone,
  type SceneDescription,
} from "./scene-parser";

// LLM prompt generator (scene → prompts for any LLM)
export {
  buildScenePrompt,
  buildMinimalPrompt,
  buildStructuredOutput,
  type PromptGoal,
} from "./llm-prompt";

// High-level API (one-call analysis pipeline)
export {
  loadModel,
  analyseImage,
  analyseScreenshot,
  analysePixels,
  getImageEmbedding,
  embeddingSimilarity,
  type VisionResult,
} from "./index";
