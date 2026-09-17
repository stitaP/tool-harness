/**
 * stitaP Tool Store — Inference & Catalog Tools
 *
 * Store tools that expose the inference router, model acquisition,
 * quantization decisions, throughput optimization, legacy support,
 * and catalog browsing to the harness.
 */

import type { ToolManifest, ToolExecutor, ToolInput, ToolOutput } from "../tool-types";
import type { QuantizationFormat } from "../../inference/types";
import {
  InferenceRouter,
  getInferenceRouter,
  resetInferenceRouter,
} from "../../inference/backend-router";
import {
  detectSystemInfo,
  probeBackends,
  benchmarkBackends,
  detectLegacyServerProfile,
} from "../../inference/device-prober";
import { ModelDownloader, makeQuantDecision } from "../../inference/model-download";
import { buildOptimizationPlan } from "../../inference/throughput";
import { detectLegacyProfile, getLegacyGuidance } from "../../inference/legacy-support";
import { CATALOG_ENTRIES } from "../../inference/catalog";
import type { PerformanceMode, SystemInfo, BackendKind } from "../../inference/types";

// ─── Shared State ─────────────────────────────────────────────────────────────

const downloader = new ModelDownloader();

// ─── Tool: inference.router ───────────────────────────────────────────────────

const inferenceRouterTool: ToolManifest = {
  id: "inference.router",
  name: "Inference Router",
  description: "Select the fastest available backend for the current device — benchmarks each backend, picks the winner, caches the decision",
  longDescription:
    "The core routing engine. Probes hardware capabilities without privilege elevation, benchmarks available backends, selects the fastest for the workload, and caches the decision. Re-evaluates on major system changes.",
  category: "llm",
  subcategory: "inference",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["inference", "routing", "hardware", "benchmarking", "openvino", "llamacpp"],
  icon: "Cpu",
  color: "#6366f1",
  parameters: [
    { name: "mode", type: "enum", description: "Performance mode", required: false, default: "balanced", enum: ["throughput", "latency", "balanced"] },
    { name: "workloadType", type: "enum", description: "Expected workload pattern", required: false, default: "general", enum: ["prompt-heavy", "latency-sensitive", "general"] },
    { name: "forceRebenchmark", type: "boolean", description: "Ignore cached benchmarks and re-measure", required: false, default: false },
  ],
  capabilities: [
    { name: "select-backend", description: "Select optimal inference backend", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const inferenceRouterExecutor: ToolExecutor = async (
  input: ToolInput,
): Promise<ToolOutput> => {
  const mode = (input.mode as PerformanceMode) ?? "balanced";
  const workloadType = (input.workloadType as string) ?? "general";
  const forceRebenchmark = input.forceRebenchmark as boolean;

  const router = await getInferenceRouter();

  if (forceRebenchmark) {
    await router.rebenchmark();
  }

  const decision = await router.selectBackend(
    mode,
    workloadType as "prompt-heavy" | "latency-sensitive" | "general",
  );

  const sysInfo = router.getSystemInfo()!;
  const optimizationPlan = buildOptimizationPlan(decision.backend, mode, sysInfo);

  return {
    success: true,
    data: {
      decision,
      optimization: {
        backend: optimizationPlan.backend,
        expectedSpeedup: optimizationPlan.expectedSpeedup,
        optimizations: optimizationPlan.optimizations.map((o) => ({
          name: o.name,
          description: o.description,
          speedup: o.estimatedSpeedup,
          risk: o.riskLevel,
        })),
      },
      systemInfo: {
        platform: sysInfo.platform,
        arch: sysInfo.arch,
        ramGB: Math.round(sysInfo.totalRamBytes / (1024 * 1024 * 1024)),
        cpu: sysInfo.cpuBrand,
      },
    },
  };
};

// ─── Tool: inference.probe ────────────────────────────────────────────────────

const probeTool: ToolManifest = {
  id: "inference.probe",
  name: "Hardware Probe",
  description: "Detect all available inference backends on this device — no privilege elevation required",
  category: "llm",
  subcategory: "inference",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["hardware", "detection", "probe", "capabilities"],
  icon: "ScanSearch",
  color: "#8b5cf6",
  parameters: [
    { name: "includeBenchmark", type: "boolean", description: "Also benchmark each available backend", required: false, default: false },
  ],
  capabilities: [
    { name: "probe-hardware", description: "Detect hardware capabilities", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const probeExecutor: ToolExecutor = async (input: ToolInput): Promise<ToolOutput> => {
  const sysInfo = detectSystemInfo();
  const backends = await probeBackends(sysInfo);

  let benchmarks: Record<string, number> = {};
  if (input.includeBenchmark) {
    const results = await benchmarkBackends(backends, sysInfo);
    for (const [kind, tps] of results) {
      benchmarks[kind] = Math.round(tps * 10) / 10;
    }
  }

  return {
    success: true,
    data: {
      system: {
        platform: sysInfo.platform,
        arch: sysInfo.arch,
        ramGB: Math.round(sysInfo.totalRamBytes / (1024 * 1024 * 1024)),
        cpu: sysInfo.cpuBrand,
        numaNodes: sysInfo.numaNodes,
      },
      backends: backends.map((b) => ({
        kind: b.kind,
        available: b.available,
        accessibleWithoutElevation: true,
        error: b.probeError,
      })),
      benchmarks,
    },
  };
};

// ─── Tool: inference.quant ────────────────────────────────────────────────────

const quantTool: ToolManifest = {
  id: "inference.quant",
  name: "Quantization Menu",
  description: "Show viable quantization levels for a model on this device with memory, throughput, and quality estimates",
  category: "llm",
  subcategory: "inference",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["quantization", "gguf", "memory", "quality", "optimization"],
  icon: "SlidersHorizontal",
  color: "#ec4899",
  parameters: [
    { name: "modelSource", type: "string", description: "Model source URL or identifier", required: true },
    { name: "originalWeightsAvailable", type: "boolean", description: "Whether original full-precision weights are available", required: false, default: false },
    { name: "currentFormat", type: "string", description: "Current quantization format of any downloaded model", required: false },
    { name: "availableFormats", type: "array", description: "Available quantization formats for this model", required: false },
  ],
  capabilities: [
    { name: "quantization-decision", description: "Generate quantization recommendations", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const quantExecutor: ToolExecutor = async (input: ToolInput): Promise<ToolOutput> => {
  const sysInfo = detectSystemInfo();
  const decision = makeQuantDecision(
    input.modelSource as string,
    (input.originalWeightsAvailable as boolean) ?? false,
    input.currentFormat as QuantizationFormat | undefined,
    sysInfo.availableRamBytes,
    (input.availableFormats as QuantizationFormat[]) ?? [
      "fp32", "fp16", "int8", "int4", "q4_0", "q4_k_m", "q5_k_m", "q8_0",
    ],
  );

  return {
    success: true,
    data: {
      ...decision,
      deviceMemoryGB: Math.round(sysInfo.availableRamBytes / (1024 * 1024 * 1024)),
      options: decision.options.map((o) => ({
        format: o.format,
        memoryGB: Math.round(o.estimatedMemoryBytes / (1024 * 1024 * 1024) * 10) / 10,
        tokensPerSec: Math.round(o.expectedTokensPerSec * 10) / 10,
        qualityScore: Math.round(o.qualityScore * 100),
        qualityNote: o.qualityNote,
      })),
    },
  };
};

// ─── Tool: inference.download ─────────────────────────────────────────────────

const downloadTool: ToolManifest = {
  id: "inference.download",
  name: "Model Download",
  description: "Download model files with resumable chunked transfer, parallel connections, and SHA256 integrity verification",
  category: "llm",
  subcategory: "inference",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["download", "resumable", "chunked", "sha256", "model"],
  icon: "Download",
  color: "#14b8a6",
  parameters: [
    { name: "url", type: "string", description: "URL of the model file to download", required: true },
    { name: "filename", type: "string", description: "Local filename for the downloaded model", required: true },
    { name: "sha256", type: "string", description: "Expected SHA256 hash for integrity verification", required: false },
    { name: "action", type: "enum", description: "Download action", required: false, default: "start", enum: ["start", "pause", "status"] },
    { name: "parallelism", type: "number", description: "Number of parallel connections", required: false, default: 4 },
  ],
  capabilities: [
    { name: "model-download", description: "Download and verify model files", requiresBrowser: false, requiresNetwork: true, offline: false },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const downloadExecutor: ToolExecutor = async (input: ToolInput): Promise<ToolOutput> => {
  const url = input.url as string;
  const action = (input.action as string) ?? "start";

  if (action === "pause") {
    const state = downloader.pauseDownload(url);
    return { success: true, data: state ?? { error: "No active download found" } };
  }

  if (action === "status") {
    const state = downloader.getDownloadState(url)
      ?? downloader.getResumableState(url);
    return { success: true, data: state ?? { error: "No download found" } };
  }

  // Start or resume
  const resumeState = downloader.getResumableState(url);
  const state = await downloader.startDownload({
    url,
    filename: input.filename as string,
    sha256: input.sha256 as string | undefined,
    parallelism: (input.parallelism as number) ?? 4,
    resumeFrom: resumeState,
  });

  return {
    success: state.status === "completed",
    data: {
      status: state.status,
      downloadedMB: Math.round(state.downloadedBytes / (1024 * 1024)),
      totalMB: Math.round(state.totalBytes / (1024 * 1024)),
      sha256Verified: state.sha256Verified,
      error: state.error,
      elapsedMs: state.completedAt
        ? state.completedAt - state.startedAt
        : Date.now() - state.startedAt,
    },
  };
};

// ─── Tool: inference.legacy ───────────────────────────────────────────────────

const legacyTool: ToolManifest = {
  id: "inference.legacy",
  name: "Legacy Server Support",
  description: "Detect legacy server hardware and provide actionable guidance for running GGUF inference on old systems",
  category: "llm",
  subcategory: "inference",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["legacy", "server", "numa", "static-link", "cross-compile", "old-hardware"],
  icon: "Server",
  color: "#f59e0b",
  parameters: [
    { name: "action", type: "enum", description: "Action to perform", required: false, default: "detect", enum: ["detect", "guide"] },
  ],
  capabilities: [
    { name: "legacy-detection", description: "Detect legacy hardware and recommend build strategy", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const legacyExecutor: ToolExecutor = async (input: ToolInput): Promise<ToolOutput> => {
  const sysInfo = detectSystemInfo();
  const profile = detectLegacyProfile(sysInfo);

  if (input.action === "guide") {
    const guidance = getLegacyGuidance(profile, sysInfo);
    return {
      success: true,
      data: {
        ...guidance,
        profile: undefined,
        estimatedThroughputFactor: Math.round(guidance.estimatedThroughputFactor * 100) / 100,
      },
    };
  }

  return {
    success: true,
    data: {
      profile,
      summary: {
        needsStaticLink: profile.needsStaticLink,
        instructionSet: profile.detectedInstructionSet,
        hasAVX2: profile.hasAVX2,
        numaSockets: profile.numaTopology.length,
        fallbackStrategy: profile.fallbackStrategy,
        containerizationRecommended: profile.containerizationRecommended,
      },
    },
  };
};

// ─── Tool: catalog.browse ────────────────────────────────────────────────────

const catalogTool: ToolManifest = {
  id: "catalog.browse",
  name: "Harness Catalog",
  description: "Browse, search, and get details on all tools in the harness catalog — orchestration, memory, browser, coding, serving, observability, animation, scraping",
  category: "llm",
  subcategory: "catalog",
  version: "1.0.0",
  author: "stitaP",
  license: "MIT",
  tags: ["catalog", "store", "tools", "browse", "search"],
  icon: "Store",
  color: "#10b981",
  parameters: [
    { name: "action", type: "enum", description: "Browse action", required: false, default: "list", enum: ["list", "search", "get"] },
    { name: "category", type: "string", description: "Filter by catalog category", required: false },
    { name: "query", type: "string", description: "Search query (name, description, tags)", required: false },
    { name: "toolId", type: "string", description: "Get details for a specific tool by ID", required: false },
  ],
  capabilities: [
    { name: "catalog-browse", description: "Browse and search the harness tool catalog", requiresBrowser: false, requiresNetwork: false, offline: true },
  ],




  installs: 0,
  rating: 5,
  ratingCount: 0,
  updatedAt: "2026-08-24",
  slmFriendly: true,
};

const catalogExecutor: ToolExecutor = async (input: ToolInput): Promise<ToolOutput> => {
  const action = (input.action as string) ?? "list";

  if (action === "get" && input.toolId) {
    const entry = CATALOG_ENTRIES.find((e) => e.id === input.toolId);
    return {
      success: !!entry,
      data: entry ?? { error: `Tool '${input.toolId}' not found in catalog` },
    };
  }

  let results = [...CATALOG_ENTRIES];

  if (input.category) {
    results = results.filter((e) => e.catalogCategory === input.category);
  }

  if (input.query) {
    const q = (input.query as string).toLowerCase();
    results = results.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Compact SLM-friendly output
  return {
    success: true,
    data: {
      total: results.length,
      tools: results.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.catalogCategory,
        tags: e.tags,
        llmBased: e.isLLMBased,
      })),
    },
  };
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const INFERENCE_TOOLS: ToolManifest[] = [
  inferenceRouterTool,
  probeTool,
  quantTool,
  downloadTool,
  legacyTool,
  catalogTool,
];

export const INFERENCE_EXECUTORS: Record<string, ToolExecutor> = {
  "inference.router": inferenceRouterExecutor,
  "inference.probe": probeExecutor,
  "inference.quant": quantExecutor,
  "inference.download": downloadExecutor,
  "inference.legacy": legacyExecutor,
  "catalog.browse": catalogExecutor,
};
