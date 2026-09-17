// ─── stitaP Inference Router ──────────────────────────────────────────────────
// Hardware-aware inference layer that routes tool execution to the fastest
// available backend without requiring privilege elevation.

// Types
export type {
  BackendKind,
  BackendState,
  DeviceCapability,
  SystemInfo,
  PerformanceMode,
  QuantizationFormat,
  QuantOption,
  QuantDecision,
  ModelFormat,
  ModelSize,
  DownloadState,
  DownloadChunk,
  DownloadStatus,
  ThroughputConfig,
  LegacyServerProfile,
  CatalogEntry,
  CatalogCategory,
  RouterDecision,
  ToolPermission,
  PermissionLevel,
} from "./types";

// Device Probing
export {
  detectSystemInfo,
  probeBackends,
  benchmarkBackends,
  detectLegacyServerProfile,
} from "./device-prober";

// Backend Router
export {
  InferenceRouter,
  getInferenceRouter,
  resetInferenceRouter,
} from "./backend-router";

// Model Download
export { ModelDownloader, makeQuantDecision } from "./model-download";

// Throughput Optimizer
export { buildOptimizationPlan } from "./throughput";
export type { OptimizationPlan, AppliedOptimization } from "./throughput";

// Legacy Support
export { detectLegacyProfile, getLegacyGuidance } from "./legacy-support";
export type { LegacyGuidance, GuidanceStep } from "./legacy-support";

// Catalog
export { CATALOG_ENTRIES } from "./catalog";
