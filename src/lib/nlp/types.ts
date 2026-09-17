/**
 * On-device NLP layer — typed JSON contracts (the agent-friendly surface).
 *
 * Every feature returns one of these shapes regardless of which backend
 * actually ran (Transformers.js model, tesseract.js, wllama/llama.cpp, or the
 * pure rule fallback), so callers — including AI agents — consume a single
 * stable contract and never care about the implementation underneath.
 */

export type NlpFeature = "search" | "pii" | "ocr" | "alttext" | "steps" | "explain" | "vision";

export type NlpModelState =
  | "unloaded"
  | "loading"
  | "ready"
  | "error"
  | "unsupported";

/** Snapshot of one model's on-device status (for UI + agent introspection). */
export interface NlpModelStatus {
  feature: NlpFeature;
  /** Model id (Hugging Face repo) or backend name. */
  model: string;
  /** Approximate quantized download size in MB. */
  sizeMb: number;
  state: NlpModelState;
  /** Download progress 0–1, or an error message. */
  detail?: string;
}

/** A line of recognized text (blueprint §16 OcrBlock). */
export interface OcrBlock {
  text: string;
  confidence: number;
  /** Coordinates in the coordinate system of the scanned image. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  source: "ocr" | "dom";
}

/**
 * OCR backend for `nlp.ocrImage`:
 *   · "tesseract" — tesseract.js LSTM (≈15MB, fast, default)
 *   · "str"       — two-stage scene-text recognition: projection-based line
 *     detection + `onnx-community/mgp-str-base` (q4 ONNX ≈91MB); better on
 *     dark themes / non-standard fonts, falls back to tesseract on load failure
 */
export type OcrStrategy = "tesseract" | "str" | "indic";

/** Two-stage STR recognizer (61M params, MGP-STR multi-granularity heads). */
export const NLP_STR_MODEL_ID = "onnx-community/mgp-str-base";
/** q4 ONNX weights (model_q4.onnx). */
export const NLP_STR_MODEL_MB = 91;

/* ------------------------------------------------------------------ */
/* Indic OCR (multi-script Indian language OCR)                        */
/* ------------------------------------------------------------------ */

/** Language code for Indic OCR (tesseract ISO 639-2). */
export type IndicLangCode =
  | "hin" | "ben" | "tam" | "tel" | "guj" | "kan"
  | "mal" | "pan" | "ori" | "mar" | "asm" | "san" | "nep" | "eng";

/** Indic OCR language selection. */
export interface IndicOcrOptions {
  /** Specific language code, or "auto" for script detection. */
  language: IndicLangCode | "auto";
  /** Pre-defined language profile for mixed-script documents. */
  profile?: string;
  /** Additional language codes to include (for multi-language documents). */
  additionalLanguages?: IndicLangCode[];
  /** Maximum number of languages for combined OCR. */
  maxLanguages?: number;
}

/** Indic OCR result with script detection info. */
export interface IndicOcrResult {
  text: string;
  language: string;
  script: string;
  confidence: number;
  blocks: OcrBlock[];
  detectionMode: "auto" | "explicit" | "profile";
  warnings: string[];
}

export type SensitiveKind =
  | "api-key"
  | "token"
  | "password"
  | "session"
  | "private-key"
  | "email"
  | "phone"
  | "credit-card"
  | "ssn"
  | "person";

/** A single sensitive-data finding (blueprint §17/§20). */
export interface SensitiveMatch {
  id: string;
  kind: SensitiveKind;
  label: string;
  /** Short context around the match, truncated for display. */
  hint: string;
  /** Character offsets into the scanned text, when available. */
  start?: number;
  end?: number;
  /** How the match was found. */
  source: "regex" | "ner";
}

export interface AltTextSuggestion {
  text: string;
  confidence: number;
  source: "model" | "heuristic";
}

export interface StepGuideStep {
  number: number;
  text: string;
}

export interface StepGuide {
  title: string;
  steps: StepGuideStep[];
  source: "model" | "template";
}

/** Embedding output — one vector per input text, L2-normalized. */
export interface EmbedResult {
  vectors: number[][];
  /** Which embedder produced the vectors — must match what was stored at index time. */
  model: string;
}

/** Embedding dimensions (MiniLM-L6-v2 output = 384). */
export const NLP_EMBED_DIMENSIONS = 384;
/** Model id stored with captures when the MiniLM backend was used. */
export const NLP_EMBED_MODEL_ID = "minilm-l6-v2";
/** Model id stored with captures when the rule fallback embedder was used. */
export const NLP_EMBED_RULE_ID = "rule-ngram-v1";

/* ------------------------------------------------------------------ */
/* Error explanation + mistake review (on-device instruct model)       */
/* ------------------------------------------------------------------ */

/** A structured capture-job error (mirrors engine `fail(message, code)`). */
export interface ErrorContext {
  /** Engine error code (`missing-service`, `url-blocked`, `element-not-found`, …). */
  code?: string;
  /** The raw error message from the engine. */
  message?: string;
  /** Job phase the failure landed in (`failed`, `timed-out`, `blocked-by-policy`, …). */
  phase?: string;
  /** Any extra sanitized context (never secrets). */
  detail?: string;
}

/**
 * Clear, step-by-step explanation of a capture error.
 *
 * `engine` says who produced it: `rule` = instant offline catalogue (always
 * available), `model` = a small on-device instruct model (only when the
 * device can run it), `rule-fallback` = the catalogue's generic answer after
 * a model attempt failed. Agents consume this shape only.
 */
export interface ErrorExplanation {
  code?: string;
  /** One-line summary: what went wrong. */
  summary: string;
  /** Why it happened, in plain language. */
  cause: string;
  /** Numbered steps to rectify. */
  steps: string[];
  /** Optional pro-tip. */
  tip?: string;
  engine: "rule" | "model" | "rule-fallback";
  /** Model id when `engine === "model"`. */
  model?: string;
}

export type MistakeSeverity = "error" | "warning" | "info";

export type MistakeKind =
  | "duplicate"
  | "empty"
  | "numbering"
  | "length"
  | "typo"
  | "markdown"
  | "consistency";

/** A single small mistake found in generated text (step guide, alt text, …). */
export interface MistakeIssue {
  severity: MistakeSeverity;
  kind: MistakeKind;
  /** Human-readable description. */
  message: string;
  /** Suggested fix (when known). */
  fix?: string;
  /** 1-based line number in the reviewed text, when available. */
  line?: number;
}

export interface MistakeReview {
  issues: MistakeIssue[];
  engine: "rule" | "model";
  model?: string;
}

/* ------------------------------------------------------------------ */
/* Device capability (whether the on-device instruct model can run)    */
/* ------------------------------------------------------------------ */

export type DeviceTier = "legacy" | "standard" | "modern";

/**
 * Snapshot of device capability used to gate the ~415MB 2-bit instruct
 * model. Kept pure and smoke-testable (`capability.ts`). A 15-year-old
 * laptop with <2GB RAM typically lands in `legacy` → rule-only answers.
 */
export interface DeviceProfile {
  /** navigator.deviceMemory, or a conservative default when unknown. */
  deviceMemoryGb: number | null;
  /** navigator.hardwareConcurrency, or null when unknown. */
  cores: number | null;
  hasWebGpu: boolean;
  /** True when the browser reports WASM SIMD support. */
  hasWasmSimd: boolean;
}

export interface DeviceCapability {
  tier: DeviceTier;
  /** Approx. usable memory budget for a model, in MB. */
  modelBudgetMb: number;
  /** Model id the device can load, or undefined when it can't. */
  modelId?: string;
  /** One-line reason for the tier decision. */
  reason: string;
}

/** The on-device instruct model used for error explanation / review. */
export const NLP_EXPLAIN_MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct-GGUF";
/** Exact GGUF file inside the repo (2-bit Q2_K ≈ 415MB, fits ~2GB machines). */
export const NLP_EXPLAIN_GGUF_FILE = "qwen2.5-0.5b-instruct-q2_k.gguf";
/** Approximate download size in MB (used for the capability gate). */
export const NLP_EXPLAIN_MODEL_MB = 415;

/* ------------------------------------------------------------------ */
/* Vision feedback (small on-device VLM)                               */
/* ------------------------------------------------------------------ */

/**
 * Feedback from looking at a capture image, produced by a small on-device
 * VLM (Qwen2-VL-2B @ IQ2_M via wllama) or by a deterministic structural
 * review (`ruleVisualFeedback`). Same contract either way.
 */
export interface VisionFeedback {
  /** One-line verdict of the overall quality. */
  summary: string;
  /** Specific problems spotted in the image, most severe first. */
  issues: string[];
  /** Things that look correct. */
  strengths: string[];
  /** Suggested action, when any. */
  suggestion?: string;
  source: "model" | "rule";
  model?: string;
}

/**
 * The on-device vision-language model. A true 1.58-bit VLM doesn't exist
 * yet on HF (the "1.58-bit" GGUFs are 1.2–2.2GB text-only), so the smallest
 * real browser-runnable VLM is Qwen2-VL-2B at IQ2_M ≈ 601MB — run through
 * wllama (llama.cpp WASM), which natively accepts image content blocks.
 */
export const NLP_VISION_MODEL_ID = "bartowski/Qwen2-VL-2B-Instruct-GGUF";
/** Quant file inside the repo (IQ2_M ≈ 601MB — smallest usable VLM). */
export const NLP_VISION_GGUF = "Qwen2-VL-2B-Instruct-IQ2_M.gguf";
/** Multimodal projector (vision tower) — wllama quantizes it on load. */
export const NLP_VISION_MMPROJ = "mmproj-Qwen2-VL-2B-Instruct-f16.gguf";
/** Approximate total download size in MB (model + mmproj). */
export const NLP_VISION_MODEL_MB = 900;
