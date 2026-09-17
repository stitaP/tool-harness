/**
 * stitaP Inference Router — Core Types
 *
 * Defines the hardware-aware inference layer that routes tool execution
 * to the fastest available backend without requiring privilege elevation.
 */

// ─── Backend Types ────────────────────────────────────────────────────────────

export type BackendKind =
  | "openvino-cpu"
  | "openvino-igpu"
  | "openvino-npu"
  | "llamacpp-cpu"
  | "llamacpp-vulkan"
  | "llamacpp-metal"
  | "llamacpp-cuda"
  | "qnn-snapdragon"
  | "coreml-apple"
  | "apu-mediatek"
  | "unknown";

export type DeviceClass = "cpu" | "integrated-gpu" | "discrete-gpu" | "npu" | "ane";

export type PerformanceMode = "throughput" | "latency" | "balanced";

export type QuantizationFormat =
  | "fp32"
  | "fp16"
  | "int8"
  | "int4"
  | "q4_0"
  | "q4_k_m"
  | "q5_k_m"
  | "q8_0"
  | "iq2_xxs"
  | "iq3_xs"
  | "awq"
  | "gptq"
  | "bitsandbytes-nf4"
  | "bitsandbytes-nf8";

export type ModelFormat = "gguf" | "openvino-ir" | "coreml" | "onnx" | "safetensors" | "pytorch";

export type ModelSize = "tiny" | "small" | "medium" | "large" | "xlarge";

// ─── Device & Hardware ────────────────────────────────────────────────────────

export interface DeviceCapability {
  kind: BackendKind;
  deviceClass: DeviceClass;
  name: string;
  vendor: string;
  /** Available VRAM / dedicated memory in bytes */
  memoryBytes: number;
  /** Physical cores (not logical/hyperthreaded) */
  physicalCores: number;
  /** Whether this device is accessible without privilege elevation */
  accessibleWithoutElevation: boolean;
  /** Reason why inaccessible (e.g. "user not in render group") */
  inaccessibilityReason?: string;
  /** Supported SIMD instruction sets (e.g. ["avx2", "sse4.2"]) */
  instructionSets: string[];
  /** NUMA node index (-1 if not NUMA) */
  numaNode: number;
  /** Compute capability / version string */
  computeCapability?: string;
  /** Driver version */
  driverVersion?: string;
}

export interface SystemInfo {
  /** Total system RAM in bytes */
  totalRamBytes: number;
  /** Available RAM in bytes */
  availableRamBytes: number;
  /** OS platform */
  platform: "windows" | "macos" | "linux" | "android" | "ios" | "unknown";
  /** OS version string */
  osVersion: string;
  /** CPU architecture */
  arch: "x86_64" | "aarch64" | "arm" | "wasm32" | "wasm64" | "unknown";
  /** CPU brand/model */
  cpuBrand: string;
  /** Number of NUMA nodes */
  numaNodes: number;
  /** Temperature if available (°C) */
  temperatureCelsius?: number;
  /** Battery level if mobile (0-100) */
  batteryPercent?: number;
}

// ─── Backend State ────────────────────────────────────────────────────────────

export interface BackendState {
  kind: BackendKind;
  available: boolean;
  /** Benchmark result: tokens per second */
  measuredTokensPerSec: number;
  /** When this benchmark was taken */
  benchmarkTimestamp: number;
  /** Memory usage during benchmark in bytes */
  memoryUsageBytes: number;
  /** Error if probing failed */
  probeError?: string;
}

// ─── Quantization ─────────────────────────────────────────────────────────────

export interface QuantOption {
  format: QuantizationFormat;
  /** Estimated memory footprint in bytes */
  estimatedMemoryBytes: number;
  /** Expected tokens/sec on target device */
  expectedTokensPerSec: number;
  /** Human-readable quality note */
  qualityNote: string;
  /** Quality score 0-1 relative to fp32 */
  qualityScore: number;
  /** Whether this quant was measured or estimated */
  measured: boolean;
  /** Source format if requantized */
  sourceFormat?: QuantizationFormat;
}

export interface QuantDecision {
  /** The model source */
  modelSource: string;
  /** Whether original weights are available (prefer quantizing from these) */
  originalWeightsAvailable: boolean;
  /** Current format of downloaded model (if any) */
  currentFormat?: QuantizationFormat;
  /** Viable quant options for this device */
  options: QuantOption[];
  /** Recommended option (best quality within memory budget) */
  recommended: QuantizationFormat;
  /** Reason for recommendation */
  reason: string;
  /** Whether this is a re-quantization (degraded quality warning) */
  isRequantization: boolean;
}

// ─── Model Download ───────────────────────────────────────────────────────────

export type DownloadStatus =
  | "idle"
  | "downloading"
  | "paused"
  | "verifying"
  | "completed"
  | "failed";

