/**
 * Model registry for the on-device NLP layer.
 *
 * Two classes of model:
 *
 * 1. **Compact Transformers.js models (under 200M params)** — search, PII,
 *    alt text and OCR run via ONNX Runtime Web with quantized weights from
 *    the Hugging Face CDN.
 *
 * 2. **A small quantized instruct model (Qwen2.5-0.5B @ 2-bit ≈ 415MB)** —
 *    used for error explanation and text review. It runs through **wllama**
 *    (llama.cpp compiled to WASM), the only browser runtime that can execute
 *    quantized GGUF weights on CPU — Transformers.js cannot load GGUFs and
 *    web-llm requires WebGPU, which 15-year-old laptops do not have.
 *
 * Every feature has a pure rule-based fallback so the app works with zero
 * model downloads and zero API keys; weights are fetched lazily on first use
 * and cached by the browser (CacheStorage / wllama's own cache).
 */
import type { NlpFeature } from "./types";

export type ModelRuntime = "transformers" | "tesseract" | "wllama";

export interface ModelSpec {
  feature: NlpFeature;
  /** Hugging Face repo id (Transformers.js ONNX) or backend name. */
  model: string;
  /** Pipeline task for Transformers.js; "ocr" uses tesseract.js; "wllama" uses llama.cpp WASM. */
  task: string;
  /** Which runtime executes this model. */
  runtime: ModelRuntime;
  /** Approximate quantized download size in MB. */
  sizeMb: number;
  /** Embedding dimensions when the model produces vectors. */
  dims?: number;
  /** Quantization hint passed to Transformers.js. */
  dtype?: "q4" | "q8";
}

export const MODEL_REGISTRY: ModelSpec[] = [
  {
    feature: "search",
    model: "onnx-community/all-MiniLM-L6-v2-ONNX", // 22.7M params
    task: "feature-extraction",
    runtime: "transformers",
    sizeMb: 23,
    dims: 384,
    dtype: "q8",
  },
  {
    feature: "pii",
    model: "onnx-community/distilbert-NER-ONNX", // 66.6M params
    task: "token-classification",
    runtime: "transformers",
    sizeMb: 26,
    dtype: "q8",
  },
  {
    feature: "alttext",
    model: "onnx-community/distilvit-ONNX", // ~85–100M params
    task: "image-to-text",
    runtime: "transformers",
    sizeMb: 90,
    dtype: "q8",
  },
  {
    feature: "steps",
    model: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", // 494M params @ 2-bit ≈ 415MB
    task: "text-generation",
    runtime: "wllama",
    sizeMb: 415,
  },
  {
    feature: "explain",
    model: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", // 494M params @ 2-bit ≈ 415MB
    task: "text-generation",
    runtime: "wllama",
    sizeMb: 415,
  },
  {
    feature: "vision",
    model: "bartowski/Qwen2-VL-2B-Instruct-GGUF", // 2B VLM @ IQ2_M ≈ 601MB + mmproj
    task: "image-text-to-text",
    runtime: "wllama",
    sizeMb: 900,
  },
  {
    feature: "ocr",
    model: "tesseract.js + eng traineddata", // classical LSTM OCR
    task: "ocr",
    runtime: "tesseract",
    sizeMb: 15,
  },
];

export function specFor(feature: NlpFeature): ModelSpec | undefined {
  return MODEL_REGISTRY.find((m) => m.feature === feature);
}

/** Total lazy-download size if every model is used (MB). */
export const TOTAL_MODEL_MB = MODEL_REGISTRY.reduce((n, m) => n + m.sizeMb, 0);

/** Model specs that run through wllama (shared session — loaded once). */
export function wllamaSpecs(): ModelSpec[] {
  return MODEL_REGISTRY.filter((m) => m.runtime === "wllama");
}