export interface DownloadChunk {
  index: number;
  offset: number;
  size: number;
  hash: string;
  status: "pending" | "downloading" | "completed" | "failed";
  bytesReceived: number;
}

export interface DownloadState {
  url: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  chunks: DownloadChunk[];
  sha256?: string;
  sha256Verified?: boolean;
  error?: string;
  startedAt: number;
  completedAt?: number;
  /** Parallel connections used */
  parallelism: number;
  /** Resume token for interrupted downloads */
  resumeToken: string;
}

// ─── Throughput Config ────────────────────────────────────────────────────────

export interface ThroughputConfig {
  backend: BackendKind;
  performanceMode: PerformanceMode;
  /** KV-cache persistence across turns (for multi-turn agents) */
  kvCachePersistence: boolean;
  /** Whether speculative decoding is enabled */
  speculativeDecoding: boolean;
  /** Draft model path for speculative decoding */
  draftModelPath?: string;
  /** Batch size for prompt processing */
  promptBatchSize: number;
  /** Micro-batch size for generation */
  microBatchSize: number;
  /** Number of threads (should match physical cores) */
  threadCount: number;
  /** Whether flash attention is enabled */
  flashAttention: boolean;
  /** INT4/INT8 quantization level for runtime optimization */
  runtimeQuant: QuantizationFormat;
  /** NUMA thread pinning (for multi-socket servers) */
  numaThreadPinning: boolean;
}

// ─── Legacy Server ────────────────────────────────────────────────────────────

export interface LegacyServerProfile {
  /** Whether static linking is needed */
  needsStaticLink: boolean;
  /** Detected instruction set level */
  detectedInstructionSet: string;
  /** Whether AVX2 is available */
  hasAVX2: boolean;
  /** Whether AVX-512 is available */
  hasAVX512: boolean;
  /** NUMA topology */
  numaTopology: { socketCount: number; coresPerSocket: number; memoryPerSocketBytes: number }[];
  /** Kernel version */
  kernelVersion: string;
  /** glibc version */
  glibcVersion?: string;
  /** Recommended compilation flags */
  recommendedFlags: string[];
  /** Whether containerization is recommended */
  containerizationRecommended: boolean;
  /** Fallback strategy if binary won't run natively */
  fallbackStrategy: "native" | "static-cross-compile" | "musl-static" | "container" | "none";
}

// ─── Catalog & Store ──────────────────────────────────────────────────────────

export type PermissionLevel = "none" | "read-fs" | "write-fs" | "network" | "full";

export interface ToolPermission {
  level: PermissionLevel;
  description: string;
  /** Patterns this permission covers (e.g. ["https://api.example.com/*"]) */
  patterns?: string[];
}

export interface CatalogEntry {
  /** Unique catalog ID */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Longer description */
  longDescription: string;
  /** Version (semver) */
  version: string;
  /** Author / maintainer */
  author: string;
  /** License */
  license: string;
  /** Category in the harness store */
  catalogCategory: CatalogCategory;
  /** What this tool does in the harness */
  role: string;
  /** Required permissions */
  permissions: ToolPermission[];
  /** Supported inference backends */
  supportedBackends: BackendKind[];
  /** Model format shipped */
  modelFormat?: ModelFormat;
  /** Model size class */
  modelSize?: ModelSize;
  /** Supported model quantizations */
  supportedQuants?: QuantizationFormat[];
  /** External URL for reference */
  url: string;
  /** Tags for search */
  tags: string[];
  /** Whether this is an LLM tool or a utility */
  isLLMBased: boolean;
  /** Integration notes: how this fits with other catalog entries */
  integrationNotes: string;
  /** Dependencies on other catalog entries */
  dependencies?: string[];
  /** Whether the tool is self-contained (zero external deps at runtime) */
  selfContained: boolean;
}

export type CatalogCategory =
  | "orchestration"
  | "memory"
  | "browser-automation"
  | "coding"
  | "serving"
  | "observability"
  | "workflow"
  | "chat-interface"
  | "animation"
  | "web-scraping"
  | "swarm";

// ─── Router Decision ──────────────────────────────────────────────────────────

export interface RouterDecision {
  /** Selected backend */
  backend: BackendKind;
  /** Reason for selection */
  reason: string;
  /** Alternative backends ranked by throughput */
  alternatives: { backend: BackendKind; tokensPerSec: number }[];
  /** Whether fallback was used */
  isFallback: boolean;
  /** Benchmark confidence: "measured" | "estimated" | "cached" */
  confidence: "measured" | "estimated" | "cached";
  /** Cache key for this decision */
  cacheKey: string;
  /** When to re-benchmark */
  reBenchmarkAfter: "os-update" | "driver-update" | "24h" | "never";
}
